import pytest

from app.core.security import validate_image


def test_upload_ok(client, png_bytes):
    r = client.post("/api/v1/photos", files={"file": ("room.png", png_bytes, "image/png")})
    assert r.status_code == 200
    assert "photo_id" in r.json()


def test_upload_bad_extension(client, png_bytes):
    r = client.post("/api/v1/photos", files={"file": ("room.txt", png_bytes, "image/png")})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_IMAGE"


def test_upload_fake_image(client):
    r = client.post(
        "/api/v1/photos", files={"file": ("room.png", b"not an image", "image/png")}
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_IMAGE"


def test_validate_image_size_limit():
    big = b"x" * (10 * 1024 * 1024 + 1)
    with pytest.raises(ValueError):
        validate_image(big, "big.png")


def test_validate_image_ok(png_bytes):
    assert validate_image(png_bytes, "room.png") == ".png"
