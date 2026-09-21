def test_products_static_links(client, png_bytes, upload_photo):
    photo_id = upload_photo(png_bytes)
    r = client.post(
        "/api/v1/tasks",
        json={"photo_id": photo_id, "style_id": "nordic", "element_ids": ["bed", "rug"]},
    )
    task_id = r.json()["task_id"]

    p = client.post(f"/api/v1/tasks/{task_id}/products")
    assert p.status_code == 200
    data = p.json()
    assert data["configured"] is False
    names = [x["element_name"] for x in data["products"]]
    assert "床" in names and "地毯" in names
    for ep in data["products"]:
        assert len(ep["items"]) >= 1
        assert all(x["click_url"] for x in ep["items"])


def test_products_task_not_found(client):
    p = client.post("/api/v1/tasks/nope/products")
    assert p.status_code == 404
    assert p.json()["error"]["code"] == "TASK_NOT_FOUND"
