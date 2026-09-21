export class AppError extends Error {
  constructor(public code: string, public userMessage: string, public retryable = false) {
    super(userMessage);
    this.name = "AppError";
  }
}

const messages: Record<string, string> = {
  INVALID_IMAGE: "这张图片无法上传。请使用文件大小不超过 10 兆字节的常见图片格式。",
  VALIDATION_ERROR: "提交的信息不完整，请检查后重试。",
  STYLE_NOT_FOUND: "这个风格暂时不可用，请重新选择。",
  PHOTO_NOT_FOUND: "照片已失效，请重新上传后再生成。",
  INVALID_ELEMENTS: "请至少选好一件软装的款式。",
  INVALID_FURNITURE_SELECTION: "选中的家具款式已失效或不完整，请重新选择后再生成。",
  FURNITURE_ASSETS_UNAVAILABLE: "家具参考图暂时无法读取，尚未提交模型生成，请稍后重试。",
  REFERENCE_MODEL_UNAVAILABLE: "当前图像服务尚未接通款式参考，已暂停生成，请联系维护人员检查配置。",
  IMAGE_MODEL_UNAVAILABLE: "图像服务尚未配置完成，请检查后端密钥与模型设置。",
  ARK_NOT_CONFIGURED: "火山方舟尚未配置密钥，请在后端完成配置并重启服务。",
  TOO_MANY_REFERENCE_IMAGES: "每次最多选择 13 件商品，另加 1 张房间原图；请减少选款后重试。",
  INVALID_REFERENCE_IMAGE: "参考图尺寸不适用于当前模型，请检查图片格式、尺寸和宽高比。",
  ARK_ACCESS_DENIED: "火山方舟鉴权或模型权限不足，请检查密钥和模型开通状态。",
  ARK_MODEL_UNAVAILABLE: "这次旧任务未保存详细的上游诊断，无法据此确认模型是否已开通；不会自动重试或切换模型。",
  ARK_AUTHENTICATION_FAILED: "火山方舟拒绝了本次身份认证，请核对当前服务所用密钥的有效性及所属账号。",
  ARK_PERMISSION_DENIED: "火山方舟拒绝了本次访问权限；仅凭此响应不能判断模型是否已开通，请用请求编号核查。",
  ARK_MODEL_NOT_OPEN: "火山方舟提示模型服务不可用，请用本次请求信息核对账号及模型权限；不会自动换模型。",
  ARK_MODEL_NOT_FOUND: "火山方舟提示未找到可用模型，请用本次请求信息核对模型设置和可访问范围；不会自动换模型。",
  ARK_MODEL_OR_ENDPOINT_UNAVAILABLE: "火山方舟无法访问指定模型或推理接入点，可能涉及资源或权限；请结合错误码与请求编号核查。",
  ARK_ENDPOINT_UNAVAILABLE: "火山方舟返回推理接入点错误，请用请求编号核对接入点配置与权限。",
  ARK_HTTP_NOT_FOUND: "生成接口返回未找到状态，尚不能判定是接口、模型还是权限问题；请保留下面的诊断信息。",
  ARK_UPSTREAM_ERROR: "生成服务返回上游服务错误，未自动重试；请先核对任务与账单，避免重复付费。",
  ARK_REDIRECT_REJECTED: "生成接口返回重定向，已停止跟随以保护密钥；请核对接口与网络代理配置。",
  ARK_RATE_LIMIT: "火山方舟限流或额度不足，请在控制台核对后再手动尝试。",
  ARK_REQUEST_REJECTED: "火山方舟拒绝了本次图片或参数，请核对模型的输入限制与内容要求。",
  ARK_TIMEOUT: "火山方舟响应超时，上游可能仍在处理；请先核对控制台任务和账单，避免重复付费。",
  ARK_CONNECTION_FAILED: "无法连接火山方舟，未自动重试；请检查后端网络并核对控制台记录。",
  ARK_GENERATION_FAILED: "火山方舟未能完成生成，请核对控制台记录后再手动尝试。",
  ARK_INVALID_RESPONSE: "火山方舟返回的图片数据不完整或格式不符，请核对控制台记录。",
  GENERATION_INTERRUPTED: "后端重启中断了任务，请先核对供应商账单，再决定是否重新上传生成。",
  GENERATION_FAILED: "生成未完成，请核对图像服务状态后重试。",
  COST_LIMIT: "本次生成超出费用上限，已暂停；请稍后再试或联系我们。",
  IMAGE_GEN_FAILED: "这次没有成功出图，请稍后重试。",
  TASK_NOT_FOUND: "这个生成任务不存在或已过期。",
  IMAGE_NOT_FOUND: "结果图不存在或已过期，请重新生成。",
};

export function apiErrorMessage(code: string): string {
  return messages[code] ?? "服务暂时不可用，请稍后重试。";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  return error instanceof AppError ? error.userMessage : "暂时无法完成，请稍后重试。";
}

export async function request(path: string, options: RequestInit = {}, timeout = 10_000): Promise<unknown> {
  const signal = AbortSignal.any([AbortSignal.timeout(timeout), ...(options.signal ? [options.signal] : [])]);
  try {
    const response = await fetch(`/api/v1${path}`, { ...options, signal, cache: "no-store" });
    let data: unknown;
    try { data = await response.json(); } catch { throw new AppError("INVALID_RESPONSE", "服务暂时没有响应，请稍后重试。", true); }
    if (!response.ok) {
      const code = isRecord(data) && isRecord(data.error) && typeof data.error.code === "string" ? data.error.code : "HTTP_ERROR";
      throw new AppError(code, apiErrorMessage(code), response.status >= 500);
    }
    return data;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof AppError) throw error;
    if (signal.aborted) throw new AppError("TIMEOUT", "等待时间有点久，请检查网络后重试。", true);
    throw new AppError("NETWORK_ERROR", "暂时连不上服务，请检查网络后重试。", true);
  }
}
