# 软装改造应用 · 后端

老房/毛坯房软装改造应用的后端服务：上传房间照片 → 选风格/元素 → AI 生成同角度效果图 → 图内商品跳淘宝购买。

## 当前范围（F1–F5）
- F1 照片上传、F2 风格筛选、F3 软装元素挑选、F4 同角度效果图生成（异步任务）、F5 商品跳转。
- 未做：登录、F6 转化追踪、独立任务队列（当前用后台任务）。

## 环境要求
- Python 3.12.x
- （可选）浏览器访问验收页

## 启动（一条命令）
```bash
cd 代码仓库/backend
python3.12 -m venv .venv                  # 首次
.venv/bin/pip install -r requirements.txt # 首次
cp -n .env.example .env                   # 仅首次创建，不覆盖已有配置
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

打开浏览器访问 http://127.0.0.1:8000/ 即验收页。

## 环境变量（.env）
关键配置（完整清单见 `.env.example`）：
- `IMAGE_PROVIDER`：图像提供方，`tudou`（当前本地配置，单价待确认）/ `ark`（示例）/ `siliconflow` / `modelscope` / `mock`；无配置时程序默认 mock，真实提供方缺密钥时明确拒绝，不回退 mock。
- 火山方舟：`ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3`、`ARK_API_KEY`、`ARK_MODEL_ID=doubao-seedream-5-0-260128`、`ARK_TIMEOUT_SECONDS=180`。网址首页不能用作 API 地址；当前适配锁定国内北京入口及指定模型，不能静默改 Lite/Pro 或其他厂商。
- `ARK_ESTIMATED_COST_PER_IMAGE=0.30`：每次请求 1 张输出的保守预算估算，**不是该模型官方报价或实际账单**。真实调用前核对控制台单价，不按输入照片数量乘算；超出单次/月预算拒绝提交。
- SiliconFlow：`SILICONFLOW_API_URL`、`SILICONFLOW_API_KEY`、`SILICONFLOW_MODEL_ID`（`Qwen/Qwen-Image-Edit-2509`）
- 魔搭：`MODELSCOPE_API_URL`、`MODELSCOPE_API_KEY`、`MODELSCOPE_MODEL_ID`（`Qwen/Qwen-Image-Edit-2511`）
- `COST_LIMIT_PER_IMAGE`：单次出图成本上限（默认 0.30 元）
- `COST_LIMIT_MONTHLY`：每月出图预算（默认 300 元）
- `TAOBAOKE_*`：淘宝客 API 配置（未配置时用静态链接兜底）
- `FURNITURE_CATALOG_PATH` / `FURNITURE_IMAGE_DIR`：可选覆盖路径。默认读取同仓库 `frontend/features/renovation/furniture-catalog.json` 与 `frontend/public/images/furniture/`；独立打包后端时必须带上这份目录和全部版本化 PNG，并设置对应绝对路径，不需要安装前端依赖。不允许用任意用户 URL 替代图库。

## 接口说明（异步任务）
- `GET /api/v1/generation-options`：返回确认页所需的提供方、模型、是否配置就绪、商品图片上限、是否逐图输入及费用估算。不会返回 Key、API 地址、文件路径；配置就绪不表示真实权限或效果已通过。
- `POST /api/v1/tasks`：提交生成，立即返回 `{task_id, status: "processing"}`，后台出图。
- `GET /api/v1/tasks/{id}`：轮询任务；`status` 为 `processing` / `succeeded` / `failed`；成功后 `result_image_url` 可用。
- `GET /api/v1/tasks/{id}/image`：取效果图。
- `POST /api/v1/tasks/{id}/products`：取元素对应商品/链接。
- 进程重启会把遗留 `processing` 任务标记为 `failed`。

### 按具体款式生成（2026-09-19）

火山接入更新：`ark` 分支为 **1 张房间原图 + 1–13 张已选商品单图**，严格按选款顺序传入 `image` 数组，不压成参考板、不截断；原图占第 1 张。超出 13 件在提交前拒绝。这个上限是本项目适配约束，账号对指定型号的真实权限及 14 张输入仍待实测。每次关闭组图与流式输出，只请求一张 2K 结果；使用 Base64 输入/输出，不公开上传房间图，也不跟随任意图片下载地址。

前端确认框从后端读取厂商与配置，缺 Key 禁止提交。切换供应商只需修改后端 `.env` 后重启；不会自动调用保留的旧供应商。

`POST /api/v1/tasks` 请求示例（点击确认后才会计费）：

```json
{
  "photo_id": "上传接口返回的 ID",
  "style_id": "mid-century",
  "element_ids": ["sofa"],
  "furniture_selections": [{"element_id": "sofa", "option_id": "sofa-2"}]
}
```

- `furniture_selections` 为可选新增字段。旧验收页不传该字段时维持类别生成；新版前端必须传完整选款。显式空列表、漏项、重复、跨类别款式、未知选项均拒绝，不能静默退回类别生成。
- 成功回执及 `GET /tasks/{id}` 新增 `furniture_selections` 数组，含 `element_id / option_id / element_name / room / option_name / image / panel`。保存在追加表 `task_furniture_selections`；旧表和已有任务不迁移、不删除，旧任务返回空数组。
- 后端从可信目录裁出选中单格。SiliconFlow 的 `image` 为原始房间，`image2/image3` 为家具参考图；1–2 件直接传单图，超过 2 件分为两张编号参考板，全部选款保留。生成调用仍为一次，不自动逐件重生成。
- SiliconFlow 参考参数仅启用于 `Qwen/Qwen-Image-Edit-2509`；ModelScope 沿用 `image_url` 数组，适配官方 2509/2511（本轮该分支仅离线协议测试，不代表真实效果验收）。不支持的模型返回 `503 REFERENCE_MODEL_UNAVAILABLE`，不悄悄忽略参考图。
- 错误统一 `{"error":{"code":"…","message":"…"}}`：选款不一致 `400 INVALID_FURNITURE_SELECTION`；超出 Ark 13 件限制 `400 TOO_MANY_REFERENCE_IMAGES`；尺寸无效 `400 INVALID_REFERENCE_IMAGE`；图库缺失 `503 FURNITURE_ASSETS_UNAVAILABLE`；Ark 缺 Key `503 ARK_NOT_CONFIGURED`；非法字段 `422 VALIDATION_ERROR`。这些检查在消耗照片、创建任务及模型调用前完成。
- 新任务另存 `task_generation_details` 追加表，记录厂商、精确模型、实际输入图数及脱敏错误码；旧任务表不修改。任务回执新增 `generation_provider / generation_model / input_image_count / error`；旧任务对应字段为 null。`failed` 的错误可通过 GET 重读，重启仍在；处理中任务在重启后标记 `GENERATION_INTERRUPTED`，不擅自重提付费任务。
- Ark 超时、权限、限流、损坏响应有固定错误；不将上游原始报错回显或落库。POST 自动重试次数为 0，超时可能已经计费，应先核对账单。仅当返回恰好一张有效图片时才保存为成功，并规范为 JPEG。`cost` 是预算预留，失败也保守保留，不伪称供应商实际扣费。
- `GET /tasks/{id}` 新增可空 `diagnostics`：`http_status`（100–599 或 null）、`upstream_code`（最多 96 字符）、`request_id`（最多 128 字符）、`response_kind`（json / non_json / transport）。只从指定字段取值，限制字符、过滤已配置密钥；不保存上游 message、原始响应、提示词、图片或鉴权头。失败时与任务状态一起写入追加表 `task_provider_diagnostics`；重启可恢复，旧记录返回 null，不追补或重跑。
- 普通 404 返回 `ARK_HTTP_NOT_FOUND`，不能据此断言模型未开通；401 为 `ARK_AUTHENTICATION_FAILED`，403 为 `ARK_PERMISSION_DENIED`。只有明确上游 ModelNotOpen / ModelNotFound / InvalidEndpoint / InvalidEndpointOrModel 才作相应模型或接入点分类（保留不确定性）。非 JSON 返回和传输失败也有诊断，HTTP 200 内的错误同样拒绝保存成功图片。前端确认框和任务结果页显示安全诊断用于截图反馈。
- 官方参考：[SiliconFlow 图像生成参数](https://docs.siliconflow.cn/docs/api/images-generations-post)。参考图是外观约束，不是像素级商品合成；目前为 AI 示意图库，不能冒称真实 SKU 或保证细节完全相同。

## 验证

### 2026-09-19 可见水印与搭配优化

- 经产品经理确认，Ark 新请求显式发送 `watermark=false`，只关闭后续图内可见角标；不裁切、覆盖或重写旧结果文件。页面仍明确显示 AI 效果示意，不冒充实拍。当前没有新增 `.env` 项，不需要改 Key 或型号。
- 摆位改为允许已选家具在原功能分区内小范围调整位置和朝向；商品结构、材质、配色、纹样及房间硬装/机位保持。未选软装包括窗帘不擅自修改，不添加清单外装饰，也不靠拉伸缩小产品塞满房间。
- 根据已选类别加入床边通道、桌柜使用空间、灯具比例、地毯轴线和自然光影要求；三款床头柜附加已核验 `nightstand-v1` 对应单格的结构描述，防止开放格变抽屉。更换图集版本/单格后不套用旧款结构描述，须重新核验。
- 这些是单次生成的输入约束，不是后置视觉检测或效果保证。没有增加第二个模型、额外出图或自动重试；真实费用仍以原确认与账单为准。后端离线 117/117，真实新策略样例待用户自行前端确认后验收。

### 自动化测试（mock，离线可跑）
```bash
.venv/bin/python -m pytest tests/ -v
```

### 手工验收（照着点）
1. 打开 http://127.0.0.1:8000/
2. 上传一张房间照片 → 显示「上传成功」
3. 选风格 → 勾选元素 → 点「生成」→ 提示「已提交，生成中…」（异步任务，约 30 秒）
4. 出图后显示真实效果图；下方列出所选元素的商品链接

## 已知限制 / 待验
- 图像模型：当前配置为火山方舟 `doubao-seedream-5-0-260128`，本地 ARK_API_KEY 已填写并重启加载，前端 configured=true。用户已用 6 / 9 件选款成功出图；这不等于商品一致性、美观或最新水印/摆位策略已通过。原 SiliconFlow / ModelScope 适配及本地配置保留，不自动切回。
- 商品购买：当前用静态淘宝搜索链接（无佣金、无转化追踪）；接联盟 Key 后可升级为真实选品 + 佣金。
- 照片不落库、不留存，仅内存暂存，生成后即删。
- 用户早先 8 张输入的 Ark 任务失败，之后 7 / 10 张输入的两次任务成功。旧失败无上游原始诊断，原因未追补。最新水印与搭配优化仍未代用户生成；由用户刷新、重新上传并确认费用后对照测试。6 / 9 件成功出图不代替 11–13 件商品验收，也不承诺模型必然还原每一项。
- 样例文件密钥已清空；此前出现过凭证的旧文件/历史记录仍可能含旧值，须在原供应商控制台吊销并换新。不要将真实密钥再次填写到 `.env.example`。

本次接入、官方参数依据与验收记录：`代码仓库/阶段文档/火山方舟Seedream接入说明.md`、`docs/evidence/阶段3/火山方舟接入验证.md`；诊断修复见 `docs/evidence/阶段3/火山错误诊断修复.md`，最新搭配优化见 `docs/evidence/阶段3/可见水印与搭配优化.md`。后端离线测试 117/117；用户旧策略已出图但款式和美观未通过，新策略待实测，不宣布阶段完成。
## 土豆 Gemini 接入（2026-09-21）

已实现 Gemini 原生 `generateContent`，本地选择 `IMAGE_PROVIDER=tudou`，精确型号 `gemini-3.1-flash-image-preview`。后端 `.env` 填入 `TUDOU_API_KEY`；地址固定为 `https://api.ai-tudou.net`。`TUDOU_TIMEOUT_SECONDS` 默认 180 秒。经明确同意后设置 `TUDOU_PHOTO_TRANSFER_APPROVED=true`；处理地区/留存未核实。

`TUDOU_ESTIMATED_COST_PER_IMAGE=0` 表示未知并阻止生成，不是免费。核对当前分组人民币单价后设置正数，仍受每次 ¥0.30/月 ¥300 上限约束。未就绪时确认框显示费用“待确认”，按钮禁用，后端直接请求同样拒绝。

一次传原图和最多 13 张商品单图，固定 2K 单张结果，比例取最接近原图的标准比例。不保证任意比例像素对齐或 13 件保真。不重试、不换型、不跟随重定向/图片 URL。只接受有效 Base64 图片，排除思考图片和多张最终输出；固定 `TUDOU_*` 错误沿用持久化诊断。GET `/api/v1/generation-options` 可只读核对型号与阻塞原因。

后端离线 158/158 通过；只读认证成功但模型列表为空，真实权限及付费出图待验。详见 `../阶段文档/土豆Gemini接入说明.md`。旧配置与历史结果保留。
