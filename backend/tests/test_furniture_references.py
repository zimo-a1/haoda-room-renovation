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
from app.services import catalog, furniture, image_gen


def selected(element_id="sofa", option_id="sofa-2"):
    return furniture.resolve_selections(
        [FurnitureSelection(element_id=element_id, option_id=option_id)],
        catalog.get_elements([element_id]),
    )


@pytest.mark.parametrize("panel", [0, 1, 2])
def test_only_selected_panel_is_sent(tmp_path, monkeypatch, panel):
    atlas = Image.new("RGB", (90, 30))
    colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255)]
    for index, color in enumerate(colors):
        atlas.paste(color, (index * 30, 0, (index + 1) * 30, 30))
    atlas.save(tmp_path / "sofa-v1.png")
    monkeypatch.setattr(get_settings(), "furniture_image_dir", tmp_path)
    refs = furniture.prepare_references(selected(option_id=f"sofa-{panel + 1}"))
    assert len(refs.images) == 1
    with Image.open(BytesIO(refs.images[0])) as image:
        assert image.size == (30, 30)
        assert all(abs(a - b) <= 2 for a, b in zip(image.getpixel((15, 15)), colors[panel]))


def test_all_24_selections_are_in_two_boards():
    # 目录中的 option ID 是事实来源，不假设与元素 ID 同名（共用图集的类别亦独立）。
    data = json.loads(get_settings().furniture_catalog_path.read_text())
    selections = [FurnitureSelection(element_id=e["id"], option_id=data[e["id"]]["options"][1]["id"]) for e in catalog.ELEMENTS]
    resolved = furniture.resolve_selections(selections, catalog.ELEMENTS)
    refs = furniture.prepare_references(resolved)
    assert len(refs.images) == 2
    for index, item in enumerate(resolved, start=1):
        assert f"F{index:02d}" in refs.instructions
        assert item.option_name in refs.instructions
    assert "参考图2的F12" in refs.instructions
    assert "参考图3的F13" in refs.instructions
    assert "参考图3的F24" in refs.instructions


@pytest.mark.parametrize("selections", [
    [], [{"element_id": "sofa", "option_id": "bed-2"}],
    [{"element_id": "bed", "option_id": "bed-2"}],
    [{"element_id": "sofa", "option_id": "sofa-2"}] * 2,
])
def test_invalid_selection_does_not_consume_photo_or_create_task(client, png_bytes, upload_photo, selections):
    photo_id = upload_photo(png_bytes)
    with SessionLocal() as db:
        count = db.query(GenerationTask).count()
    response = client.post("/api/v1/tasks", json={
        "photo_id": photo_id, "style_id": "nordic", "element_ids": ["sofa"], "furniture_selections": selections,
    })
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_FURNITURE_SELECTION"
    assert photo_store.get(photo_id) == png_bytes
    with SessionLocal() as db:
        assert db.query(GenerationTask).count() == count


def test_reject_client_supplied_reference_url(client, png_bytes, upload_photo):
    response = client.post("/api/v1/tasks", json={
        "photo_id": upload_photo(png_bytes), "style_id": "nordic", "element_ids": ["sofa"],
        "furniture_selections": [{"element_id": "sofa", "option_id": "sofa-2", "image": "http://localhost/private"}],
    })
    assert response.status_code == 422


def test_missing_asset_fails_before_model_call(client, png_bytes, upload_photo, tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "furniture_image_dir", tmp_path)
    photo_id = upload_photo(png_bytes)
    response = client.post("/api/v1/tasks", json={
        "photo_id": photo_id, "style_id": "nordic", "element_ids": ["sofa"],
        "furniture_selections": [{"element_id": "sofa", "option_id": "sofa-2"}],
    })
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "FURNITURE_ASSETS_UNAVAILABLE"
    assert photo_store.get(photo_id) == png_bytes


