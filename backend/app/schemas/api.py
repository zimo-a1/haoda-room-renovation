from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class FurnitureSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    element_id: str = Field(min_length=1, max_length=64)
    option_id: str = Field(min_length=1, max_length=64)


class SelectedFurniture(BaseModel):
    element_id: str
    option_id: str
    element_name: str
    room: str
    option_name: str
    image: str
    panel: int


class TaskCreateRequest(BaseModel):
    photo_id: str
    style_id: str
    element_ids: list[str] = Field(min_length=1, max_length=24)
    # 缺省兼容旧验收页；新版前端必须一类家具对应一个有效款式。
    furniture_selections: list[FurnitureSelection] | None = Field(default=None, max_length=24)


class TaskError(BaseModel):
    code: str
    message: str


class GenerationDiagnostics(BaseModel):
    """只保留受限标识字段，不能容纳原始响应、提示词或图片。"""

    model_config = ConfigDict(extra="forbid")

    http_status: int | None = Field(default=None, ge=100, le=599)
    upstream_code: str | None = Field(default=None, max_length=96, pattern=r"^[A-Za-z][A-Za-z0-9_.-]*$")
    request_id: str | None = Field(default=None, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
    response_kind: Literal["json", "non_json", "transport"]


class GenerationOptions(BaseModel):
    provider: str
    provider_label: str
    model: str
    configured: bool
    max_product_images: int
    individual_references: bool
    estimated_cost: float
    message: str


class TaskResponse(BaseModel):
    task_id: str
    status: str
    style_id: str
    element_ids: list[str]
    result_image_url: str | None = None
    cost: float | None = None
    furniture_selections: list[SelectedFurniture] = Field(default_factory=list)
    # 新字段兼容旧客户端；cost 始终是预算估算，不是供应商实际账单。
    generation_provider: str | None = None
    generation_model: str | None = None
    input_image_count: int | None = None
    error: TaskError | None = None
    diagnostics: GenerationDiagnostics | None = None


class ProductLink(BaseModel):
    title: str
    click_url: str
    image_url: str | None = None
    price: str | None = None


class ElementProducts(BaseModel):
    element_id: str
    element_name: str
    items: list[ProductLink]


class ProductsResponse(BaseModel):
    configured: bool
    message: str
    products: list[ElementProducts]
