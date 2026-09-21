import os

from ..core.config import get_settings

settings = get_settings()


def save_result(task_id: str, data: bytes) -> str:
    """保存效果图到本地目录，返回路径。"""
    d = os.path.join(settings.data_dir, "results")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, f"{task_id}.jpg")
    with open(p, "wb") as f:
        f.write(data)
    return p