def test_selection_reaches_generator_and_survives_app_restart(client, png_bytes, upload_photo, monkeypatch):
    received = []
    def generate(photo, style, elements, references):
        received.append((photo, style, elements, references))
        return image_gen._mock_result(photo)
    monkeypatch.setattr(image_gen, "generate_renovation_image", generate)
    response = client.post("/api/v1/tasks", json={
        "photo_id": upload_photo(png_bytes), "style_id": "nordic", "element_ids": ["sofa"],
        "furniture_selections": [{"element_id": "sofa", "option_id": "sofa-2"}],
    })
    assert response.status_code == 200
    task_id = response.json()["task_id"]
    assert response.json()["furniture_selections"][0]["option_name"] == "焦糖皮质沙发"
    assert received[0][:3] == (png_bytes, "北欧风", ["沙发"])
    assert "焦糖皮质沙发" in received[0][3].instructions
    assert len(received[0][3].images) == 1
    photo_store.clear()
    engine.dispose()
    # 独立 Python 进程连接同一测试 SQLite，不依赖父进程内存里的选款。
    restarted = subprocess.run([
        sys.executable, "-c",
        "import json, sys\nfrom fastapi.testclient import TestClient\nfrom app.main import app\n"
        "with TestClient(app) as c:\n print(json.dumps(c.get('/api/v1/tasks/' + sys.argv[1]).json()))",
        task_id,
    ], check=True, capture_output=True, text=True, timeout=15)
    restored = json.loads(restarted.stdout)
    assert restored["status"] == "succeeded"
    assert restored["furniture_selections"] == response.json()["furniture_selections"]


def _decode(value):
    return base64.b64decode(value.split(",", 1)[1])


@pytest.mark.parametrize("count", [1, 2, 3])
def test_siliconflow_wire_payload_contains_room_and_specific_references(png_bytes, monkeypatch, count):
    received = []
    data = json.loads(get_settings().furniture_catalog_path.read_text())
    elements = catalog.ELEMENTS[:count]
    refs = furniture.prepare_references(furniture.resolve_selections([
        FurnitureSelection(element_id=e["id"], option_id=data[e["id"]]["options"][1]["id"]) for e in elements
    ], elements))
    def handle(request):
        if request.method == "POST":
            received.append(json.loads(request.content))
            return httpx.Response(200, json={"images": [{"url": "https://example.test/result.jpg"}]})
        return httpx.Response(200, content=png_bytes)
    client_class = httpx.Client
    monkeypatch.setattr(image_gen.httpx, "Client", lambda **kw: client_class(transport=httpx.MockTransport(handle), **kw))
    result = image_gen._call_siliconflow(png_bytes, "中古风", ["沙发"], "https://example.test/v1", "test-only", "Qwen/Qwen-Image-Edit-2509", refs)
    assert result == png_bytes
    assert len(received) == 1  # 多图输入仍只调用一次生成，不串行加价。
    payload = received[0]
    assert _decode(payload["image"]) == png_bytes
    assert _decode(payload["image2"]) == refs.images[0]
    if count == 1:
        assert "image3" not in payload
    else:
        assert _decode(payload["image3"]) == refs.images[1]
    assert "焦糖皮质沙发" in payload["prompt"]
    assert "未选家具" in payload["prompt"]
    assert "不要自行换成同类其他款式" in payload["prompt"]
    assert "image_size" not in payload


def test_modelscope_keeps_room_first_and_adds_references(png_bytes, monkeypatch):
    received = []
    refs = furniture.FurnitureReferences([png_bytes, png_bytes], "参考图2：沙发；参考图3：床")
    def handle(request):
        if request.method == "POST":
            received.append(json.loads(request.content))
            return httpx.Response(200, json={"task_id": "test-task"})
        if "/tasks/" in str(request.url):
            return httpx.Response(200, json={"task_status": "SUCCEED", "output_images": ["https://example.test/result.jpg"]})
        return httpx.Response(200, content=png_bytes)
    client_class = httpx.Client
    monkeypatch.setattr(image_gen.httpx, "Client", lambda **kw: client_class(transport=httpx.MockTransport(handle), **kw))
    monkeypatch.setattr(image_gen.time, "sleep", lambda _: None)
    image_gen._call_modelscope(png_bytes, "中古风", ["沙发", "床"], "https://example.test/v1", "test-only", "Qwen/Qwen-Image-Edit-2511", refs)
    assert len(received) == 1
    assert [_decode(image) for image in received[0]["image_url"]] == [png_bytes] * 3


def test_unsupported_model_does_not_silently_drop_references(client, png_bytes, upload_photo, monkeypatch):
    monkeypatch.setattr(image_gen.settings, "image_provider", "siliconflow")
    monkeypatch.setattr(image_gen.settings, "siliconflow_api_key", "test-only")
    monkeypatch.setattr(image_gen.settings, "siliconflow_model_id", "Qwen/Qwen-Image-Edit")
    photo_id = upload_photo(png_bytes)
    response = client.post("/api/v1/tasks", json={
        "photo_id": photo_id, "style_id": "nordic", "element_ids": ["sofa"],
        "furniture_selections": [{"element_id": "sofa", "option_id": "sofa-2"}],
    })
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "REFERENCE_MODEL_UNAVAILABLE"
    assert photo_store.get(photo_id) == png_bytes
