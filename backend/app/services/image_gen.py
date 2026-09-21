import base64
import time
from io import BytesIO

import httpx
from PIL import Image, ImageDraw

from ..core.config import get_settings
from . import ark, tudou
from .furniture import FurnitureReferences

settings = get_settings()

_MIME_BY_FORMAT = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


def generate_renovation_image(
    photo_bytes: bytes, style_name: str, element_names: list[str],
    references: FurnitureReferences | None = None,
) -> bytes:
    """生成与原图同角度的软装改造效果图。

    - 按 IMAGE_PROVIDER 调用 Tudou / Ark / SiliconFlow / ModelScope，不自动跨厂商回退。
    - mock 模式：原图 + 水印标注（开发期跑通流程，不得当作真实模型结果）。
    """
    if references is not None:
        validate_reference_provider()
    provider = _active_provider()
    if provider is None:
        return _mock_result(photo_bytes)
    name, api_url, api_key, model_id = provider
    if name in {"ark", "tudou"}:
        if references is not None and not references.individual:
            raise ValueError("当前提供方必须逐件传入商品单图，不能使用拼图参考板")
        images = [photo_bytes] + (references.images if references else [])
        adapter = ark if name == "ark" else tudou
        return adapter.generate(images, _build_prompt(style_name, element_names, references), settings)
    if name == "modelscope":
        return _call_modelscope(photo_bytes, style_name, element_names, api_url, api_key, model_id, references)
    return _call_siliconflow(photo_bytes, style_name, element_names, api_url, api_key, model_id, references)


def validate_reference_provider() -> None:
    """不把不支持参考图的配置偷偷降级为纯风格生成或 mock。"""
    if settings.image_provider == "mock":
        return
    provider = _active_provider()
    if provider is None:
        raise ValueError("图像服务尚未正确配置，暂不能按款式生成")
    name, _, _, model_id = provider
    if name in {"ark", "tudou"}:
        return
    supported = {"Qwen/Qwen-Image-Edit-2509"}
    if name == "modelscope":
        supported.add("Qwen/Qwen-Image-Edit-2511")
    if model_id not in supported:
        raise ValueError("当前模型尚未接通多图参考，请使用已适配的 Qwen 图像编辑模型")


def _active_provider() -> tuple[str, str, str, str] | None:
    if settings.image_provider == "mock":
        return None
    if settings.image_provider == "ark":
        ark.validate_settings(settings)
        return ("ark", settings.ark_api_url, settings.ark_api_key, settings.ark_model_id)
    if settings.image_provider == "tudou":
        tudou.validate_settings(settings)
        return ("tudou", settings.tudou_api_base_url, settings.tudou_api_key, settings.tudou_model_id)
    if settings.image_provider == "siliconflow" and settings.siliconflow_api_key:
        return ("siliconflow", settings.siliconflow_api_url, settings.siliconflow_api_key, settings.siliconflow_model_id)
    if settings.image_provider == "modelscope" and settings.modelscope_api_key:
        return ("modelscope", settings.modelscope_api_url, settings.modelscope_api_key, settings.modelscope_model_id)
    raise ValueError("图像服务未正确配置，请检查后端提供方和密钥；未启用模拟或其他供应商兜底")


def provider_details() -> tuple[str, str, float]:
    """提交前配置预检；只返回可公开字段及预算估算，绝不返回密钥。"""
    provider = _active_provider()
    if provider is None:
        return "mock", "mock", settings.cost_limit_per_image
    name, _, _, model_id = provider
    estimate = settings.ark_estimated_cost_per_image if name == "ark" else settings.cost_limit_per_image
    if name == "tudou":
        estimate = settings.tudou_estimated_cost_per_image
    return name, model_id, estimate


