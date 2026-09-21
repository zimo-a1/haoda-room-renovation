def test_list_styles(client):
    r = client.get("/api/v1/styles")
    assert r.status_code == 200
    ids = {s["id"] for s in r.json()["styles"]}
    assert {"nordic", "japanese", "cream", "french", "mid-century"} <= ids
    assert len(ids) == 5


def test_list_elements(client):
    r = client.get("/api/v1/styles/nordic/elements")
    assert r.status_code == 200
    els = r.json()["elements"]
    names = [e["name"] for e in els]
    assert "床" in names and "窗帘" in names and "地毯" in names
    assert "主灯" in names and "书桌" in names
    assert "床垫" not in names
    rooms = {e.get("room") for e in els}
    assert rooms == {"客厅", "卧室", "餐厅"}


def test_list_elements_not_found(client):
    r = client.get("/api/v1/styles/nope/elements")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "STYLE_NOT_FOUND"
