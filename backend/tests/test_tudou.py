"""离线协议与流程测试；不调用真实模型，不证明权限、价格或生成效果。"""
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
from app.services import ark, furniture, image_gen, tudou


@pytest.fixture
def configured(monkeypatch):
    settings = get_settings()
    for field, value in {"image_provider": "tudou", "tudou_api_key": "offline-test-key",
                         "tudou_api_base_url": tudou.BASE_URL, "tudou_model_id": tudou.MODEL_ID,
                         "tudou_photo_transfer_approved": True, "tudou_estimated_cost_per_image": 0.2,
                         "tudou_timeout_seconds": 180}.items():
        monkeypatch.setattr(settings, field, value)
    return settings


def transport(monkeypatch, handler):
    original = httpx.Client
    monkeypatch.setattr(tudou.httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


def body(png_bytes, mode="camel"):
    encoded = base64.b64encode(png_bytes).decode()
    part = {"inlineData": {"mimeType": "image/png", "data": encoded}}
    if mode == "snake":
        part = {"inline_data": {"mime_type": "image/png", "data": encoded}}
    if mode == "markdown":
        part = {"text": f"![image](data:image/png;base64,{encoded})"}
    return {"candidates": [{"finishReason": "STOP", "content": {"parts": [part]}}]}


@pytest.mark.parametrize("count", [1, 13])
@pytest.mark.parametrize("mode", ["camel", "snake", "markdown"])
def test_native_payload_and_output(monkeypatch, png_bytes, configured, count, mode):
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(200, json=body(png_bytes, mode))
    transport(monkeypatch, handle)
    refs = furniture.FurnitureReferences(images=[png_bytes] * count, instructions="参考图2：床", individual=True)
    output = image_gen.generate_renovation_image(png_bytes, "中古风", ["床"], refs)
    assert len(calls) == 1
    request = calls[0]
    assert str(request.url) == f"{tudou.BASE_URL}/v1beta/models/{tudou.MODEL_ID}:generateContent"
    assert request.headers["Authorization"] == "Bearer offline-test-key"
    payload = json.loads(request.content)
    parts = payload["contents"][0]["parts"]
    assert len(parts) == count + 2
    assert [base64.b64decode(p["inlineData"]["data"]) for p in parts[:-1]] == [png_bytes] * (count + 1)
    assert "不要遗漏" in parts[-1]["text"]
    assert payload["generationConfig"] == {"responseModalities": ["TEXT", "IMAGE"], "imageConfig": {"aspectRatio": "1:1", "imageSize": "2K"}}
    assert "tools" not in payload
    with Image.open(BytesIO(output)) as image:
        assert image.format == "JPEG"


@pytest.mark.parametrize("status", [400, 401, 403, 404, 429, 500, 302])
def test_http_error_is_safe_no_retry(monkeypatch, png_bytes, configured, status):
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(status, headers={"Location": "https://untrusted.invalid", "x-request-id": "offline-test-key"}, json={"error": {"message": "private secret", "code": "offline-test-key"}})
    transport(monkeypatch, handle)
    with pytest.raises(ark.GenerationError) as caught:
        tudou.generate([png_bytes], "test", configured)
    assert caught.value.code.startswith("TUDOU_")
    assert caught.value.diagnostics.http_status == status
    assert caught.value.diagnostics.request_id is None
    assert caught.value.diagnostics.upstream_code is None
    assert "private" not in str(caught.value)
    assert len(calls) == 1


@pytest.mark.parametrize("variant", ["non_json", "empty", "text", "url", "multiple", "bad_base64", "not_image", "mime", "blocked", "unfinished", "http200error", "null_feedback"])
def test_bad_output_never_downloaded(monkeypatch, png_bytes, configured, variant):
    result = body(png_bytes)
    parts = result["candidates"][0]["content"]["parts"]
    if variant == "empty": result = {}
    elif variant == "text": parts[:] = [{"text": "sorry"}]
    elif variant == "url": parts[:] = [{"text": "![image](http://127.0.0.1/private)"}]
    elif variant == "multiple": parts.append(parts[0])
    elif variant == "bad_base64": parts[0]["inlineData"]["data"] = "@@@"
    elif variant == "not_image": parts[0]["inlineData"]["data"] = "aGVsbG8="
    elif variant == "mime": parts[0]["inlineData"]["mimeType"] = "image/jpeg"
    elif variant == "blocked": result["promptFeedback"] = {"blockReason": "SAFETY"}
    elif variant == "unfinished": result["candidates"][0]["finishReason"] = "MAX_TOKENS"
    elif variant == "http200error": result = {"error": {"message": "private"}}
    elif variant == "null_feedback": result["promptFeedback"] = None
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(200, text="not json") if variant == "non_json" else httpx.Response(200, json=result)
    transport(monkeypatch, handle)
    with pytest.raises(ark.GenerationError):
        tudou.generate([png_bytes], "test", configured)
    assert len(calls) == 1


def test_thinking_image_is_not_final(monkeypatch, png_bytes, configured):
    result = body(png_bytes)
    part = result["candidates"][0]["content"]["parts"][0]
    result["candidates"][0]["content"]["parts"].insert(0, {**part, "thought": True})
    transport(monkeypatch, lambda _: httpx.Response(200, json=result))
    assert tudou.generate([png_bytes], "test", configured).startswith(b"\xff\xd8")


@pytest.mark.parametrize("field,value", [("tudou_api_key", ""), ("tudou_api_base_url", "https://other.invalid"), ("tudou_model_id", "different"), ("tudou_photo_transfer_approved", False), ("tudou_estimated_cost_per_image", 0), ("tudou_estimated_cost_per_image", float("nan")), ("tudou_timeout_seconds", 0)])
def test_bad_configuration_blocks_before_network(monkeypatch, png_bytes, configured, field, value):
    monkeypatch.setattr(configured, field, value)
    monkeypatch.setattr(tudou.httpx, "Client", lambda **_: pytest.fail("network forbidden"))
    with pytest.raises(ValueError):
        image_gen.generate_renovation_image(png_bytes, "中古风", ["床"])


@pytest.mark.parametrize("initialization", [False, True])
def test_transport_failure_safe(monkeypatch, png_bytes, configured, initialization):
    def fail(*args, **kwargs):
        raise httpx.ReadTimeout("private proxy credentials")
    if initialization:
        monkeypatch.setattr(tudou.httpx, "Client", fail)
    else:
        transport(monkeypatch, fail)
    with pytest.raises(ark.GenerationError) as caught:
        tudou.generate([png_bytes], "test", configured)
    assert caught.value.code == "TUDOU_TIMEOUT"
    assert "private" not in str(caught.value)


def test_options_and_unknown_cost_preflight(client, upload_photo, png_bytes, monkeypatch, configured):
    options = client.get("/api/v1/generation-options").json()
    assert options["configured"] and options["individual_references"]
    assert options["max_product_images"] == 13
    assert options["model"] == tudou.MODEL_ID
    assert options["estimated_cost"] == 0.2
    assert "国内" not in options["provider_label"]
    monkeypatch.setattr(configured, "tudou_estimated_cost_per_image", 0)
    options = client.get("/api/v1/generation-options").json()
    assert not options["configured"]
    assert "费用尚未确认" in options["message"]
    photo_id = upload_photo(png_bytes)
    result = client.post("/api/v1/tasks", json={"photo_id": photo_id, "style_id": "nordic", "element_ids": ["bed"]})
    assert result.status_code == 503
    assert photo_store.get(photo_id) == png_bytes


def test_task_metadata_and_safe_failure_persist(client, upload_photo, png_bytes, monkeypatch, configured):
    def fail(*args):
        raise ark.GenerationError("TUDOU_TIMEOUT", "土豆响应超时，请核对账单")
    monkeypatch.setattr(image_gen, "generate_renovation_image", fail)
    result = client.post("/api/v1/tasks", json={"photo_id": upload_photo(png_bytes), "style_id": "nordic", "element_ids": ["bed"], "furniture_selections": [{"element_id": "bed", "option_id": "bed-1"}]})
    assert result.status_code == 200
    created = result.json()
    assert created["generation_provider"] == "tudou"
    assert created["generation_model"] == tudou.MODEL_ID
    assert created["input_image_count"] == 2
    retrieved = client.get(f"/api/v1/tasks/{created['task_id']}").json()
    assert retrieved["status"] == "failed"
    assert retrieved["error"]["code"] == "TUDOU_TIMEOUT"
    child = subprocess.run([sys.executable, "-c",
        "import json,sys\nfrom fastapi.testclient import TestClient\nfrom app.main import app\n"
        "with TestClient(app) as c:\n print(json.dumps(c.get('/api/v1/tasks/'+sys.argv[1]).json()))",
        created["task_id"]], capture_output=True, text=True, check=True, timeout=15)
    restored = json.loads(child.stdout.strip().splitlines()[-1])
    assert restored["error"]["code"] == "TUDOU_TIMEOUT"
    assert restored["generation_model"] == tudou.MODEL_ID
    assert restored["input_image_count"] == 2


def test_large_response_rejected(monkeypatch, png_bytes, configured):
    monkeypatch.setattr(tudou, "MAX_RESPONSE_BYTES", 10)
    transport(monkeypatch, lambda _: httpx.Response(200, json=body(png_bytes)))
    with pytest.raises(ark.GenerationError, match="大小限制"):
        tudou.generate([png_bytes], "test", configured)


def test_input_limit_before_network(monkeypatch, png_bytes, configured):
    monkeypatch.setattr(tudou.httpx, "Client", lambda **_: pytest.fail("network forbidden"))
    with pytest.raises(ValueError, match="13"):
        tudou.generate([png_bytes] * 15, "test", configured)


def test_non_square_aspect_ratio(monkeypatch, png_bytes, configured):
    room = BytesIO()
    Image.new("RGB", (800, 600)).save(room, "JPEG")
    def handle(request):
        payload = json.loads(request.content)
        assert payload["generationConfig"]["imageConfig"]["aspectRatio"] == "4:3"
        assert payload["contents"][0]["parts"][0]["inlineData"]["mimeType"] == "image/jpeg"
        return httpx.Response(200, json=body(png_bytes))
    transport(monkeypatch, handle)
    tudou.generate([room.getvalue()], "test", configured)


def test_confirmed_price_above_budget_rejected(client, upload_photo, png_bytes, monkeypatch, configured):
    monkeypatch.setattr(configured, "tudou_estimated_cost_per_image", 0.31)
    photo_id = upload_photo(png_bytes)
    result = client.post("/api/v1/tasks", json={"photo_id": photo_id, "style_id": "nordic", "element_ids": ["bed"]})
    assert result.status_code == 402
    assert photo_store.get(photo_id) == png_bytes
