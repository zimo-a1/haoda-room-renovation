from urllib.parse import quote

from ..core.config import get_settings
from .catalog import get_product_types
from .manual_products import MANUAL_PRODUCTS

settings = get_settings()

_TAOBAO_SEARCH = "https://s.taobao.com/search?q={query}"


def query_products(elements: list[dict], style_name: str = "") -> dict:
    """查询软装元素对应的购买商品。

    - 已配置淘宝客 API：调用选品库 + 推广链接（待验）。
    - 未配置：返回静态商品链接（按元素给出具体商品类型，跳转淘宝搜索页，无佣金）。
    """
    if settings.taobaoke_api_url and settings.taobaoke_app_key:
        return _query_real_api(elements)
    return _static_links(elements, style_name)


def _static_links(elements: list[dict], style_name: str) -> dict:
    products = []
    for e in elements:
        manual = MANUAL_PRODUCTS.get(e["id"])
        if manual:
            items = [
                {
                    "title": m["name"],
                    "click_url": m["click_url"],
                    "image_url": m.get("image_url"),
                    "price": m.get("price"),
                }
                for m in manual
            ]
        else:
            types = get_product_types(e["id"]) or [e["name"]]
            items = []
            for t in types:
                query = f"{style_name} {t}".strip()
                items.append(
                    {
                        "title": t,
                        "click_url": _TAOBAO_SEARCH.format(query=quote(query)),
                        "image_url": None,
                        "price": None,
                    }
                )
        products.append(
            {
                "element_id": e["id"],
                "element_name": e["name"],
                "items": items,
            }
        )
    return {
        "configured": False,
        "message": "静态商品链接（未接联盟，无佣金）",
        "products": products,
    }


def _query_real_api(elements: list[dict]) -> dict:
    # TODO 待验：真实选品库查询 + 推广链接生成
    products = [
        {
            "element_id": e["id"],
            "element_name": e["name"],
            "items": [],
        }
        for e in elements
    ]
    return {"configured": True, "message": "淘宝客 API 已配置（真实查询待验）", "products": products}
