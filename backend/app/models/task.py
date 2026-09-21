from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class GenerationTask(Base):
    __tablename__ = "generation_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    style_id: Mapped[str] = mapped_column(String(64), nullable=False)
    element_ids: Mapped[str] = mapped_column(Text, nullable=False)  # JSON 数组字符串
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="processing")
    result_image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)


class TaskFurnitureSelections(Base):
    """追加独立表，保留已有任务及旧数据库结构，持久化本次选款快照。"""

    __tablename__ = "task_furniture_selections"

    task_id: Mapped[str] = mapped_column(ForeignKey("generation_tasks.id"), primary_key=True)
    selections_json: Mapped[str] = mapped_column(Text, nullable=False)


class TaskGenerationDetails(Base):
    """追加溯源表；不改旧任务表，不存照片、提示词、密钥或上游原始错误。"""

    __tablename__ = "task_generation_details"

    task_id: Mapped[str] = mapped_column(ForeignKey("generation_tasks.id"), primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model_id: Mapped[str] = mapped_column(String(128), nullable=False)
    input_image_count: Mapped[int] = mapped_column(Integer, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(255), nullable=True)


class TaskProviderDiagnostics(Base):
    """追加诊断表，不迁移旧表；不追补无法还原的历史上游错误。"""

    __tablename__ = "task_provider_diagnostics"

    task_id: Mapped[str] = mapped_column(ForeignKey("generation_tasks.id"), primary_key=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    upstream_code: Mapped[str | None] = mapped_column(String(96), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    response_kind: Mapped[str] = mapped_column(String(16), nullable=False)
