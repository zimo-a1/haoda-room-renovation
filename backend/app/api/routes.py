import json
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..core.config import get_settings
from ..core.photo_store import get as photo_get, pop as photo_pop, put as photo_put
from ..core.security import validate_image
from ..db import SessionLocal
from ..models.task import GenerationTask, TaskFurnitureSelections, TaskGenerationDetails, TaskProviderDiagnostics
from ..schemas.api import GenerationDiagnostics, GenerationOptions, ProductsResponse, TaskCreateRequest, TaskError, TaskResponse
from ..services import ark, catalog, cost, furniture, image_gen, storage, taobaoke, tudou

router = APIRouter(prefix="/api/v1")
settings = get_settings()


def _err(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


@router.post("/photos")
async def upload_photo(file: UploadFile = File(...)):
    content = await file.read()
    try:
        validate_image(content, file.filename or "")
    except ValueError as e:
        raise _err(400, "INVALID_IMAGE", str(e))
    photo_id = uuid.uuid4().hex
    photo_put(photo_id, content)
    return {"photo_id": photo_id}


@router.get("/styles")
def list_styles():
    return {"styles": catalog.list_styles()}


@router.get("/generation-options", response_model=GenerationOptions)
def generation_options():
    """仅公开生成确认所需信息，不返回密钥、接口地址或内部路径。"""
    provider = settings.image_provider
    label = {"ark": "火山方舟国内图像服务", "siliconflow": "SiliconFlow 国内图像服务", "modelscope": "ModelScope 国内图像服务", "mock": "本地模拟模式（不调用真实模型）"}.get(provider, "尚未配置的图像服务")
    if provider == "tudou":
        label = "土豆平台转发的 Gemini 图像服务（处理地区与留存规则未核实）"
    try:
        _, model, estimate = image_gen.provider_details()
        image_gen.validate_reference_provider()
        configured, message = True, ""
    except ValueError as exc:
        model, estimate = "", settings.cost_limit_per_image
        configured = False
        message = "图像服务尚未就绪，请检查后端密钥、模型和预算配置并重启后端"
        if provider == "tudou":
            message = str(exc)
            label += "；配置或单价尚未就绪，不能提交"
    if provider == "ark":
        model = ark.ARK_MODEL_ID
    if provider == "tudou":
        model = tudou.MODEL_ID
    return GenerationOptions(
        provider=provider, provider_label=label, model=model, configured=configured,
        max_product_images=ark.MAX_PRODUCT_IMAGES if provider in {"ark", "tudou"} else 24,
        individual_references=provider in {"ark", "tudou"}, estimated_cost=estimate, message=message,
    )


@router.get("/styles/{style_id}/elements")
def list_elements(style_id: str):
    elements = catalog.list_elements(style_id)
    if elements is None:
        raise _err(404, "STYLE_NOT_FOUND", "风格不存在")
    return {"style_id": style_id, "elements": elements}


@router.post("/tasks", response_model=TaskResponse)
def create_task(req: TaskCreateRequest, background: BackgroundTasks):
    photo = photo_get(req.photo_id)
    if photo is None:
        raise _err(404, "PHOTO_NOT_FOUND", "照片已失效，请重新上传")
    style = catalog.get_style(req.style_id)
    if style is None:
        raise _err(404, "STYLE_NOT_FOUND", "风格不存在")
    elements = catalog.get_elements(req.element_ids)
    if not elements or len(elements) != len(req.element_ids) or len(set(req.element_ids)) != len(req.element_ids):
        raise _err(400, "INVALID_ELEMENTS", "未选择有效的软装元素")

    selected, references = [], None
    if req.furniture_selections is not None:
        try:
            selected = furniture.resolve_selections(req.furniture_selections, elements)
            if settings.image_provider in {"ark", "tudou"} and len(selected) > ark.MAX_PRODUCT_IMAGES:
                raise _err(400, "TOO_MANY_REFERENCE_IMAGES", "每次最多选择 13 件商品，另加 1 张房间原图，请减少选款")
            references = furniture.prepare_references(selected, individual=settings.image_provider in {"ark", "tudou"})
        except furniture.InvalidFurnitureSelection as exc:
            raise _err(400, "INVALID_FURNITURE_SELECTION", str(exc))
        except furniture.FurnitureAssetsUnavailable as exc:
            raise _err(503, "FURNITURE_ASSETS_UNAVAILABLE", str(exc))
        try:
            image_gen.validate_reference_provider()
        except ValueError as exc:
            code = "ARK_NOT_CONFIGURED" if settings.image_provider == "ark" and not settings.ark_api_key.strip() else "REFERENCE_MODEL_UNAVAILABLE"
            raise _err(503, code, str(exc))

    try:
        provider, model_id, est_cost = image_gen.provider_details()
    except ValueError as exc:
        code = "ARK_NOT_CONFIGURED" if settings.image_provider == "ark" and not settings.ark_api_key.strip() else "IMAGE_MODEL_UNAVAILABLE"
        raise _err(503, code, str(exc))
    if provider in {"ark", "tudou"}:
        try:
            ark.validate_images([photo] + (references.images if references else []))
        except ValueError as exc:
            raise _err(400, "INVALID_REFERENCE_IMAGE", str(exc))
    try:
        cost.check_cost_limit(est_cost)
    except ValueError as e:
        raise _err(402, "COST_LIMIT", str(e))

    task_id = uuid.uuid4().hex
    task = GenerationTask(
        id=task_id,
        style_id=req.style_id,
        element_ids=json.dumps(req.element_ids, ensure_ascii=False),
        status="processing",
        cost=est_cost,
    )
    with SessionLocal() as db:
        db.add(task)
        db.flush()
        db.add(TaskGenerationDetails(
            task_id=task_id, provider=provider, model_id=model_id,
            input_image_count=1 + (len(references.images) if references else 0),
        ))
        if selected:
            db.add(TaskFurnitureSelections(
                task_id=task_id,
                selections_json=json.dumps([item.model_dump() for item in selected], ensure_ascii=False),
            ))
        db.commit()

    photo_pop(req.photo_id)  # 照片从内存移除；字节交给后台任务，出图后即弃
    background.add_task(_run_generation, task_id, photo, style["name"], [e["name"] for e in elements], references)
    return TaskResponse(
        task_id=task_id,
        status="processing",
        style_id=req.style_id,
        element_ids=req.element_ids,
        result_image_url=None,
        cost=est_cost,
        furniture_selections=selected,
        generation_provider=provider,
        generation_model=model_id,
        input_image_count=1 + (len(references.images) if references else 0),
    )


def _run_generation(task_id: str, photo_bytes: bytes, style_name: str, element_names: list[str], references: furniture.FurnitureReferences | None = None) -> None:
    """后台执行出图，完成后更新任务状态；失败标记为 failed。"""
    try:
        result_bytes = image_gen.generate_renovation_image(photo_bytes, style_name, element_names, references)
        result_path = storage.save_result(task_id, result_bytes)
        with SessionLocal() as db:
            task = db.get(GenerationTask, task_id)
            if task is not None:
                task.status = "succeeded"
                task.result_image_path = result_path
                db.commit()
    except Exception as exc:
        with SessionLocal() as db:
            task = db.get(GenerationTask, task_id)
            if task is not None:
                task.status = "failed"
                detail = db.get(TaskGenerationDetails, task_id)
                if detail is not None:
                    # 只允许固定安全错误透传；其他异常不能把密钥或堆栈带入结果。
                    detail.error_code = exc.code if isinstance(exc, ark.GenerationError) else "GENERATION_FAILED"
                    detail.error_message = exc.message if isinstance(exc, ark.GenerationError) else "生成未完成，请核对图像服务状态后重试"
                if isinstance(exc, ark.GenerationError) and exc.diagnostics is not None:
                    db.merge(TaskProviderDiagnostics(task_id=task_id, **exc.diagnostics.model_dump()))
                db.commit()


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: str):
    with SessionLocal() as db:
        task = db.get(GenerationTask, task_id)
        selection_record = db.get(TaskFurnitureSelections, task_id)
        detail = db.get(TaskGenerationDetails, task_id)
        diagnostics = db.get(TaskProviderDiagnostics, task_id)
    if task is None:
        raise _err(404, "TASK_NOT_FOUND", "任务不存在")
    return TaskResponse(
        task_id=task.id,
        status=task.status,
        style_id=task.style_id,
        element_ids=json.loads(task.element_ids),
        result_image_url=f"/api/v1/tasks/{task.id}/image" if task.result_image_path else None,
        cost=task.cost,
        furniture_selections=json.loads(selection_record.selections_json) if selection_record else [],
        generation_provider=detail.provider if detail else None,
        generation_model=detail.model_id if detail else None,
        input_image_count=detail.input_image_count if detail else None,
        error=TaskError(code=detail.error_code, message=detail.error_message) if detail and detail.error_code and detail.error_message else None,
        diagnostics=GenerationDiagnostics.model_validate(diagnostics, from_attributes=True) if diagnostics else None,
    )


@router.get("/tasks/{task_id}/image")
def get_task_image(task_id: str):
    with SessionLocal() as db:
        task = db.get(GenerationTask, task_id)
    if task is None or not task.result_image_path:
        raise _err(404, "IMAGE_NOT_FOUND", "结果图不存在")
    path = Path(task.result_image_path)
    if not path.exists():
        raise _err(404, "IMAGE_NOT_FOUND", "结果图不存在")
    return FileResponse(path, media_type="image/jpeg")


@router.post("/tasks/{task_id}/products", response_model=ProductsResponse)
def task_products(task_id: str):
    with SessionLocal() as db:
        task = db.get(GenerationTask, task_id)
    if task is None:
        raise _err(404, "TASK_NOT_FOUND", "任务不存在")
    style = catalog.get_style(task.style_id)
    style_name = style["name"] if style else ""
    elements = catalog.get_elements(json.loads(task.element_ids))
    return taobaoke.query_products(elements, style_name)
