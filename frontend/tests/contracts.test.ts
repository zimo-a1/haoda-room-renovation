import { describe, expect, it, vi } from "vitest";
import { createTask, getGenerationOptions, parseElements, parseStyles, parseTask, uploadPhoto } from "@/features/renovation/api";
import { MAX_PHOTO_BYTES, validatePhoto } from "@/features/renovation/utils";
import { apiErrorMessage, request } from "@/lib/api/client";

const taskResponse = { task_id: "t1", status: "processing", style_id: "nordic", element_ids: ["sofa"], result_image_url: null, cost: 0.3 };
const savedSelection = { element_id: "sofa", option_id: "sofa-2", element_name: "沙发", room: "客厅", option_name: "焦糖皮质沙发", image: "/images/furniture/sofa-v1.png", panel: 1 };
const diagnostics = { http_status: 404, upstream_code: "InvalidEndpointOrModel.NotFound", request_id: "request-123", response_kind: "json" };

describe("安全诊断契约", () => {
  it("只读取受限诊断字段，不复制上游原始报错", () => {
    const task = parseTask({ ...taskResponse, diagnostics: { ...diagnostics, message: "private prompt", authorization: "private credential" } });
    expect(task.diagnostics).toEqual({ httpStatus: 404, upstreamCode: "InvalidEndpointOrModel.NotFound", requestId: "request-123", responseKind: "json" });
    expect(JSON.stringify(task)).not.toContain("private");
  });
  it("旧任务及传输错误不伪造上游信息", () => {
    expect(parseTask(taskResponse).diagnostics).toBeUndefined();
    expect(parseTask({ ...taskResponse, diagnostics: null }).diagnostics).toBeUndefined();
    expect(parseTask({ ...taskResponse, diagnostics: { response_kind: "transport" } }).diagnostics?.httpStatus).toBeNull();
    expect(apiErrorMessage("ARK_MODEL_UNAVAILABLE")).toContain("未保存详细的上游诊断");
    expect(apiErrorMessage("ARK_HTTP_NOT_FOUND")).toContain("尚不能判定");
  });
  it.each([
    { http_status: 99 }, { http_status: 600 }, { http_status: "404" }, { http_status: 404.5 },
    { upstream_code: "x".repeat(97) }, { upstream_code: "private message" }, { upstream_code: "token\n" },
    { request_id: "x".repeat(129) }, { request_id: "sk-private" }, { request_id: "https://private.invalid" },
    { request_id: "<img>" }, { request_id: { secret: "private" } }, { response_kind: "unknown" },
  ])("拒绝损坏的诊断数据 %j", (fields) => {
    expect(() => parseTask({ ...taskResponse, diagnostics: { ...diagnostics, ...fields } })).toThrow();
  });
});

describe("具体选款生成契约", () => {
  it("读取失败错误码，不透传任意供应商错误文案", () => {
    const task = parseTask({ ...taskResponse, status: "failed", error: { code: "ARK_TIMEOUT", message: "private upstream data" } });
    expect(task.errorCode).toBe("ARK_TIMEOUT");
    expect(apiErrorMessage(task.errorCode!)).toContain("核对控制台");
    expect(JSON.stringify(task)).not.toContain("private upstream data");
  });
  it("读取后端提供方与逐图上限供用户确认", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: "ark", provider_label: "火山方舟国内图像服务", model: "doubao-seedream-5-0-260128", configured: true, max_product_images: 13, individual_references: true, estimated_cost: 0.3 }))));
    expect(await getGenerationOptions()).toMatchObject({ provider: "ark", maxProductImages: 13, individualReferences: true, estimatedCost: 0.3 });
  });
  it("配置数据损坏时不擅自允许提交", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: "ark", configured: true }))));
    await expect(getGenerationOptions()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("发送用户所选款式 ID，不只发送家具类别，也不接受客户端决定参考图路径", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...taskResponse, furniture_selections: [savedSelection] })));
    vi.stubGlobal("fetch", fetchMock);
    const choice = { element: { id: "sofa", name: "沙发", room: "客厅" }, option: { id: "sofa-2", name: "焦糖皮质沙发", image: "/images/furniture/sofa-v1.png", panel: 1 } };
    const task = await createTask("photo-123", "nordic", [choice]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ photo_id: "photo-123", style_id: "nordic", element_ids: ["sofa"], furniture_selections: [{ element_id: "sofa", option_id: "sofa-2" }] });
    expect(task.furnitureChoices).toEqual([choice]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("读取旧任务不伪造已选款式", () => {
    expect(parseTask(taskResponse).furnitureChoices).toEqual([]);
  });
  it.each([
    { ...savedSelection, panel: 3 },
    { ...savedSelection, image: "https://untrusted.example/image.png" },
    { ...savedSelection, option_name: null },
    { ...savedSelection, element_id: "bed" },
  ])("拒绝损坏或不可信的选款回执 %j", (selection) => {
    expect(() => parseTask({ ...taskResponse, furniture_selections: [selection] })).toThrow();
  });
});

describe("外部数据进入界面前的校验", () => {
  it("接受有效目录及真正的空列表", () => {
    expect(parseStyles({ styles: [{ id: "nordic", name: "北欧风" }] })).toHaveLength(1);
    expect(parseStyles({ styles: [] })).toEqual([]);
    expect(parseElements({ style_id: "nordic", elements: [] }, "nordic")).toEqual([]);
  });
  it.each([null, { styles: [{ id: 42, name: "风格" }] }, { styles: [{ id: "a", name: "甲" }, { id: "a", name: "乙" }] }])("拒绝不完整或重复的目录 %j", (value) => {
    expect(() => parseStyles(value)).toThrow("收到的数据暂时无法使用");
  });
  it("拒绝与当前风格不符的旧元素响应", () => {
    expect(() => parseElements({ style_id: "old", elements: [] }, "new")).toThrow();
    expect(() => parseElements({ style_id: "a", elements: [{ id: "sofa", name: "沙发" }] }, "a")).toThrow();
  });
  it("拒绝缺少上传标识的成功响应", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ photo_id: "" }))));
    await expect(uploadPhoto(new File(["x"], "room.png", { type: "image/png" }))).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("照片在发送前的限制", () => {
  it("接受有效扩展名并兼容未提供 MIME 的相册文件", () => {
    expect(validatePhoto(new File(["photo"], "ROOM.JPG", { type: "image/jpeg" }))).toBeNull();
    expect(validatePhoto(new File(["photo"], "room.webp"))).toBeNull();
  });
  it("拒绝空文件、危险格式和错误 MIME", () => {
    expect(validatePhoto(new File([], "empty.jpg"))).toContain("空文件");
    expect(validatePhoto(new File(["x"], "room.svg"))).toContain("格式");
    expect(validatePhoto(new File(["x"], "room.png", { type: "text/html" }))).toContain("格式");
  });
  it("严格限制 10 兆字节", () => {
    const file = new File(["x"], "room.png");
    Object.defineProperty(file, "size", { value: MAX_PHOTO_BYTES + 1 });
    expect(validatePhoto(file)).toContain("超过 10 兆字节");
  });
});

describe("请求错误与重试边界", () => {
  it("不把供应商堆栈展示给用户", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "secret stack trace" } }), { status: 500 })));
    await expect(request("/styles")).rejects.toMatchObject({ userMessage: "服务暂时不可用，请稍后重试。", retryable: true });
  });
  it("将非 JSON 代理报错转换成可恢复提示", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 })));
    await expect(request("/styles")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("上传网络失败不自动重试", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadPhoto(new File(["x"], "room.png"))).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
