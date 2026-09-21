"""火山方舟国内 Seedream 适配。一次 POST、一张输出，不做付费自动重试。"""

import base64
import binascii
import math
import re
from io import BytesIO

import httpx
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, ValidationError

from ..core.config import Settings
from ..schemas.api import GenerationDiagnostics

ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
ARK_MODEL_ID = "doubao-seedream-5-0-260128"
MAX_PRODUCT_IMAGES = 13  # 本项目输入上限；模型权限及上限仍需真实账号验收。
MAX_IMAGE_BYTES = 30 * 1024 * 1024


class GenerationError(RuntimeError):
    """固定文案与经过白名单过滤的诊断字段，不携带供应商原始响应。"""

    def __init__(self, code: str, message: str, diagnostics: GenerationDiagnostics | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.diagnostics = diagnostics


class _ImageResult(BaseModel):
    b64_json: str = Field(min_length=1, max_length=56_000_000)


class _GenerationResponse(BaseModel):
    data: list[_ImageResult] = Field(min_length=1, max_length=1)


def validate_settings(settings: Settings) -> None:
    if settings.ark_api_url.rstrip("/") != ARK_BASE_URL:
        raise ValueError("火山方舟地址必须为已适配的国内北京入口，请检查后端 ARK_API_URL")
    if settings.ark_model_id != ARK_MODEL_ID:
        raise ValueError("当前火山适配仅启用已指定的 doubao-seedream-5-0-260128，未自动替换模型")
    if not settings.ark_api_key.strip():
        raise ValueError("火山方舟尚未配置密钥，请在后端 .env 填入 ARK_API_KEY 并重启后端")
    if not 1 <= settings.ark_timeout_seconds <= 600:
        raise ValueError("ARK_TIMEOUT_SECONDS 须在 1 至 600 秒之间")
    if not math.isfinite(settings.ark_estimated_cost_per_image) or settings.ark_estimated_cost_per_image <= 0:
        raise ValueError("请将 ARK_ESTIMATED_COST_PER_IMAGE 设置为有效的正数预算估算")


def validate_images(images: list[bytes]) -> None:
    if not 1 <= len(images) <= MAX_PRODUCT_IMAGES + 1:
        raise ValueError("当前接入最多接受 1 张房间原图及 13 张商品图，不会截断或合并选款")
    for content in images:
        if len(content) > MAX_IMAGE_BYTES:
            raise ValueError("单张参考图不能超过 30 MB")
        try:
            with Image.open(BytesIO(content)) as image:
                w, h = image.size
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise ValueError("请使用 JPEG、PNG 或 WebP 图片")
                if min(w, h) < 15 or w * h > 36_000_000 or not 1 / 16 <= w / h <= 16:
                    raise ValueError("参考图尺寸不适用：短边至少 15 像素，总像素最多 3600 万，宽高比须在 1:16 至 16:1 内")
                image.verify()
        except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
            raise ValueError("参考图内容无效，请重新上传") from exc


def _data_url(content: bytes) -> str:
    with Image.open(BytesIO(content)) as image:
        mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}[image.format]
    return f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"


def _response_error(body: object) -> dict | None:
    if not isinstance(body, dict):
        return None
    if body.get("error") is not None:
        return body["error"] if isinstance(body["error"], dict) else {}
    if isinstance(body.get("data"), list):
        for item in body["data"]:
            if isinstance(item, dict) and item.get("error") is not None:
                return item["error"] if isinstance(item["error"], dict) else {}
    return None


def _diagnostics(response: httpx.Response, body: object, response_kind: str, settings: Settings) -> GenerationDiagnostics:
    # 只检查明确字段；永不复制 message、body、URL、Authorization 或任意响应头。
    secrets = [settings.ark_api_key, settings.tudou_api_key, settings.siliconflow_api_key, settings.modelscope_api_key,
               settings.model_api_key, settings.taobaoke_app_key, settings.taobaoke_app_secret]

    def safe(value: object, pattern: str, limit: int) -> str | None:
        if not isinstance(value, str) or not 1 <= len(value) <= limit or not re.fullmatch(pattern, value):
            return None
        if value.lower().startswith(("sk-", "bearer", "data:", "http:", "https:")):
            return None
        if any(secret.strip() and secret.strip().casefold() in value.casefold() for secret in secrets):
            return None
        return value

    error = _response_error(body) or {}
    obj = body if isinstance(body, dict) else {}
    candidates = [response.headers.get("x-request-id"), response.headers.get("x-tt-logid"),
                  obj.get("request_id"), obj.get("RequestId"), error.get("request_id")]
    request_id = next((clean for value in candidates if (clean := safe(value, r"[A-Za-z0-9][A-Za-z0-9._:-]*", 128))), None)
    return GenerationDiagnostics(
        http_status=response.status_code,
        upstream_code=safe(error.get("code"), r"[A-Za-z][A-Za-z0-9_.-]*", 96),
        request_id=request_id,
        response_kind=response_kind,
    )


