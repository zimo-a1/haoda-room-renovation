import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResultView } from "@/features/renovation/components/result-view";
import { AppError } from "@/lib/api/client";

const api = vi.hoisted(() => ({ getTask: vi.fn(), getTaskProducts: vi.fn() }));
vi.mock("@/features/renovation/api", () => api);

beforeEach(() => {
  api.getTask.mockReset();
  api.getTaskProducts.mockReset();
});

describe("结果页", () => {
  it("重新打开失败任务能展示已保存的诊断，不触发模型或商品请求", async () => {
    api.getTask.mockResolvedValue({ taskId: "failed-details", status: "failed", errorCode: "ARK_MODEL_OR_ENDPOINT_UNAVAILABLE",
      diagnostics: { httpStatus: 404, upstreamCode: "InvalidEndpointOrModel.NotFound", requestId: "persisted-request-id", responseKind: "json" } });
    render(<ResultView taskId="failed-details" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("可能涉及资源或权限");
    const details = screen.getByRole("region", { name: "生成失败诊断" });
    expect(details).toHaveTextContent("上游错误信息：已记录");
    expect(details).toHaveTextContent("本次请求信息：已记录");
    expect(api.getTask).toHaveBeenCalledTimes(1);
    expect(api.getTaskProducts).not.toHaveBeenCalled();
  });
  it("旧失败任务缺少诊断时不猜原因", async () => {
    api.getTask.mockResolvedValue({ taskId: "old", status: "failed", errorCode: "ARK_MODEL_UNAVAILABLE" });
    render(<ResultView taskId="old" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("未保存详细的上游诊断");
    expect(screen.queryByRole("region", { name: "生成失败诊断" })).not.toBeInTheDocument();
  });
  it("超时不伪造请求状态或请求编号", async () => {
    api.getTask.mockResolvedValue({ taskId: "timeout", status: "failed", errorCode: "ARK_TIMEOUT",
      diagnostics: { httpStatus: null, upstreamCode: null, requestId: null, responseKind: "transport" } });
    render(<ResultView taskId="timeout" />);
    expect(await screen.findByRole("region", { name: "生成失败诊断" })).toHaveTextContent("未收到有效响应");
    expect(screen.getByRole("region", { name: "生成失败诊断" })).toHaveTextContent("不代表上游未执行");
  });
  it("持久化的失败任务展示安全原因，不渲染空图片或获取商品", async () => {
    api.getTask.mockResolvedValue({ taskId: "failed", status: "failed", errorCode: "ARK_TIMEOUT", resultImageUrl: "" });
    render(<ResultView taskId="failed" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("避免重复付费");
    expect(screen.queryByAltText("生成后的软装效果图")).not.toBeInTheDocument();
    expect(api.getTaskProducts).not.toHaveBeenCalled();
  });

  it("仍在处理的任务提示刷新，不渲染成功图片", async () => {
    api.getTask.mockResolvedValue({ taskId: "pending", status: "processing", resultImageUrl: "" });
    render(<ResultView taskId="pending" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("尚未生成完成");
    expect(api.getTaskProducts).not.toHaveBeenCalled();
  });
  it("从任务读取原选款图片与名称，方便核对结果", async () => {
    api.getTask.mockResolvedValue({ taskId: "t1", status: "succeeded", styleId: "nordic", elementIds: ["sofa"], resultImageUrl: "/api/v1/tasks/t1/image", cost: 0.3,
      furnitureChoices: [{ element: { id: "sofa", name: "沙发", room: "客厅" }, option: { id: "sofa-2", name: "焦糖皮质沙发", image: "/images/furniture/sofa-v1.png", panel: 1 } }],
    });
    api.getTaskProducts.mockResolvedValue({ configured: false, message: "", products: [] });
    render(<ResultView taskId="t1" />);
    expect(await screen.findByRole("region", { name: "本次生成参考款式" })).toHaveTextContent("焦糖皮质沙发");
    expect(screen.getByAltText("焦糖皮质沙发，智能款式示意图")).toHaveStyle({ objectPosition: "50% center" });
    expect(screen.getByText(/不代表已验证生成结果完全一致/)).toBeInTheDocument();
  });

  it("加载任务、展示效果图、成本与商品链接", async () => {
    api.getTask.mockResolvedValue({ taskId: "t1", status: "succeeded", styleId: "nordic", elementIds: ["sofa"], resultImageUrl: "/api/v1/tasks/t1/image", cost: 0.3 });
    api.getTaskProducts.mockResolvedValue({
      configured: false,
      message: "静态商品链接（未接联盟，无佣金）",
      products: [{ elementId: "sofa", elementName: "沙发", items: [{ title: "三人位布艺沙发", clickUrl: "https://s.taobao.com/search?q=%E5%8C%97%E6%AC%A7%E9%A3%8E", imageUrl: null, price: null }] }],
    });
    render(<ResultView taskId="t1" />);
    expect(await screen.findByAltText("生成后的软装效果图")).toBeInTheDocument();
    expect(screen.getByText("沙发")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /三人位布艺沙发/ });
    expect(link).toHaveAttribute("href", "https://s.taobao.com/search?q=%E5%8C%97%E6%AC%A7%E9%A3%8E");
    expect(screen.getByText(/本次成本约 ¥0.30/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "再改造一间" })).toHaveAttribute("href", "/design");
  });

  it("任务不存在时给出可返回的错误提示", async () => {
    api.getTask.mockRejectedValue(new AppError("TASK_NOT_FOUND", "这个生成任务不存在或已过期。", false));
    render(<ResultView taskId="missing" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("这个生成任务不存在或已过期。");
    expect(screen.getByRole("link", { name: "返回重新搭配" })).toHaveAttribute("href", "/design");
  });
});
