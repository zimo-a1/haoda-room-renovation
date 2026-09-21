"""诊断仅使用离线响应；不发送真实模型请求。"""

import json
import subprocess
import sys

import httpx
import pytest

from app.db import SessionLocal, engine
from app.models.task import TaskProviderDiagnostics
from app.services import ark
from .test_ark import ark_settings, mock_transport  # 复用离线 Key fixture。


@pytest.mark.parametrize("status,code,expected", [
    (404, "ModelNotFound", "ARK_MODEL_NOT_FOUND"),
    (403, "ModelNotOpen", "ARK_MODEL_NOT_OPEN"),
    (400, "ModelNotOpen.Denied", "ARK_MODEL_NOT_OPEN"),
    (404, "InvalidEndpointOrModel.NotFound", "ARK_MODEL_OR_ENDPOINT_UNAVAILABLE"),
    (404, "InvalidEndpoint.NotFound", "ARK_ENDPOINT_UNAVAILABLE"),
    (404, "UnrelatedModelNotFoundText", "ARK_HTTP_NOT_FOUND"),
    (401, "ModelNotOpen", "ARK_AUTHENTICATION_FAILED"),
    (200, "Unknown", "ARK_GENERATION_FAILED"),
])
def test_precise_error_classification(monkeypatch, png_bytes, ark_settings, status, code, expected):
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(status, headers={"x-request-id": "request-test-123"}, json={"error": {"code": code, "message": "private body"}})
    mock_transport(monkeypatch, handle)
    with pytest.raises(ark.GenerationError) as caught:
        ark.generate([png_bytes], "private prompt", ark_settings)
    assert caught.value.code == expected
    assert caught.value.diagnostics.model_dump() == {
        "http_status": status, "upstream_code": code, "request_id": "request-test-123", "response_kind": "json",
    }
    assert len(calls) == 1


def test_non_json_404_is_not_claimed_as_unopened_model(monkeypatch, png_bytes, ark_settings):
    mock_transport(monkeypatch, lambda _: httpx.Response(404, headers={"x-tt-logid": "20260919-test"}, text="<html>private proxy data</html>"))
    with pytest.raises(ark.GenerationError) as caught:
        ark.generate([png_bytes], "test", ark_settings)
    assert caught.value.code == "ARK_HTTP_NOT_FOUND"
    assert caught.value.diagnostics.response_kind == "non_json"
    assert caught.value.diagnostics.upstream_code is None
    assert caught.value.diagnostics.request_id == "20260919-test"
    assert "private" not in str(caught.value) + caught.value.diagnostics.model_dump_json()


@pytest.mark.parametrize("value", [
    "offline-test-key", "prefix-offline-test-key-suffix", "sk-sensitive-token", "Bearer-private",
    "data:image/png;base64,aaaa", "https://private.invalid", "token\n", "x" * 129,
    123, {"private": "data"}, ["private"],
])
def test_untrusted_diagnostic_fields_are_dropped(monkeypatch, png_bytes, ark_settings, value):
    mock_transport(monkeypatch, lambda _: httpx.Response(404, json={
        "request_id": value, "error": {"code": value, "message": "private upstream body"},
        "authorization": "private header", "prompt": "private prompt", "image": "private image",
    }))
    with pytest.raises(ark.GenerationError) as caught:
        ark.generate([png_bytes], "test", ark_settings)
    assert caught.value.diagnostics.model_dump() == {
        "http_status": 404, "upstream_code": None, "request_id": None, "response_kind": "json",
    }


def test_sensitive_header_is_filtered_before_safe_body_fallback(monkeypatch, png_bytes, ark_settings):
    monkeypatch.setattr(ark_settings, "taobaoke_app_secret", "another-provider-secret")
    mock_transport(monkeypatch, lambda _: httpx.Response(403, headers={"x-request-id": "another-provider-secret"}, json={
        "request_id": "safe-request-id", "error": {"code": "AccessDenied"},
    }))
    with pytest.raises(ark.GenerationError) as caught:
        ark.generate([png_bytes], "test", ark_settings)
    assert caught.value.diagnostics.request_id == "safe-request-id"


def test_item_error_in_200_preserves_code_and_request_id(monkeypatch, png_bytes, ark_settings):
    mock_transport(monkeypatch, lambda _: httpx.Response(200, json={
        "data": [{"error": {"code": "ModelNotOpen", "request_id": "item-request-id", "message": "private"}, "b64_json": "aaaa"}],
    }))
    with pytest.raises(ark.GenerationError) as caught:
        ark.generate([png_bytes], "test", ark_settings)
    assert caught.value.code == "ARK_MODEL_NOT_OPEN"
    assert caught.value.diagnostics.http_status == 200
    assert caught.value.diagnostics.request_id == "item-request-id"


def test_invalid_image_response_keeps_request_id(monkeypatch, png_bytes, ark_settings):
    mock_transport(monkeypatch, lambda _: httpx.Response(200, headers={"x-request-id": "broken-image-id"}, json={"data": []}))
    with pytest.raises(ark.GenerationError) as caught:
        ark.generate([png_bytes], "test", ark_settings)
    assert caught.value.code == "ARK_INVALID_RESPONSE"
    assert caught.value.diagnostics.request_id == "broken-image-id"


def test_transport_error_does_not_invent_http_status(monkeypatch, png_bytes, ark_settings):
    def handle(_):
        raise httpx.ReadTimeout("private connection info")
    mock_transport(monkeypatch, handle)
    with pytest.raises(ark.GenerationError) as caught:
        ark.generate([png_bytes], "test", ark_settings)
    assert caught.value.diagnostics.model_dump() == {
        "http_status": None, "upstream_code": None, "request_id": None, "response_kind": "transport",
    }


def test_failed_diagnostics_are_persisted_and_survive_new_process(client, upload_photo, png_bytes, monkeypatch, ark_settings):
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(404, headers={"x-request-id": "persisted-request-id"}, json={
            "error": {"code": "InvalidEndpointOrModel.NotFound", "message": "private payload offline-test-key"},
        })
    mock_transport(monkeypatch, handle)
    created = client.post("/api/v1/tasks", json={"photo_id": upload_photo(png_bytes), "style_id": "nordic", "element_ids": ["bed"]})
    assert created.status_code == 200
    task_id = created.json()["task_id"]
    data = client.get(f"/api/v1/tasks/{task_id}").json()
    assert data["status"] == "failed"
    assert data["result_image_url"] is None
    assert data["error"]["code"] == "ARK_MODEL_OR_ENDPOINT_UNAVAILABLE"
    expected = {"http_status": 404, "upstream_code": "InvalidEndpointOrModel.NotFound", "request_id": "persisted-request-id", "response_kind": "json"}
    assert data["diagnostics"] == expected
    assert "private" not in json.dumps(data) and "offline-test-key" not in json.dumps(data)
    with SessionLocal() as db:
        record = db.get(TaskProviderDiagnostics, task_id)
        assert {key: getattr(record, key) for key in expected} == expected
    engine.dispose()
    child = subprocess.run([
        sys.executable, "-c",
        "import json,sys\nfrom fastapi.testclient import TestClient\nfrom app.main import app\n"
        "with TestClient(app) as c:\n print(json.dumps(c.get('/api/v1/tasks/'+sys.argv[1]).json()))",
        task_id,
    ], capture_output=True, text=True, check=True, timeout=15)
    restored = json.loads(child.stdout)
    assert restored["diagnostics"] == expected
    assert restored["generation_model"] == ark.ARK_MODEL_ID
    assert len(calls) == 1  # 查询及重启都不能重新出图。
