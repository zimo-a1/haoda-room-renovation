"""手动商品清单（产品经理指定）。

格式：元素 id -> 商品列表，每个商品包含：
- name: 商品名称
- click_url: 购买链接（淘宝/京东商品页）
- image_url: 商品图（可选，图片 URL）
- price: 价格（可选）

未在此配置的元素，回退到静态搜索链接。
"""

MANUAL_PRODUCTS: dict[str, list[dict]] = {
    # 示例（待产品经理提供后填写）：
    # "bed": [
    #     {"name": "北欧风 1.5 米实木床", "image_url": "https://...", "click_url": "https://...", "price": "¥1299"},
    # ],
}
