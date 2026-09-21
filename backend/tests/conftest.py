import io
import os
import tempfile

import pytest
from PIL import Image
from fastapi.testclient import TestClient

# 在导入 app 之前设定测试环境
_tmp = tempfile.mkdtemp(prefix="softdec_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/app.db"
os.environ["DATA_DIR"] = _tmp
os.environ["IMAGE_PROVIDER"] = "mock"
os.environ["COST_LIMIT_PER_IMAGE"] = "0.3"
os.environ["COST_LIMIT_MONTHLY"] = "300"

from app.main import app  # noqa: E402
from app.core import photo_store  # noqa: E402


@pytest.fixture()
def client():
    photo_store.clear()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture()
def upload_photo(client):
    def _upload(png_bytes):
        r = client.post(
            "/api/v1/photos", files={"file": ("room.png", png_bytes, "image/png")}
        )
        assert r.status_code == 200, r.text
        return r.json()["photo_id"]

    return _upload
