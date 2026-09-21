from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "软装改造应用"

    # 图像模型提供方：mock / ark / tudou / siliconflow / modelscope
    image_provider: str = "mock"
    image_timeout_seconds: int = 120

    # 火山方舟：保留产品经理指定的精确模型 ID，不自动切换型号或供应商。
    ark_api_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    ark_api_key: str = ""
    ark_model_id: str = "doubao-seedream-5-0-260128"
    ark_timeout_seconds: int = 180
    # 保守预算占位，并非供应商报价；真实调用前核实控制台单价。
    ark_estimated_cost_per_image: float = 0.30

    # 土豆 Gemini 原生图像接口；单价未知或未授权照片转发时拒绝提交。
    tudou_api_base_url: str = "https://api.ai-tudou.net"
    tudou_api_key: str = ""
    tudou_model_id: str = "gemini-3.1-flash-image-preview"
    tudou_estimated_cost_per_image: float = 0.0  # 未核实，不能作为免费出图价格。
    tudou_photo_transfer_approved: bool = False
    tudou_timeout_seconds: int = 180

    # SiliconFlow
    siliconflow_api_url: str = "https://api.siliconflow.cn/v1"
    siliconflow_api_key: str = ""
    siliconflow_model_id: str = "Qwen/Qwen-Image-Edit-2509"

    # ModelScope（魔搭）
    modelscope_api_url: str = "https://api-inference.modelscope.cn/v1"
    modelscope_api_key: str = ""
    modelscope_model_id: str = "Qwen/Qwen-Image-Edit-2511"
    modelscope_poll_timeout_seconds: int = 300

    # 成本上限（元）
    cost_limit_per_image: float = 0.3
    cost_limit_monthly: float = 300.0

    # 主模型 LLM（F1-F5 不触发，预留 /chat 能力）
    model_id: str = ""
    model_base_url: str = ""
    model_api_key: str = ""

    # 淘宝客（淘宝联盟）
    taobaoke_api_url: str = ""
    taobaoke_app_key: str = ""
    taobaoke_app_secret: str = ""
    taobaoke_pid: str = ""

    # 存储与数据库
    data_dir: str = "data"
    database_url: str = "sqlite:///./data/app.db"
    result_retention_days: int = 7

    # 与前端共用版本化款式目录；独立部署后端时需一起打包或显式配置路径。
    furniture_catalog_path: Path = Path(__file__).resolve().parents[3] / "frontend/features/renovation/furniture-catalog.json"
    furniture_image_dir: Path = Path(__file__).resolve().parents[3] / "frontend/public/images/furniture"


@lru_cache
def get_settings() -> Settings:
    return Settings()
