import os
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .core.config import get_settings
from .models.task import Base, GenerationTask, TaskGenerationDetails

settings = get_settings()
os.makedirs(settings.data_dir, exist_ok=True)

_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)
engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    # 进程重启后，未完成的生成任务已丢失，标记为失败（避免永久 processing）
    with SessionLocal() as db:
        interrupted = db.query(GenerationTask.id).filter(GenerationTask.status == "processing")
        db.query(TaskGenerationDetails).filter(TaskGenerationDetails.task_id.in_(interrupted)).update({
            "error_code": "GENERATION_INTERRUPTED",
            "error_message": "后端重启中断了任务；原图未留存，请先核对供应商账单，再决定是否重新上传生成",
        }, synchronize_session=False)
        db.query(GenerationTask).filter(GenerationTask.status == "processing").update({"status": "failed"})
        db.commit()
