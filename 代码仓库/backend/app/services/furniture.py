"""服务端按可信目录解析选款，并仅提取用户选中的图集单格。"""

import json
import math
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageDraw, ImageOps

from ..core.config import get_settings
from ..schemas.api import FurnitureSelection, SelectedFurniture


class InvalidFurnitureSelection(ValueError):
    pass


class FurnitureAssetsUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class FurnitureReferences:
    images: list[bytes]
    instructions: str
    individual: bool = False


def resolve_selections(
    selections: list[FurnitureSelection], elements: list[dict]
) -> list[SelectedFurniture]:
    ids = [item.element_id for item in selections]
    if len(ids) != len(set(ids)) or set(ids) != {e["id"] for e in elements}:
        raise InvalidFurnitureSelection("请为每个已选家具选择一个款式，不要重复或遗漏")
    settings = get_settings()
    try:
        catalog = json.loads(settings.furniture_catalog_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise FurnitureAssetsUnavailable("款式图库暂不可用，请稍后重试") from exc
    elements_by_id = {e["id"]: e for e in elements}
    resolved = []
    for selection in selections:
        group = catalog.get(selection.element_id)
        option = next((o for o in group["options"] if o["id"] == selection.option_id), None) if group else None
        if option is None:
            raise InvalidFurnitureSelection("选中的家具款式已失效，请重新选择")
        element = elements_by_id[selection.element_id]
        resolved.append(SelectedFurniture(
            element_id=element["id"], option_id=option["id"], element_name=element["name"],
            room=element["room"], option_name=option["name"], image=group["image"], panel=option["panel"],
        ))
    return resolved


def _crop_selection(selection: SelectedFurniture) -> Image.Image:
    # 不接受客户端 URL 或路径，只允许目录中版本化的本地 PNG。
    prefix = "/images/furniture/"
    filename = selection.image.removeprefix(prefix)
    if not selection.image.startswith(prefix) or "/" in filename or "\\" in filename or not filename.endswith(".png"):
        raise FurnitureAssetsUnavailable("款式图片路径无效")
    root = get_settings().furniture_image_dir.resolve()
    path = (root / filename).resolve()
    if path.parent != root or selection.panel not in (0, 1, 2):
        raise FurnitureAssetsUnavailable("款式图片路径无效")
    try:
        with Image.open(path) as atlas:
            w, h = atlas.size
            if w != h * 3:
                raise FurnitureAssetsUnavailable("款式图集尺寸无效")
            # 与前端 3:1 图集、方形 object-position 0/50/100% 完全一致。
            left = selection.panel * h
            return atlas.crop((left, 0, left + h, h)).convert("RGB")
    except (OSError, ValueError) as exc:
        raise FurnitureAssetsUnavailable("款式图片暂不可用，请稍后重试") from exc


def _jpeg(image: Image.Image) -> bytes:
    buf = BytesIO()
    image.save(buf, "JPEG", quality=92)
    return buf.getvalue()


# 已对照本地 nightstand-v1 图集核验，用确定性的选款 ID 约束易混淆结构。
# 不识别/改写用户图片，不依赖额外模型调用；更换图集时需同步复核这些描述。
_APPEARANCE_CONSTRAINTS = {
    ("nightstand", "nightstand-1", "/images/furniture/nightstand-v1.png", 0): "结构锁定：单个抽屉、木质柜体及细支脚；不得改成双抽屉或开放格。",
    ("nightstand", "nightstand-2", "/images/furniture/nightstand-v1.png", 1): "结构锁定：上下两个抽屉、浅色圆角柜体及圆形把手；不得改成单抽屉或开放格。",
    ("nightstand", "nightstand-3", "/images/furniture/nightstand-v1.png", 2): "结构锁定：木质开放式双层格架，正面两格保持中空可见，带细支脚；没有抽屉、没有柜门、没有把手，不得生成封闭面板。",
}


def _describe_selection(selection: SelectedFurniture) -> str:
    description = f"{selection.room}的{selection.element_name}，指定款式为{selection.option_name}"
    constraint = _APPEARANCE_CONSTRAINTS.get((selection.element_id, selection.option_id, selection.image, selection.panel))
    return f"{description}。{constraint}" if constraint else description


def prepare_references(selections: list[SelectedFurniture], *, individual: bool = False) -> FurnitureReferences:
    """Ark 逐件单图；旧供应商维持最多两张参考板，不额外调用模型。"""
    if not 1 <= len(selections) <= 24:
        raise InvalidFurnitureSelection("请选择 1 至 24 件家具款式")
    if individual and len(selections) > 13:
        raise InvalidFurnitureSelection("当前接入每次最多选择 13 件商品，另加 1 张房间原图；请减少选款后重试")
    crops = [_crop_selection(item) for item in selections]
    images, descriptions = [], []
    if individual or len(crops) <= 2:
        for index, (crop, selection) in enumerate(zip(crops, selections), start=2):
            images.append(_jpeg(crop))
            descriptions.append(f"参考图{index}：{_describe_selection(selection)}")
    else:
        # 全部选款均进入参考图；不截断、不传入未选中的另两款。
        split = math.ceil(len(crops) / 2)
        for image_index, start in enumerate((0, split), start=2):
            end = min(start + split, len(crops))
            count = end - start
            columns = min(3, count)
            cell, label_h = 384, 36
            board = Image.new("RGB", (columns * cell, math.ceil(count / columns) * (cell + label_h)), "white")
            draw = ImageDraw.Draw(board)
            for offset, index in enumerate(range(start, end)):
                x, y = (offset % columns) * cell, (offset // columns) * (cell + label_h)
                board.paste(ImageOps.contain(crops[index], (cell, cell)), (x, y + label_h))
                label = f"F{index + 1:02d}"
                draw.text((x + 12, y + 6), label, fill="black", font_size=24)
                selection = selections[index]
                descriptions.append(f"参考图{image_index}的{label}：{_describe_selection(selection)}")
            images.append(_jpeg(board))
    return FurnitureReferences(images, "；".join(descriptions), individual=individual)
