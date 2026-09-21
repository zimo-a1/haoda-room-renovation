def test_full_flow(client, png_bytes, upload_photo):
    photo_id = upload_photo(png_bytes)
    r = client.post(
        "/api/v1/tasks",
        json={"photo_id": photo_id, "style_id": "nordic", "element_ids": ["bed", "curtain"]},
    )
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["status"] == "processing"
    assert created["result_image_url"] is None

    # 轮询任务：后台生成完成后应为 succeeded
    t = client.get(f"/api/v1/tasks/{created['task_id']}")
    assert t.status_code == 200
    data = t.json()
    assert data["status"] == "succeeded"
    assert data["result_image_url"]
    assert data["style_id"] == "nordic"
    assert data["element_ids"] == ["bed", "curtain"]

    img = client.get(data["result_image_url"])
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/jpeg"


def test_missing_photo(client):
    r = client.post(
        "/api/v1/tasks",
        json={"photo_id": "nope", "style_id": "nordic", "element_ids": ["bed"]},
    )
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "PHOTO_NOT_FOUND"


def test_invalid_style(client, png_bytes, upload_photo):
    photo_id = upload_photo(png_bytes)
    r = client.post(
        "/api/v1/tasks",
        json={"photo_id": photo_id, "style_id": "nope", "element_ids": ["bed"]},
    )
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "STYLE_NOT_FOUND"


def test_empty_elements(client, png_bytes, upload_photo):
    photo_id = upload_photo(png_bytes)
    r = client.post(
        "/api/v1/tasks",
        json={"photo_id": photo_id, "style_id": "nordic", "element_ids": []},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_photo_discarded_after_generation(client, png_bytes, upload_photo):
    from app.core import photo_store

    photo_id = upload_photo(png_bytes)
    client.post(
        "/api/v1/tasks",
        json={"photo_id": photo_id, "style_id": "nordic", "element_ids": ["bed"]},
    )
    assert photo_store.get(photo_id) is None
