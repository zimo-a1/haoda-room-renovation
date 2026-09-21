# 好搭 · AI 软装改造

上传房间照片，选择软装风格与具体家具款式，生成同角度的搭配效果图，并查看前后对比和家具选购入口。

## 功能

- 首页风格与改造案例展示。
- 设计工作台：左侧上传、风格、房间与家具选款，右侧原图和生成结果。
- 可拖动的前后对比、逐件家具参考和淘宝相似款搜索。
- 异步生成、任务查询、错误诊断和结果恢复。
- 不调用模型的独立静态演示。

款式图片是 AI 示意，不是真实在售 SKU；模型可能出现款式偏差，效果图不作为实际尺寸依据。

## 项目结构

```text
backend/      FastAPI 后端、模型适配和测试
frontend/     Next.js 网页、公开图片字体、组件和测试
scripts/      上传安全检查
README.md     项目与启动说明
SECURITY.md   密钥、费用和公网使用边界
LICENSE       保留的许可证
```

本仓库仅维护软装改造应用，不包含通用产品生成工具包、PRD 模板、开发手册或内部阶段文档。图片及字体的许可文件随素材保留。

## 本地运行

需要 Python 3.12、Node.js 22.12+ 和 npm。在仓库根目录分别打开两个终端。

后端：

```sh
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp -n .env.example .env
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

前端：

```sh
cd frontend
npm ci
npm run dev
```

浏览器打开 http://127.0.0.1:3000/ 。后端接口位于 http://127.0.0.1:8000/api/v1/ 。

示例配置默认 `IMAGE_PROVIDER=mock`，只生成明确标注的模拟结果，不调用真实模型。仓库不含所有者的 API Key，下载不会获得其模型额度。

真实生成须使用运行者自己的后端密钥，并确认单价、预算及照片转发；详见 [后端说明](backend/README.md)。不在前端配置模型密钥。

## 静态演示

```sh
cd frontend
npm ci
npm run build:demo
npm run serve:demo
```

打开 http://127.0.0.1:3101/ 。该模式只展示公开样例与选款，不接后端，不上传照片或付费生成。分享服务前确认只暴露静态演示端口。

## 验证

后端：在 `backend/` 运行 `.venv/bin/python -m pytest -q`。

前端：在 `frontend/` 依次运行 `npm run test`、`npm run lint`、`npm run build` 和 `npm run typecheck`。

上传前：在仓库根目录运行 `python3 scripts/check-upload-security.py`。

## 安全边界

当前是本地体验版本，尚无完整登录、用户数据隔离、个人额度和防刷保护。不要将配置了真实密钥的服务直接开放到公网。私有代码仓库不等于已部署的网站；费用上限为估算检查，不能替代供应商侧的硬额度保护。详见 [安全说明](SECURITY.md)。
