import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "@/features/renovation/components/confirmation-dialog";

const api = vi.hoisted(() => ({ getGenerationOptions: vi.fn(), createTask: vi.fn(), getTask: vi.fn() }));
vi.mock("@/features/renovation/api", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const options = { provider: "ark", providerLabel: "火山方舟国内图像服务", model: "doubao-seedream-5-0-260128", configured: true, maxProductImages: 13, individualReferences: true, estimatedCost: 0.3 };
const choices = Array.from({ length: 14 }, (_, i) => ({ element: { id: `f${i}`, name: `家具${i}`, room: "卧室" }, option: { id: `o${i}`, name: `款式${i}`, image: "/images/furniture/sofa-v1.png", panel: 0 } }));
function dialog(count = 13) { render(<ConfirmationDialog style={{ id: "nordic", name: "北欧风" }} choices={choices.slice(0, count)} photoId="test-photo" onClose={vi.fn()} />); }
beforeEach(() => { api.getGenerationOptions.mockReset().mockResolvedValue(options); api.createTask.mockReset(); api.getTask.mockReset(); });

describe("火山接入确认", () => {
  it("说明小范围摆位边界，并保留智能生成和费用提示", async () => {
    dialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "确认并生成" })).toBeEnabled());
    const content = screen.getByRole("dialog");
    expect(content).toHaveTextContent("所选家具款式不变，允许在原功能分区内小范围调整摆位");
    expect(content).toHaveTextContent("墙地门窗及拍摄角度保持不变");
    expect(content).toHaveTextContent("不作为实际尺寸依据");
    expect(content).toHaveTextContent("智能生成仍可能存在漏项或款式偏差");
    expect(content).toHaveTextContent("以供应商实际账单为准");
    expect(api.createTask).not.toHaveBeenCalled();
  });
  it("失败时展示诊断编号，不把普通 404 说成模型未开通，也不重新提交", async () => {
    const user = userEvent.setup();
    api.createTask.mockResolvedValue({ taskId: "task-diagnostic", status: "processing" });
    api.getTask.mockResolvedValue({ taskId: "task-diagnostic", status: "failed", errorCode: "ARK_HTTP_NOT_FOUND",
      diagnostics: { httpStatus: 404, upstreamCode: null, requestId: "request-404", responseKind: "non_json" } });
    dialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "确认并生成" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "确认并生成" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("尚不能判定");
    const details = screen.getByRole("region", { name: "生成失败诊断" });
    expect(details).toHaveTextContent("请求状态：404");
    expect(details).toHaveTextContent("本次请求信息：已记录");
    expect(details).toHaveTextContent("响应格式不符合预期");
    expect(details).toHaveStyle({ overflowWrap: "anywhere" });
    await user.click(screen.getByRole("button", { name: "确认并生成" }));
    expect(api.createTask).toHaveBeenCalledTimes(1);
    expect(api.getTask).toHaveBeenCalledTimes(1);
  });
  it("13 件单图显示当前服务状态，不显示模型英文编号和旧拼板说明", async () => {
    dialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "确认并生成" })).toBeEnabled());
    expect(screen.getByRole("dialog")).toHaveTextContent("火山方舟国内图像服务");
    expect(screen.getByRole("dialog")).toHaveTextContent("图像生成服务：已就绪");
    expect(screen.getByRole("dialog")).not.toHaveTextContent(options.model);
    expect(screen.getByRole("dialog")).toHaveTextContent("13 张商品单图");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("SiliconFlow");
  });
  it("缺少配置时不提交付费请求", async () => {
    api.getGenerationOptions.mockResolvedValue({ ...options, configured: false });
    dialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("图像服务尚未就绪");
    expect(screen.getByRole("button", { name: "确认并生成" })).toBeDisabled();
    expect(api.createTask).not.toHaveBeenCalled();
  });
  it("土豆未就绪时显示待确认，不把旧预算冒充新模型报价", async () => {
    api.getGenerationOptions.mockResolvedValue({ ...options, provider: "tudou", providerLabel: "土豆平台转发的 Gemini 图像服务（处理地区与留存规则未核实）", configured: false });
    dialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("图像服务尚未就绪");
    expect(screen.getByRole("dialog")).toHaveTextContent("待确认");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("¥0.30");
    expect(screen.getByRole("button", { name: "确认并生成" })).toBeDisabled();
    expect(api.createTask).not.toHaveBeenCalled();
  });
  it("14 件超限保留全部选项并阻止提交", async () => {
    dialog(14);
    expect(await screen.findByRole("alert")).toHaveTextContent("最多选择 13 件");
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
    expect(screen.getByRole("button", { name: "确认并生成" })).toBeDisabled();
  });
  it("轮询失败展示原因并保留任务入口，不重复计费", async () => {
    const user = userEvent.setup();
    api.createTask.mockResolvedValue({ taskId: "task-ark", status: "processing" });
    api.getTask.mockResolvedValue({ taskId: "task-ark", status: "failed", errorCode: "ARK_TIMEOUT" });
    dialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "确认并生成" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "确认并生成" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("避免重复付费");
    expect(screen.getByRole("link", { name: "查看这次任务" })).toHaveAttribute("href", "/r/task-ark");
    expect(screen.getByRole("button", { name: "确认并生成" })).toBeDisabled();
    expect(api.createTask).toHaveBeenCalledTimes(1);
  });
});
