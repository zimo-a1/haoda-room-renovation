"""新图水印与搭配约束的离线回归；不代表模型美观/还原度已通过实测。"""

import json

import pytest

from app.schemas.api import FurnitureSelection
from app.services import catalog, furniture, image_gen
from .test_ark import ark_settings, mock_transport, result_response


@pytest.mark.parametrize("style", catalog.STYLES, ids=lambda style: style["id"])
@pytest.mark.parametrize("with_references", [True, False])
def test_composition_keeps_boundaries_and_allows_only_small_selected_moves(style, with_references):
    refs = furniture.FurnitureReferences([], "参考图2：卧室的床，指定款式为木质靠背床", individual=True) if with_references else None
    prompt = image_gen._build_prompt(style["name"], ["床", "地毯"], refs)
    assert style["name"] in prompt
    assert "允许仅对已选家具在原功能分区内小范围调整位置和朝向" in prompt
    assert "墙体、门窗、地面、天花板的结构、位置和材质颜色保持不变" in prompt
    assert "保持原图拍摄位置、角度、透视和画面比例" in prompt
    assert "未选家具及未选软装的款式、颜色和摆位保持不变" in prompt
    assert "未选窗帘时不能为了配色改掉原窗帘" in prompt
    assert "不为美化添加清单外" in prompt
    assert "保持产品自身长宽高比例" in prompt
    assert "不强行将所有家具改成相同木色" in prompt
    assert "统一曝光、色温、透视和接触阴影" in prompt
    assert "不斜放成孤立色块或铺满整间房" in prompt
    assert "整体布局不变" not in prompt and "画面比例和空间布局" not in prompt
    if with_references:
        assert refs.instructions in prompt
        assert "商品身份与结构、房间边界优先" in prompt
        assert "开放格必须保持中空，不能变成抽屉或柜门" in prompt
        assert "以床品参考图决定被套、床单和枕套" in prompt
        assert "不要遗漏、合并或用另一款替代" in prompt


def test_placement_guidance_does_not_request_unselected_furniture():
    prompt = image_gen._composition_prompt("中古风", ["沙发", "沙发", "茶几"])
    assert prompt.count(image_gen._PLACEMENT_RULES["沙发"]) == 1
    assert image_gen._PLACEMENT_RULES["茶几"] in prompt
    for name in ("床", "书桌", "梳妆台", "餐桌", "台灯"):
        assert image_gen._PLACEMENT_RULES[name] not in prompt
    assert "提到的关联家具不存在时不得补造" in prompt


@pytest.mark.parametrize("change", [{"image": "/images/furniture/nightstand-v2.png"}, {"panel": 0}])
def test_specific_structure_rules_only_apply_to_verified_atlas(change):
    selection = furniture.resolve_selections([FurnitureSelection(element_id="nightstand", option_id="nightstand-3")], catalog.get_elements(["nightstand"]))[0]
    changed = selection.model_copy(update=change)
    assert "结构锁定" not in furniture._describe_selection(changed)


@pytest.mark.parametrize("option,expected", [
    ("nightstand-1", "单个抽屉、木质柜体及细支脚"),
    ("nightstand-2", "上下两个抽屉、浅色圆角柜体及圆形把手"),
    ("nightstand-3", "正面两格保持中空可见"),
])
@pytest.mark.parametrize("individual", [True, False])
def test_nightstand_structure_attached_to_its_own_reference(option, expected, individual):
    resolved = furniture.resolve_selections([
        FurnitureSelection(element_id="bed", option_id="bed-3"),
        FurnitureSelection(element_id="bedding", option_id="bedding-1"),
        FurnitureSelection(element_id="nightstand", option_id=option),
    ], catalog.get_elements(["bed", "bedding", "nightstand"]))
    refs = furniture.prepare_references(resolved, individual=individual)
    assert expected in refs.instructions
    assert refs.instructions.count("结构锁定") == 1
    assert resolved[-1].option_name in refs.instructions
    assert ("参考图4：卧室的床头柜" if individual else "参考图3的F03：卧室的床头柜") in refs.instructions
    if option == "nightstand-3":
        assert "没有抽屉、没有柜门、没有把手" in refs.instructions
        assert "不得生成封闭面板" in refs.instructions


def test_latest_nine_item_selection_reaches_single_generation_with_new_policy(client, png_bytes, upload_photo, monkeypatch, ark_settings):
    choices = [("bed", "bed-3"), ("bedding", "bedding-1"), ("nightstand", "nightstand-3"),
               ("wardrobe", "wardrobe-2"), ("dressing-table", "dressing-table-3"),
               ("table-lamp", "table-lamp-1"), ("desk", "desk-1"),
               ("bedroom-main-light", "bedroom-main-light-2"), ("bedroom-rug", "bedroom-rug-3")]
    calls = []
    def handle(request):
        calls.append(json.loads(request.content))
        return result_response(png_bytes)
    mock_transport(monkeypatch, handle)
    created = client.post("/api/v1/tasks", json={
        "photo_id": upload_photo(png_bytes), "style_id": "japanese",
        "element_ids": [element for element, _ in choices],
        "furniture_selections": [{"element_id": element, "option_id": option} for element, option in choices],
    })
    assert created.status_code == 200
    result = client.get(f"/api/v1/tasks/{created.json()['task_id']}").json()
    assert result["status"] == "succeeded"  # 协议模拟，不是实际美观验收。
    assert result["input_image_count"] == 10
    assert len(result["furniture_selections"]) == 9
    assert result["generation_model"] == "doubao-seedream-5-0-260128"
    assert len(calls) == 1
    payload = calls[0]
    assert payload["watermark"] is False
    assert payload["sequential_image_generation"] == "disabled"
    assert payload["stream"] is False
    assert len(payload["image"]) == 10
    assert "tools" not in payload and "n" not in payload
    assert "木质开放式双层格架" in payload["prompt"]
    assert "小范围调整位置和朝向" in payload["prompt"]
    for item in result["furniture_selections"]:
        assert item["option_name"] in payload["prompt"]