_PLACEMENT_RULES = {
    "床": "床留在原睡眠分区内小幅调整，床边保留上下床通道，床架不遮挡门窗，不夸大床的体量。",
    "床品四件套": "床品自然铺设，保留指定面料、底色和纹样；不额外加入未选的抱枕、毛毯或装饰。",
    "床头柜": "床头柜靠近床头，台面高度与床协调并留出使用空间；不为对称额外复制床头柜。",
    "台灯": "台灯放在原房或清单内已有的合适台面上，与台面比例协调，不悬空、不为对称复制台灯。",
    "衣柜": "衣柜保留合理深度及柜门开合空间，不侵占门窗和主要通道，不把柜体嵌入墙体。",
    "书桌": "书桌保留可坐下使用的空间，避免贴床过近或顶住窗帘，不用夸张缩小桌面来塞入房间。",
    "梳妆台": "梳妆台与书桌若同时在清单中，应各自保留独立使用空间，不合并成一件、不沿墙挤成一排。",
    "地毯": "地毯贴地，以原房可见的床、沙发或餐桌为参照形成协调的轴线与落脚区域；保留原有外形、长宽比例和纹样，不斜放成孤立色块或铺满整间房。",
    "主灯": "主灯与原房主要活动区域协调，悬挂高度符合层高，不放大灯体，不新增天花结构。",
    "沙发": "沙发在原会客区小幅优化位置，保留通道和座前空间，不通过改变房间尺度容纳家具。",
    "茶几": "茶几围绕原房或清单内的座位布置，与座位保持可伸手使用的间距和清晰的行走空间。",
    "餐桌": "餐桌留出就坐和通行空间，不紧贴门窗；与原房或清单内的餐椅形成清楚的用餐区域。",
    "餐椅": "餐椅围绕原房或清单内的餐桌合理放置，保留拉出就坐的空间，不互相穿插。",
    "吊灯": "吊灯对应原房或清单内的使用区域，若有餐桌则与桌面中心关系协调，不额外添加桌子。",
}


def _composition_prompt(style_name: str, element_names: list[str]) -> str:
    # 只加入已选类别的布置建议，不能因设计建议凭空添加其他家具。
    placement = "".join(_PLACEMENT_RULES.get(name, "") for name in dict.fromkeys(element_names))
    return (
        "空间边界：保持原图拍摄位置、角度、透视和画面比例；墙体、门窗、地面、天花板的结构、位置和材质颜色保持不变，不扩建房间、不变换镜头。"
        "未选家具及未选软装的款式、颜色和摆位保持不变；例如未选窗帘时不能为了配色改掉原窗帘。"
        "摆位权限：允许仅对已选家具在原功能分区内小范围调整位置和朝向，优化间距及组合关系，不跨房间搬动。"
        "所有家具按房间透视呈现合理尺度，保持产品自身长宽高比例，不通过拉伸、压扁或夸张缩小商品来塞满空间。"
        "留出门窗开启、柜门抽屉使用和正常行走的空间；不穿墙、不穿模、不拥挤堆叠，不把所选商品藏到画外或挡住关键结构。"
        f"布置细则（只作用于清单内商品，提到的关联家具不存在时不得补造）：{placement}"
        f"整体视觉：在不改变指定商品外观和上述空间边界的前提下，呈现{style_name}的克制、有秩序的布置。"
        "以主要家具为视觉中心，通过疏密、对齐、留白和材质关系协调原房与选款，不强行将所有家具改成相同木色或统一染色。"
        "光影：以原窗方向的自然光为依据，统一曝光、色温、透视和接触阴影；已选灯具发光柔和，保留产品真实色彩和材质纹理，不泛黄、不过曝、不做塑料般的过度磨皮。"
        "真实可居住感优先于夸张样板间效果；不为美化添加清单外的挂画、绿植、摆件或其他商品，不搬入参考图背景。"
    )


def _build_prompt(style_name: str, element_names: list[str], references: FurnitureReferences | None = None) -> str:
    composition = _composition_prompt(style_name, element_names)
    if references is not None:
        return (
            "第1张图是唯一需要编辑的原始房间照片。其他图片仅为用户已选家具的外观参考，不是新房间。"
            f"对应关系：{references.instructions}。"
            "每条对应关系都是必选项，逐项放入结果，不要遗漏、合并或用另一款替代。"
            "每张参考图只提取对应家具类别，忽略其背景和其他陪衬物。"
            "若床与床品分别指定，以床参考图决定床架，以床品参考图决定被套、床单和枕套，不让床图自带床品覆盖单独选款。"
            "请在第1张图中找到对应家具，用指定参考款式替换；原图没有该家具时，只在合理空位添加。"
            "执行优先级：商品身份与结构、房间边界优先，合理摆位其次，美观与风格不得覆盖前两项。"
            "必须优先保留参考家具的轮廓、结构、材质、颜色、靠背/扶手/支脚等特征，不要自行换成同类其他款式。"
            "部件保真：逐图核对开放格、抽屉、柜门的有无及数量；开放格必须保持中空，不能变成抽屉或柜门。床架、床脚、灯罩、地毯纹样不得互相借用或简化。"
            f"{composition}"
            "输出前按对应关系逐项核对：每件已选商品都在图中可辨认，结构、颜色、纹样相符，无漏项、错款或非必要复制，再检查通道、比例、光影；这一检查不输出文字。"
            "只输出一张完整房间效果图，不输出参考板、编号、文字、拼图或前后对比图。"
        )
    return (
        f"把这个房间改造成{style_name}软装风格，添加或替换以下软装元素："
        f"{'、'.join(element_names)}。{composition}"
        "只输出一张完整房间效果图，不添加文字、编号或拼图。"
    )


