import re
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_FORMATS = {"jpeg", "png", "webp"}


def safe_filename(name: str) -> str:
    """去掉路径成分与危险字符，返回安全文件名。"""
    name = Path(name).name
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name or "upload"


def validate_image(content: bytes, filename: str) -> str:
    """校验格式、大小、真实类型、安全文件名；返回规范扩展名。失败抛 ValueError。"""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("不支持的图片格式，仅支持 jpg/png/webp")
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("图片超过 10MB 上限")
    try:
        img = Image.open(BytesIO(content))
        fmt = (img.format or "").lower()
        img.verify()
    except (UnidentifiedImageError, OSError, ValueError):
        raise ValueError("文件不是有效图片")
    if fmt not in ALLOWED_FORMATS:
        raise ValueError("图片真实类型不受支持")
    return ".jpg" if fmt == "jpeg" else f".{fmt}"
