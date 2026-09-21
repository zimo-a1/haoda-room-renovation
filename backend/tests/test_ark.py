"""仅离线协议测试，不发送真实密钥、不触发付费、不证明商品还原效果。"""

import base64
import json
import subprocess
import sys
from io import BytesIO

import httpx
import pytest
from PIL import Image

from app.core import photo_store
from app.core.config import get_settings
from app.db import SessionLocal, engine
from app.models.task import GenerationTask
from app.schemas.api import FurnitureSelection
from app.services import ark, catalog, furniture, image_gen


@pytest.fixture()
def ark_settings(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "image_provider", "ark")
    monkeypatch.setattr(settings, "ark_api_key", "offline-test-key")
    monkeypatch.setattr(settings, "ark_model_id", ark.ARK_MODEL_ID)
    monkeypatch.setattr(settings, "ark_api_url", ark.ARK_BASE_URL)
    monkeypatch.setattr(settings, "ark_estimated_cost_per_image", 0.30)
    return settings


def selections(count):
    data = json.loads(get_settings().furniture_catalog_path.read_text())
    elements = catalog.ELEMENTS[:count]
    return furniture.resolve_selections([
        FurnitureSelection(element_id=e["id"], option_id=data[e["id"]]["options"][1]["id"])
        for e in elements
    ], elements)


def mock_transport(monkeypatch, handler):
    original = httpx.Client
    monkeypatch.setattr(ark.httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


def result_response(png_bytes):
    return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(png_bytes).decode()}]})


@pytest.mark.parametrize("count", [1, 11, 12, 13])
def test_ark_sends_every_product_individually_once(monkeypatch, png_bytes, ark_settings, count):
    selected = selections(count)
    refs = furniture.prepare_references(selected, individual=True)
    assert len(refs.images) == count
    assert refs.individual is True
    assert "F01" not in refs.instructions
    for index, item in enumerate(selected, start=2):
        assert f"参考图{index}：{item.room}的{item.element_name}，指定款式为{item.option_name}" in refs.instructions
        with Image.open(BytesIO(refs.images[index - 2])) as image:
            assert image.width == image.height  # 单格裁图，没有横向参考板。
    calls = []
    def handle(request):
        calls.append(request)
        return result_response(png_bytes)
    mock_transport(monkeypatch, handle)
    result = image_gen.generate_renovation_image(png_bytes, "中古风", [s.element_name for s in selected], refs)
    assert len(calls) == 1
    request = calls[0]
    assert request.method == "POST"
    assert str(request.url) == f"{ark.ARK_BASE_URL}/images/generations"
    assert request.headers["Authorization"] == "Bearer offline-test-key"
    payload = json.loads(request.content)
    assert payload["model"] == "doubao-seedream-5-0-260128"
    assert [base64.b64decode(item.split(",", 1)[1]) for item in payload["image"]] == [png_bytes, *refs.images]
    assert payload["sequential_image_generation"] == "disabled"
    assert payload["response_format"] == "b64_json"
    assert payload["size"] == "2K"
    assert payload["stream"] is False
    assert payload["watermark"] is False  # 用户确认关闭新结果图内可见角标。
    assert "tools" not in payload and "n" not in payload  # 无联网搜索或额外张数费用。
    assert "床品参考图" in payload["prompt"]
    assert "不要遗漏" in payload["prompt"]
    assert "小范围调整位置和朝向" in payload["prompt"]
    assert "商品身份与结构、房间边界优先" in payload["prompt"]
    assert "64:64" in payload["prompt"]
    with Image.open(BytesIO(result)) as output:
        assert output.format == "JPEG"  # 与存储路径和图片接口的 MIME 一致。


def test_14_products_are_rejected_without_crop(monkeypatch):
    monkeypatch.setattr(furniture, "_crop_selection", lambda _: pytest.fail("must reject before reading assets"))
    with pytest.raises(furniture.InvalidFurnitureSelection, match="13"):
        furniture.prepare_references(selections(14), individual=True)


@pytest.mark.parametrize("status,expected", [(401, "ARK_AUTHENTICATION_FAILED"), (403, "ARK_PERMISSION_DENIED"), (404, "ARK_HTTP_NOT_FOUND"), (429, "ARK_RATE_LIMIT"), (400, "ARK_REQUEST_REJECTED"), (500, "ARK_UPSTREAM_ERROR"), (302, "ARK_REDIRECT_REJECTED")])
def test_upstream_errors_safe_and_never_retried(monkeypatch, png_bytes, ark_settings, status, expected):
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(status, headers={"Location": "https://untrusted.invalid/"}, json={"error": {"code": "Unknown", "message": "sensitive upstream message"}})
    mock_transport(monkeypatch, handle)
    with pytest.raises(ark.GenerationError) as caught:
        ark.generate([png_bytes], "test", ark_settings)
    assert caught.value.code == expected
    assert "sensitive" not in str(caught.value)
    assert caught.value.diagnostics.http_status == status
    assert caught.value.diagnostics.upstream_code == "Unknown"
    assert "sensitive" not in caught.value.diagnostics.model_dump_json()
    assert len(calls) == 1


