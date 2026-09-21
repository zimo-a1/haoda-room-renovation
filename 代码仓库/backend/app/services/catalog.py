"""风格、软装元素与商品类型的静态目录（MVP 内置；后续可接联盟选品库动态映射）。"""

STYLES = [
    {"id": "nordic", "name": "北欧风"},
    {"id": "japanese", "name": "日式原木"},
    {"id": "cream", "name": "奶油风"},
    {"id": "french", "name": "法式"},
    {"id": "mid-century", "name": "中古风"},
]

ELEMENTS = [
    # 客厅
    {"id": "sofa", "name": "沙发", "room": "客厅"},
    {"id": "coffee-table", "name": "茶几", "room": "客厅"},
    {"id": "tv-stand", "name": "电视柜", "room": "客厅"},
    {"id": "floor-lamp", "name": "落地灯", "room": "客厅"},
    {"id": "living-main-light", "name": "主灯", "room": "客厅"},
    {"id": "rug", "name": "地毯", "room": "客厅"},
    {"id": "curtain", "name": "窗帘", "room": "客厅"},
    {"id": "wall-art", "name": "挂画", "room": "客厅"},
    {"id": "green-plant", "name": "绿植", "room": "客厅"},
    {"id": "cushion", "name": "抱枕", "room": "客厅"},
    {"id": "side-table", "name": "边几", "room": "客厅"},
    # 卧室
    {"id": "bed", "name": "床", "room": "卧室"},
    {"id": "bedding", "name": "床品四件套", "room": "卧室"},
    {"id": "nightstand", "name": "床头柜", "room": "卧室"},
    {"id": "wardrobe", "name": "衣柜", "room": "卧室"},
    {"id": "dressing-table", "name": "梳妆台", "room": "卧室"},
    {"id": "table-lamp", "name": "台灯", "room": "卧室"},
    {"id": "desk", "name": "书桌", "room": "卧室"},
    {"id": "bedroom-main-light", "name": "主灯", "room": "卧室"},
    {"id": "bedroom-rug", "name": "地毯", "room": "卧室"},
    # 餐厅
    {"id": "dining-table", "name": "餐桌", "room": "餐厅"},
    {"id": "dining-chair", "name": "餐椅", "room": "餐厅"},
    {"id": "sideboard", "name": "餐边柜", "room": "餐厅"},
    {"id": "pendant-lamp", "name": "吊灯", "room": "餐厅"},
]

# 每个元素对应的具体商品类型（用于静态搜索链接；接联盟后由选品库 API 替换）
PRODUCT_TYPES = {
    "sofa": ["三人位布艺沙发", "科技布沙发", "真皮沙发", "沙发床"],
    "coffee-table": ["实木茶几", "岩板茶几", "玻璃茶几"],
    "tv-stand": ["实木电视柜", "岩板电视柜", "悬浮电视柜"],
    "floor-lamp": ["落地灯", "钓鱼灯", "复古落地灯"],
    "rug": ["客厅大地毯", "羊毛地毯", "几何图案地毯"],
    "curtain": ["遮光窗帘", "纱帘", "罗马帘"],
    "wall-art": ["装饰画三联", "抽象挂画", "风景画"],
    "green-plant": ["琴叶榕", "龟背竹", "仿真绿植"],
    "cushion": ["布艺抱枕", "刺绣抱枕", "腰枕"],
    "side-table": ["实木边几", "金属边几", "玻璃边几"],
    "bed": ["1.5米实木床", "1.8米软包床", "箱体收纳床", "榻榻米床"],
    "bedding": ["纯棉四件套", "天丝四件套", "磨毛四件套"],
    "nightstand": ["实木床头柜", "简约床头柜", "带抽屉床头柜"],
    "wardrobe": ["推拉门衣柜", "平开门衣柜", "实木衣柜"],
    "dressing-table": ["实木梳妆台", "带镜梳妆台", "小户型梳妆台"],
    "table-lamp": ["床头台灯", "护眼台灯", "复古台灯"],
    "desk": ["实木书桌", "升降书桌", "转角书桌"],
    "living-main-light": ["客厅吸顶灯", "客厅吊灯", "全铜吊灯"],
    "bedroom-main-light": ["卧室吸顶灯", "卧室吊灯", "智能吸顶灯"],
    "bedroom-rug": ["卧室床边地毯", "长毛地毯", "简约卧室地毯"],
    "dining-table": ["实木餐桌", "岩板餐桌", "折叠餐桌"],
    "dining-chair": ["实木餐椅", "软包餐椅", "藤编餐椅"],
    "sideboard": ["实木餐边柜", "玻璃餐边柜", "吧台餐边柜"],
    "pendant-lamp": ["餐厅吊灯", "玻璃吊灯", "工业风吊灯"],
}


def list_styles() -> list[dict]:
    return STYLES


def get_style(style_id: str) -> dict | None:
    for s in STYLES:
        if s["id"] == style_id:
            return s
    return None


def list_elements(style_id: str) -> list[dict] | None:
    if get_style(style_id) is None:
        return None
    return ELEMENTS


def get_elements(ids: list[str]) -> list[dict]:
    by_id = {e["id"]: e for e in ELEMENTS}
    return [by_id[i] for i in ids if i in by_id]


def get_product_types(element_id: str) -> list[str]:
    return PRODUCT_TYPES.get(element_id, [])
