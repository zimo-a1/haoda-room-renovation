from datetime import datetime, timezone

from sqlalchemy import func

from ..core.config import get_settings
from ..db import SessionLocal
from ..models.task import GenerationTask

settings = get_settings()


def month_total_cost() -> float:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    start = datetime(now.year, now.month, 1)
    with SessionLocal() as db:
        total = (
            db.query(func.coalesce(func.sum(GenerationTask.cost), 0.0))
            .filter(GenerationTask.created_at >= start)
            .scalar()
        )
    return float(total)


def check_cost_limit(estimated_cost: float) -> None:
    """单次或月度超限抛 ValueError。"""
    if estimated_cost > settings.cost_limit_per_image:
        raise ValueError(f"单次出图成本超过上限（¥{settings.cost_limit_per_image}）")
    total = month_total_cost()
    if total + estimated_cost > settings.cost_limit_monthly:
        raise ValueError(f"本月出图预算已用尽（¥{settings.cost_limit_monthly}）")