@pytest.mark.parametrize("body", [None, {}, {"data": []}, {"data": [{"url": "http://127.0.0.1/private"}]}, {"data": [{"b64_json": "@@@"}]}, {"data": [{"b64_json": "bm90LWFuLWltYWdl"}]}, {"data": [{"b64_json": "aaaa"}] * 2}, {"data": [{"b64_json": 3}]}])
def test_invalid_response_not_saved_or_downloaded(monkeypatch, png_bytes, ark_settings, body):
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(200, json=body) if body is not None else httpx.Response(200, text="not-json")
    mock_transport(monkeypatch, handle)
    with pytest.raises(ark.GenerationError, match="图片数据"):
        ark.generate([png_bytes], "test", ark_settings)
    assert len(calls) == 1


def test_error_inside_http_200_is_failure(monkeypatch, png_bytes, ark_settings):
    mock_transport(monkeypatch, lambda _: httpx.Response(200, json={"error": {"code": "ModelNotOpen", "message": "sensitive"}}))
    with pytest.raises(ark.GenerationError) as caught:
        ark.generate([png_bytes], "test", ark_settings)
    assert caught.value.code == "ARK_MODEL_NOT_OPEN"


def test_timeout_is_not_retried(monkeypatch, png_bytes, ark_settings):
    calls = []
    def handle(request):
        calls.append(request)
        raise httpx.ReadTimeout("private transport details")
    mock_transport(monkeypatch, handle)
    with pytest.raises(ark.GenerationError) as caught:
        ark.generate([png_bytes], "test", ark_settings)
    assert caught.value.code == "ARK_TIMEOUT"
    assert "private" not in str(caught.value)
    assert len(calls) == 1


def test_client_initialization_failure_is_sanitized(monkeypatch, png_bytes, ark_settings):
    def fail(**_):
        raise RuntimeError("private proxy credentials")
    monkeypatch.setattr(ark.httpx, "Client", fail)
    with pytest.raises(ark.GenerationError, match="无法连接"):
        ark.generate([png_bytes], "test", ark_settings)


@pytest.mark.parametrize("field,value", [("ark_api_key", ""), ("ark_api_url", "https://www.volcengine.com/"), ("ark_model_id", "doubao-seedream-5-0-lite-260128"), ("ark_timeout_seconds", 0), ("ark_estimated_cost_per_image", float("nan"))])
def test_bad_configuration_never_calls_model(monkeypatch, png_bytes, ark_settings, field, value):
    monkeypatch.setattr(ark_settings, field, value)
    monkeypatch.setattr(ark.httpx, "Client", lambda **_: pytest.fail("unexpected network call"))
    with pytest.raises(ValueError):
        image_gen.generate_renovation_image(png_bytes, "中古风", ["床"])


def test_unconfigured_provider_does_not_silently_mock(monkeypatch, png_bytes):
    monkeypatch.setattr(get_settings(), "image_provider", "unknown-provider")
    with pytest.raises(ValueError):
        image_gen.generate_renovation_image(png_bytes, "中古风", ["床"])


def test_preflight_does_not_consume_photo_or_reserve_budget(client, upload_photo, png_bytes, monkeypatch, ark_settings):
    monkeypatch.setattr(ark_settings, "ark_api_key", "")
    photo_id = upload_photo(png_bytes)
    with SessionLocal() as db:
        before = db.query(GenerationTask).count()
    response = client.post("/api/v1/tasks", json={"photo_id": photo_id, "style_id": "nordic", "element_ids": ["bed"]})
    assert response.status_code == 503
    assert photo_store.get(photo_id) == png_bytes
    with SessionLocal() as db:
        assert db.query(GenerationTask).count() == before


def test_failed_task_retains_safe_error_and_model_after_restart(client, png_bytes, upload_photo, monkeypatch, ark_settings):
    def fail(*_):
        raise ark.GenerationError("ARK_TIMEOUT", "火山方舟响应超时，请核对账单")
    monkeypatch.setattr(image_gen, "generate_renovation_image", fail)
    selected = selections(13)
    created = client.post("/api/v1/tasks", json={
        "photo_id": upload_photo(png_bytes), "style_id": "nordic", "element_ids": [s.element_id for s in selected],
        "furniture_selections": [{"element_id": s.element_id, "option_id": s.option_id} for s in selected],
    })
    assert created.status_code == 200
    data = created.json()
    assert data["generation_model"] == ark.ARK_MODEL_ID
    assert data["generation_provider"] == "ark"
    assert data["input_image_count"] == 14
    assert data["cost"] == 0.30  # 1 张输出的预算估算，不按 14 张输入倍增。
    engine.dispose()
    child = subprocess.run([
        sys.executable, "-c",
        "import json,sys\nfrom fastapi.testclient import TestClient\nfrom app.main import app\n"
        "with TestClient(app) as c:\n print(json.dumps(c.get('/api/v1/tasks/'+sys.argv[1]).json()))",
        data["task_id"],
    ], capture_output=True, text=True, check=True, timeout=15)
    restored = json.loads(child.stdout)
    assert restored["status"] == "failed"
    assert restored["error"]["code"] == "ARK_TIMEOUT"
    assert restored["diagnostics"] is None  # 旧记录不能补造上游信息。
    assert restored["generation_model"] == ark.ARK_MODEL_ID
    assert len(restored["furniture_selections"]) == 13


