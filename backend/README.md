# 好搭 · 后端

FastAPI 服务负责照片上传、风格与家具目录、异步图片生成、结果保存及商品搜索链接。默认读取同一仓库 `../frontend/` 的家具目录与公开参考图，部署时需一起保留。

## 启动

在仓库根目录执行：

```sh
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp -n .env.example .env
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

首次才需要创建虚拟环境、安装依赖和复制配置；不覆盖已有 `.env`。后端自带简易验收页 http://127.0.0.1:8000/ ，完整界面使用前端的 3000 端口。

## 模型与费用配置

- 默认 `IMAGE_PROVIDER=mock`，输出带标记的模拟结果，不发送模型请求。模拟任务仍沿用费用字段来测试预算流程，不代表实际扣费。
- 支持 `tudou`、`ark`、`siliconflow`、`modelscope`；只能手动切换，不会因失败自动换厂商或回退模拟。
- 所有真实密钥仅保存在后端被忽略的 `.env`。示例文件与前端不得填写密钥。

土豆 Gemini 接入字段：

| 字段 | 用途 |
| --- | --- |
| IMAGE_PROVIDER | 真实使用时设为 tudou |
| TUDOU_API_BASE_URL | 固定为 https://api.ai-tudou.net |
| TUDOU_API_KEY | 运行者自己的密钥，仅填本地 .env |
| TUDOU_MODEL_ID | gemini-3.1-flash-image-preview |
| TUDOU_TIMEOUT_SECONDS | 默认 180 秒 |
| TUDOU_ESTIMATED_COST_PER_IMAGE | 当前账号单次人民币费用的估算；默认 0 表示未知并阻止调用 |
| TUDOU_PHOTO_TRANSFER_APPROVED | 明确同意照片经土豆转发至 Gemini 后才设 true |

土豆使用 Gemini 原生 `generateContent`，传入房间原图及逐件商品参考，固定请求一张 2K 结果。不保证任何账号下的型号永久可用，也不将他人的历史单价视为你的实际价格。处理地区和上游留存规则未核实。

Ark 对应 `ARK_*` 字段，精确模型 `doubao-seedream-5-0-260128`；另外两家配置见 `.env.example`。

默认单次上限 ¥0.30、每月 ¥300，可通过 `COST_LIMIT_PER_IMAGE`、`COST_LIMIT_MONTHLY` 配置。按估算预留费用，失败也保守保留；不能保证供应商实际账单绝不超额。图片调用不自动重试，超时可能已经计费，先核对供应商账单。

## 接口

接口前缀 `/api/v1`，API 文档 http://127.0.0.1:8000/docs 。

| 方法与路径 | 用途 |
| --- | --- |
| POST /photos | 上传房间照片，返回 photo_id |
| GET /styles | 查询风格 |
| GET /styles/{style_id}/elements | 查询家具类别 |
| GET /generation-options | 查询提供方、就绪状态、参考图数量及费用估算 |
| POST /tasks | 确认费用后提交异步生成 |
| GET /tasks/{id} | 查询 processing / succeeded / failed 及诊断 |
| GET /tasks/{id}/image | 读取有效期内的结果图 |
| POST /tasks/{id}/products | 获取对应选购入口 |

提交选款示例：

```json
{
  "photo_id": "上传接口返回的 ID",
  "style_id": "mid-century",
  "element_ids": ["sofa"],
  "furniture_selections": [{"element_id": "sofa", "option_id": "sofa-2"}]
}
```

后端检查选款与类别对应，不接受任意用户图片 URL。Ark/Tudou 最多 13 件商品，另加一张房间原图；逐图提交，不截断或合并选款。模型协议限制不代表真实款式还原效果保证。

统一错误结构为 `{"error":{"code":"…","message":"…"}}`。只持久化固定错误文案及白名单诊断，不输出原始供应商报错、密钥或堆栈。

## 数据与安全

- 原图仅在服务内存暂存，不落库、不公开托管；刷新或重启后可能需要重传。
- 任务、选款快照和诊断保存于 SQLite，结果图默认保留 7 天。
- 重启会把未完成任务标记失败，不自动重提收费请求。
- 数据默认位于被忽略的 `data/`；仓库不含任何运行数据。
- 当前无完整登录、用户隔离、限流或并发原子预算，不适合直接公开公网。见 [安全说明](../SECURITY.md)。

## 测试

在本目录运行：

```sh
.venv/bin/python -m pytest -q
```

测试使用模拟请求，不调用真实付费模型。真实效果须由用户确认费用后另行验收。
