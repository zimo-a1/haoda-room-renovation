# 土豆 Gemini 接入说明

2026-09-21，产品经理指定 https://api.ai-tudou.net/keys 及精确模型 `gemini-3.1-flash-image-preview`。

已实现原生图片接口，本地 `IMAGE_PROVIDER=tudou` 并重启后端，密钥已读取。费用仍未知，真实生成被锁定；未发送照片或发起付费模型请求，不宣称真实出图已通过。旧配置和数据保留，不自动回退。微信静态演示不接模型。

## 已核实

- 平台公开首页 https://api.ai-tudou.net/ 给出根地址及 `/v1/chat/completions`、Bearer 认证的通用示例。
- 后续通过平台 `/api/status` 找到 [官方图像文档](https://docs.ai-tudou.net/nano-banana-api-docs.html)。其明确要求 Gemini 原生通道，OpenAI 兼容通道会忽略图片比例和分辨率。
- POST `https://api.ai-tudou.net/v1beta/models/gemini-3.1-flash-image-preview:generateContent`，Bearer 认证。`contents[0].parts` 先原图、逐件商品 `inlineData`，最后提示词；`generationConfig.responseModalities=[TEXT,IMAGE]`，`imageConfig.imageSize=2K`。比例取最接近原图的文档支持比例，不拉伸图片，但任意比例原图可能有构图差异。
- 接收 `candidates[0].content.parts[].inlineData`、snake_case 字段及文档所示 Markdown Base64；忽略 `thought=true` 的中间图，只接受恰好一张最终有效 PNG/JPEG/WebP，规范存为 JPEG，不跟随 URL 或重定向。
- 保留 1 原图 + 最多 13 商品图，逐件提交、不拼板、不截断。文档总输入上限 14 张，但 Flash 高保真物体参考最多 10 张；13 件的还原质量必须实测，协议上限不是效果保证。
- [公开价格目录](https://api.ai-tudou.net/api/pricing) 列出 2K 价格变体 0.078、4K 0.11，分组倍率不同；币种/充值折算及当前令牌分组实际人民币单价未确认，不能直接当人民币报价。
- 保存后的密钥只读访问 `/v1/models` 为 HTTP 200，但模型列表为空；无认证为 401。认证请求被接受不等于该型号权限或真实出图可用，需核对令牌分组/模型权限。
- Google 官方更新说明 https://ai.google.dev/gemini-api/docs/changelog 表明 preview 型号已公告于 2026-06-25 停用，稳定型号为 `gemini-3.1-flash-image`。这不能证明土豆同名路由不可用：可能存在平台别名，必须核对其模型目录/调用示例；不自动替换用户指定名称。

## 仍待确认

1. 当前令牌分组下的单次人民币费用，以及该精确型号是否可用。原单次 0.30 元、月 300 元上限不变，不把旧预算占位当成新报价。
2. 费用确认后由用户在页面确认首次真实出图，逐件核对家具还原质量；技术方不自动调用付费模型。

照片经土豆转发至 Gemini 的授权已获用户“OK了”确认，本地授权 true；处理地区/留存仍未知，不代表同意未经费用确认调用。密钥已保存到被忽略的 `.env`，示例为空，不需要再要求保存密钥。

适配沿用异步任务、逐件商品参考、错误脱敏、预算与人工确认；地址/型号/授权/单价/超时均预检，模型输出校验结构、字节大小、像素和类型。一次请求不重试、不换模型；超时可能已计费，先核对账单。固定 `TUDOU_*` 错误与白名单诊断持久保存，失败和重启不会自动重提。

## 配置与验证

`TUDOU_API_BASE_URL`、`TUDOU_API_KEY`、`TUDOU_MODEL_ID` 已有；`TUDOU_TIMEOUT_SECONDS` 默认 180 秒。`TUDOU_ESTIMATED_COST_PER_IMAGE=0` 表示未知并阻止生成，不是免费；确认框显示“待确认”。新部署照片授权默认 false，本地已按确认设置 true。

后端 158/158 离线测试通过，覆盖逐图顺序、2K/比例、返回兼容、无图/多图/损坏/拦截响应、HTTP 错误、超时、无重试、费用/授权预检和预算超限。独立进程验证新提供方失败任务及型号可恢复；运行服务重启前后均保留 20 成功 + 2 失败记录，没有打断处理中任务。

核对入口：`http://127.0.0.1:8000/api/v1/generation-options` 应显示提供方 tudou、指定精确型号、configured=false 和费用待确认原因。下一步请在控制台查看当前分组的该型号单价，提供人民币费用或不含密钥的价格截图。真实冒烟仍待验，阶段 3 不收口。