def _to_data_url(photo_bytes: bytes) -> str:
    fmt = "JPEG"
    try:
        with Image.open(BytesIO(photo_bytes)) as img:
            fmt = (img.format or "JPEG").upper()
    except Exception:
        pass
    mime = _MIME_BY_FORMAT.get(fmt, "image/jpeg")
    b64 = base64.b64encode(photo_bytes).decode()
    return f"data:{mime};base64,{b64}"


def _modelscope_size(photo_bytes: bytes, max_side: int = 1664) -> str:
    """按原图比例算一个输出尺寸（长边不超过 max_side、取 16 的倍数），保持同角度构图。"""
    try:
        with Image.open(BytesIO(photo_bytes)) as img:
            w, h = img.size
    except Exception:
        return "1024x1024"
    scale = min(1.0, max_side / max(w, h))

    def _round(x: float) -> int:
        return max(256, (round(x * scale) // 16) * 16)

    return f"{_round(w)}x{_round(h)}"


def _download(url: str) -> bytes:
    with httpx.Client(timeout=settings.image_timeout_seconds) as client:
        img = client.get(url)
        img.raise_for_status()
        return img.content


def _call_siliconflow(photo_bytes, style_name, element_names, api_url, api_key, model_id, references=None) -> bytes:
    url = f"{api_url.rstrip('/')}/images/generations"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model_id,
        "prompt": _build_prompt(style_name, element_names, references),
        "image": _to_data_url(photo_bytes),
    }
    if references is not None:
        if not 1 <= len(references.images) <= 2:
            raise ValueError("家具参考图数量无效")
        # 官方契约：2509 支持 image（原图）、image2、image3，均可传 data URL。
        for index, reference in enumerate(references.images, start=2):
            payload[f"image{index}"] = _to_data_url(reference)
    with httpx.Client(timeout=settings.image_timeout_seconds) as client:
        r = client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
    image_url = None
    if data.get("images"):
        image_url = data["images"][0].get("url")
    elif data.get("data"):
        image_url = data["data"][0].get("url")
    if not image_url:
        raise RuntimeError("图像 API 未返回图片地址")
    return _download(image_url)


def _call_modelscope(photo_bytes, style_name, element_names, base_url, api_key, model_id, references=None) -> bytes:
    """ModelScope 魔搭：异步任务模式，提交后轮询 /v1/tasks/{id} 取图。"""
    base = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model_id,
        "prompt": _build_prompt(style_name, element_names, references),
        "image_url": [_to_data_url(photo_bytes)],
        "size": _modelscope_size(photo_bytes),
    }
    if references is not None:
        if not 1 <= len(references.images) <= 2:
            raise ValueError("家具参考图数量无效")
        payload["image_url"].extend(_to_data_url(image) for image in references.images)
    with httpx.Client(timeout=settings.image_timeout_seconds) as client:
        r = client.post(
            f"{base}/images/generations",
            headers={**headers, "X-ModelScope-Async-Mode": "true"},
            json=payload,
        )
        r.raise_for_status()
        task_id = r.json().get("task_id")
        if not task_id:
            raise RuntimeError("ModelScope 未返回 task_id")

        deadline = time.time() + settings.modelscope_poll_timeout_seconds
        while time.time() < deadline:
            time.sleep(5)
            rr = client.get(
                f"{base}/tasks/{task_id}",
                headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
            )
            rr.raise_for_status()
            data = rr.json()
            status = data.get("task_status")
            if status == "SUCCEED":
                images = data.get("output_images") or []
                if not images:
                    raise RuntimeError("ModelScope 任务成功但无图片")
                return _download(images[0])
            if status == "FAILED":
                raise RuntimeError("ModelScope 出图失败")
    raise RuntimeError("ModelScope 出图超时")


def _mock_result(photo_bytes: bytes) -> bytes:
    img = Image.open(BytesIO(photo_bytes)).convert("RGB")
    draw = ImageDraw.Draw(img)
    w, h = img.size
    band_h = max(36, h // 7)
    draw.rectangle([0, h - band_h, w, h], fill=(0, 0, 0))
    draw.text(
        (12, h - band_h + 10),
        "MOCK RESULT - real image model not connected",
        fill=(255, 255, 255),
    )
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()
