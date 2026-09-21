"""土豆 Gemini 原生图片接口；一次请求，不重试、不换模型、不下载外部图片。"""

import base64
import json
import math
import re
from io import BytesIO

import httpx
from PIL import Image
from pydantic import AliasChoices, BaseModel, Field, ValidationError

from ..core.config import Settings
from ..schemas.api import GenerationDiagnostics
from .ark import GenerationError, _diagnostics, _response_error, validate_images

BASE_URL = "https://api.ai-tudou.net"
MODEL_ID = "gemini-3.1-flash-image-preview"
MAX_RESPONSE_BYTES = 60 * 1024 * 1024
RATIOS = ("1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9")


class _InlineImage(BaseModel):
    mime_type: str = Field(validation_alias=AliasChoices("mimeType", "mime_type"))
    data: str = Field(min_length=1, max_length=56_000_000)


class _Part(BaseModel):
    inline_data: _InlineImage | None = Field(default=None, validation_alias=AliasChoices("inlineData", "inline_data"))
    text: str = ""
    thought: bool = False


class _Content(BaseModel):
    parts: list[_Part] = Field(min_length=1, max_length=100)


class _Candidate(BaseModel):
    content: _Content
    finish_reason: str | None = Field(default=None, validation_alias=AliasChoices("finishReason", "finish_reason"))


class _Response(BaseModel):
    candidates: list[_Candidate] = Field(min_length=1, max_length=1)


def validate_settings(settings: Settings) -> None:
    if settings.tudou_api_base_url.rstrip("/") != BASE_URL:
        raise ValueError("土豆接口地址必须为已适配的 https://api.ai-tudou.net")
    if settings.tudou_model_id != MODEL_ID:
        raise ValueError("土豆接入只使用指定的 gemini-3.1-flash-image-preview，不自动换模型")
    if not settings.tudou_api_key.strip():
        raise ValueError("土豆密钥尚未配置，请在后端 .env 保存 TUDOU_API_KEY 并重启后端")
    if not settings.tudou_photo_transfer_approved:
        raise ValueError("尚未确认将房间及商品图片经土豆平台转发至 Gemini，暂不提交")
    if not math.isfinite(settings.tudou_estimated_cost_per_image) or settings.tudou_estimated_cost_per_image <= 0:
        raise ValueError("土豆单次人民币费用尚未确认，暂不提交；请核对账号实际单价后设置预算估算")
    if not 1 <= settings.tudou_timeout_seconds <= 600:
        raise ValueError("TUDOU_TIMEOUT_SECONDS 须在 1 至 600 秒之间")


def _part(content: bytes) -> dict:
    with Image.open(BytesIO(content)) as image:
        mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}[image.format]
    return {"inlineData": {"mimeType": mime, "data": base64.b64encode(content).decode("ascii")}}


def _failure(diagnostics: GenerationDiagnostics) -> GenerationError:
    status = diagnostics.http_status or 0
    code, message = {
        400: ("REQUEST_REJECTED", "图片或参数被拒绝，请核对模型输入限制"),
        401: ("AUTHENTICATION_FAILED", "认证失败，请核对密钥有效性及所属账号"),
        403: ("PERMISSION_DENIED", "访问被拒绝，请核对令牌分组和模型权限"),
        404: ("HTTP_NOT_FOUND", "接口返回 404，尚不能确定是接口、模型还是权限问题"),
        429: ("RATE_LIMIT", "限流或额度不足，请核对控制台"),
    }.get(status, ("GENERATION_FAILED", "生成失败，请核对控制台记录"))
    if status >= 500:
        code, message = "UPSTREAM_ERROR", "上游服务异常，请先核对账单，避免重复付费"
    elif 300 <= status < 400:
        code, message = "REDIRECT_REJECTED", "接口返回重定向，已停止跟随以保护密钥"
    return GenerationError(f"TUDOU_{code}", f"土豆图像服务：{message}；未自动重试或换模型", diagnostics)


def generate(images: list[bytes], prompt: str, settings: Settings) -> bytes:
    validate_settings(settings)
    validate_images(images)
    with Image.open(BytesIO(images[0])) as room:
        original_ratio = room.width / room.height
    ratio = min(RATIOS, key=lambda item: abs(math.log(original_ratio / (int(item.split(":")[0]) / int(item.split(":")[1])))))
    payload = {
        "contents": [{"role": "user", "parts": [*[_part(content) for content in images], {"text": prompt}]}],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"], "imageConfig": {"aspectRatio": ratio, "imageSize": "2K"}},
    }
    try:
        with httpx.Client(timeout=httpx.Timeout(settings.tudou_timeout_seconds, connect=15.0), follow_redirects=False) as client:
            with client.stream("POST", f"{BASE_URL}/v1beta/models/{MODEL_ID}:generateContent",
                               headers={"Authorization": f"Bearer {settings.tudou_api_key.strip()}"}, json=payload) as response:
                chunks, size = [], 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > MAX_RESPONSE_BYTES:
                        raise GenerationError("TUDOU_INVALID_RESPONSE", "土豆返回内容超过安全大小限制，未保存结果")
                    chunks.append(chunk)
                raw = b"".join(chunks)
    except GenerationError:
        raise
    except httpx.TimeoutException:
        raise GenerationError("TUDOU_TIMEOUT", "土豆响应超时，上游可能仍在处理；请先核对账单，未自动重试", GenerationDiagnostics(response_kind="transport")) from None
    except Exception:
        raise GenerationError("TUDOU_CONNECTION_FAILED", "无法连接土豆图像服务；请核对网络及控制台记录，未自动重试", GenerationDiagnostics(response_kind="transport")) from None
    try:
        body, kind = json.loads(raw), "json"
    except (ValueError, UnicodeError):
        body, kind = None, "non_json"
    diagnostics = _diagnostics(response, body, kind, settings)
    if not response.is_success or _response_error(body) is not None:
        raise _failure(diagnostics)
    try:
        if isinstance(body, dict) and body.get("promptFeedback", {}).get("blockReason"):
            raise ValueError("blocked")
        candidate = _Response.model_validate(body).candidates[0]
        if candidate.finish_reason not in {None, "STOP"}:
            raise ValueError("unfinished or blocked")
        outputs = []
        for part in candidate.content.parts:
            if part.thought:
                continue
            if part.inline_data is not None:
                outputs.append((part.inline_data.mime_type, part.inline_data.data))
            else:
                outputs.extend(re.findall(r"!\[[^\]]*\]\(data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)\)", part.text))
        if len(outputs) != 1:
            raise ValueError("expected exactly one final image")
        mime, encoded = outputs[0]
        if mime not in {"image/png", "image/jpeg", "image/webp"}:
            raise ValueError("invalid mime")
        content = base64.b64decode(encoded, validate=True)
        if len(content) > 40 * 1024 * 1024:
            raise ValueError("output too large")
        with Image.open(BytesIO(content)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"} or image.width * image.height > 4096 * 4096:
                raise ValueError("invalid output image")
            if Image.MIME[image.format] != mime:
                raise ValueError("mime mismatch")
            image.load()
            output = BytesIO()
            image.convert("RGB").save(output, "JPEG", quality=95)
        return output.getvalue()
    except (ValidationError, ValueError, TypeError, AttributeError, OSError, Image.DecompressionBombError):
        raise GenerationError("TUDOU_INVALID_RESPONSE", "土豆返回的图片数据不完整、被拦截或格式不符；未保存为成功结果，请核对控制台", diagnostics) from None