def _failure(diagnostics: GenerationDiagnostics) -> GenerationError:
    status = diagnostics.http_status
    code = (diagnostics.upstream_code or "").split(".", 1)[0].lower()
    def failure(code: str, message: str) -> GenerationError:
        return GenerationError(code, message, diagnostics)

    if status == 401:
        return failure("ARK_AUTHENTICATION_FAILED", "火山方舟拒绝了本次身份认证，请核对当前服务所用密钥的有效性及所属账号")
    # 只按明确的上游错误码判断；普通 404 不足以证明模型不存在或未开通。
    if code == "modelnotopen":
        return failure("ARK_MODEL_NOT_OPEN", "火山方舟返回 ModelNotOpen，请用请求编号核对本次请求所属账号及模型权限；不会自动换模型")
    if code == "modelnotfound":
        return failure("ARK_MODEL_NOT_FOUND", "火山方舟返回 ModelNotFound，请用请求编号核对本次模型标识及可访问范围；不会自动换模型")
    if code == "invalidendpointormodel":
        return failure("ARK_MODEL_OR_ENDPOINT_UNAVAILABLE", "火山方舟无法访问指定模型或推理接入点，可能涉及资源或权限；请结合错误码与请求编号核查")
    if code == "invalidendpoint":
        return failure("ARK_ENDPOINT_UNAVAILABLE", "火山方舟返回推理接入点错误，请用请求编号核对接入点配置与权限")
    if status == 403:
        return failure("ARK_PERMISSION_DENIED", "火山方舟拒绝了本次访问权限；仅凭此响应不能判断模型是否已开通，请用请求编号核查")
    if status == 404:
        return failure("ARK_HTTP_NOT_FOUND", "生成接口返回 HTTP 404，尚不能判定是接口、模型还是权限问题；请保留下面的诊断信息")
    if status == 429:
        return failure("ARK_RATE_LIMIT", "火山方舟限流或额度不足，请在控制台核对后再手动尝试")
    if status == 400:
        return failure("ARK_REQUEST_REJECTED", "火山方舟拒绝了本次图片或参数，请核对该模型的输入限制及内容要求")
    if status is not None and status >= 500:
        return failure("ARK_UPSTREAM_ERROR", "生成服务返回上游服务错误，未自动重试；请先核对任务与账单，避免重复付费")
    if status is not None and 300 <= status < 400:
        return failure("ARK_REDIRECT_REJECTED", "生成接口返回重定向，已停止跟随以保护密钥；请核对接口与网络代理配置")
    return failure("ARK_GENERATION_FAILED", "火山方舟未能完成生成，请核对控制台记录后再手动尝试")


def generate(images: list[bytes], prompt: str, settings: Settings) -> bytes:
    validate_settings(settings)
    validate_images(images)
    with Image.open(BytesIO(images[0])) as room:
        ratio = f"{room.width}:{room.height}"
    payload = {
        "model": settings.ark_model_id,
        "prompt": f"{prompt}输出宽高比保持原始房间的 {ratio}。",
        "image": [_data_url(content) for content in images],
        "size": "2K",
        "response_format": "b64_json",
        "sequential_image_generation": "disabled",
        "stream": False,
        # 用户确认：关闭后续输出图内的可见角标；不裁切或覆盖历史图片。
        "watermark": False,
    }
    try:
        # httpx 默认不重试，不启用重定向；防止重复计费和密钥转发。
        with httpx.Client(timeout=httpx.Timeout(settings.ark_timeout_seconds, connect=15.0), follow_redirects=False) as client:
            response = client.post(
                f"{ARK_BASE_URL}/images/generations",
                headers={"Authorization": f"Bearer {settings.ark_api_key}", "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.TimeoutException:
        raise GenerationError("ARK_TIMEOUT", "火山方舟响应超时，上游可能仍在处理；请先核对控制台任务和账单，避免重复付费", GenerationDiagnostics(response_kind="transport")) from None
    except Exception:
        raise GenerationError("ARK_CONNECTION_FAILED", "无法连接火山方舟，未自动重试；请检查后端网络并核对控制台记录", GenerationDiagnostics(response_kind="transport")) from None
    try:
        body = response.json()
        response_kind = "json"
    except (ValueError, UnicodeError):
        body = None
        response_kind = "non_json"
    diagnostics = _diagnostics(response, body, response_kind, settings)
    if not response.is_success or _response_error(body) is not None:
        raise _failure(diagnostics)
    try:
        result = _GenerationResponse.model_validate(body)
        content = base64.b64decode(result.data[0].b64_json, validate=True)
        if len(content) > 40 * 1024 * 1024:
            raise ValueError("output too large")
        with Image.open(BytesIO(content)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"} or image.width * image.height > 4096 * 4096:
                raise ValueError("invalid output image")
            image.load()
            output = BytesIO()
            image.convert("RGB").save(output, "JPEG", quality=95)
        return output.getvalue()
    except (ValidationError, ValueError, binascii.Error, OSError, Image.DecompressionBombError):
        raise GenerationError("ARK_INVALID_RESPONSE", "火山方舟返回的图片数据不完整或格式不符；未保存为成功结果，请核对控制台", diagnostics) from None