def test_options_are_safe_without_key(client, monkeypatch, ark_settings):
    monkeypatch.setattr(ark_settings, "ark_api_key", "")
    response = client.get("/api/v1/generation-options")
    data = response.json()
    assert response.status_code == 200
    assert data["configured"] is False
    assert data["model"] == ark.ARK_MODEL_ID
    assert data["max_product_images"] == 13
    assert data["individual_references"] is True
    assert "api_key" not in data and "api_url" not in data


def test_13_product_task_calls_ark_and_stores_single_valid_image(client, png_bytes, upload_photo, monkeypatch, ark_settings):
    selected = selections(13)
    calls = []
    def handle(request):
        calls.append(request)
        return result_response(png_bytes)
    mock_transport(monkeypatch, handle)
    response = client.post("/api/v1/tasks", json={
        "photo_id": upload_photo(png_bytes), "style_id": "nordic", "element_ids": [s.element_id for s in selected],
        "furniture_selections": [{"element_id": s.element_id, "option_id": s.option_id} for s in selected],
    })
    assert response.status_code == 200
    assert len(calls) == 1
    assert len(json.loads(calls[0].content)["image"]) == 14
    task = client.get(f"/api/v1/tasks/{response.json()['task_id']}").json()
    assert task["status"] == "succeeded"
    assert task["error"] is None
    result = client.get(task["result_image_url"])
    assert result.headers["content-type"] == "image/jpeg"
    with Image.open(BytesIO(result.content)) as image:
        assert image.format == "JPEG"


def test_14_product_request_rejected_before_charge(client, png_bytes, upload_photo, monkeypatch, ark_settings):
    photo_id = upload_photo(png_bytes)
    selected = selections(14)
    monkeypatch.setattr(ark.httpx, "Client", lambda **_: pytest.fail("unexpected network call"))
    with SessionLocal() as db:
        count = db.query(GenerationTask).count()
    response = client.post("/api/v1/tasks", json={
        "photo_id": photo_id, "style_id": "nordic", "element_ids": [s.element_id for s in selected],
        "furniture_selections": [{"element_id": s.element_id, "option_id": s.option_id} for s in selected],
    })
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TOO_MANY_REFERENCE_IMAGES"
    assert photo_store.get(photo_id) == png_bytes
    with SessionLocal() as db:
        assert db.query(GenerationTask).count() == count


def test_ark_budget_limit_before_charge(client, png_bytes, upload_photo, monkeypatch, ark_settings):
    monkeypatch.setattr(ark_settings, "ark_estimated_cost_per_image", 0.31)
    photo_id = upload_photo(png_bytes)
    response = client.post("/api/v1/tasks", json={"photo_id": photo_id, "style_id": "nordic", "element_ids": ["bed"]})
    assert response.status_code == 402
    assert photo_store.get(photo_id) == png_bytes


def test_reference_boards_not_silently_sent_to_ark(png_bytes, ark_settings):
    with pytest.raises(ValueError, match="拼图"):
        image_gen.generate_renovation_image(png_bytes, "中古风", ["床"], furniture.FurnitureReferences([png_bytes], "参考板"))


@pytest.mark.parametrize("dimensions", [(14, 64), (15, 300)])
def test_ark_invalid_image_dimensions_rejected_before_network(monkeypatch, ark_settings, dimensions):
    buf = BytesIO()
    Image.new("RGB", dimensions).save(buf, "PNG")
    monkeypatch.setattr(ark.httpx, "Client", lambda **_: pytest.fail("unexpected network call"))
    with pytest.raises(ValueError, match="尺寸"):
        ark.generate([buf.getvalue()], "test", ark_settings)


def test_interrupted_task_is_recoverable_without_reposting(client):
    from app.db import init_db
    from app.models.task import TaskGenerationDetails
    with SessionLocal() as db:
        db.add(GenerationTask(id="ark-interrupted-test", style_id="nordic", element_ids='["bed"]', status="processing", cost=0.30))
        db.flush()
        db.add(TaskGenerationDetails(task_id="ark-interrupted-test", provider="ark", model_id=ark.ARK_MODEL_ID, input_image_count=2))
        db.commit()
    init_db()
    data = client.get("/api/v1/tasks/ark-interrupted-test").json()
    assert data["status"] == "failed"
    assert data["error"]["code"] == "GENERATION_INTERRUPTED"
    assert data["generation_model"] == ark.ARK_MODEL_ID
