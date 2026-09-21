import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "@/features/renovation/components/workspace";
import { AppError } from "@/lib/api/client";
import type { Element } from "@/features/renovation/types";

const api = vi.hoisted(() => ({ getStyles: vi.fn(), getElements: vi.fn(), uploadPhoto: vi.fn(), createTask: vi.fn(), getTask: vi.fn(), getTaskProducts: vi.fn(), getGenerationOptions: vi.fn() }));
vi.mock("@/features/renovation/api", () => api);

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const styles = [{ id: "nordic", name: "北欧风" }, { id: "cream", name: "奶油风" }];
const elements = [{ id: "sofa", name: "沙发", room: "客厅" }, { id: "bed", name: "床", room: "卧室" }];
beforeEach(() => { api.getStyles.mockReset().mockResolvedValue(styles); api.getElements.mockReset().mockResolvedValue(elements); api.uploadPhoto.mockReset().mockResolvedValue("photo-123"); api.createTask.mockReset(); api.getTask.mockReset(); api.getTaskProducts.mockReset().mockResolvedValue({ configured: true, message: "", products: [{ elementId: "sofa", elementName: "沙发", items: [{ title: "沙发同款搜索", clickUrl: "https://s.taobao.com/search?q=sofa", imageUrl: null, price: null }] }] }); api.getGenerationOptions.mockReset().mockResolvedValue({ provider: "ark", providerLabel: "火山方舟国内图像服务", model: "doubao-seedream-5-0-260128", configured: true, maxProductImages: 13, individualReferences: true, estimatedCost: 0.30 }); navigation.push.mockReset(); });

describe("工作台用户闭环", () => {
  it("用三步工作台呈现现有主链，并明确空间与选款的生成边界", async () => {
    render(<Workspace />);
    await screen.findByRole("radio", { name: /北欧风/ });
    expect(screen.getByRole("list", { name: "设计步骤" })).toHaveTextContent("01上传房间02选择风格03挑选家具");
    expect(screen.getByRole("complementary", { name: "图片对比与商品链接" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "从你的房间开始" })).toBeInTheDocument();
    expect(screen.getByLabelText("生成边界说明")).toHaveTextContent("墙地门窗与拍摄视角作为生成约束；已选家具会逐件作为参考。");
    expect(screen.queryByText("生成模式")).not.toBeInTheDocument();
    expect(screen.queryByText("批量生成")).not.toBeInTheDocument();
  });

  it("按上传、风格、房间家具排列，未上传时不把风格图冒充原图", async () => {
    render(<Workspace />);
    await screen.findByRole("radio", { name: /北欧风/ });
    const upload = screen.getByRole("heading", { name: /上传房间照片/ });
    const style = screen.getByRole("heading", { name: /选择喜欢的风格/ });
    const elements = screen.getByRole("heading", { name: /选择房间与家具/ });
    expect(upload.compareDocumentPosition(style) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(style.compareDocumentPosition(elements) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("上传后在这里查看原图；生成完成后可拖动比较改造前后。")).toBeInTheDocument();
    expect(screen.queryByAltText("暖光客厅风格参考，上传后显示你的原图")).not.toBeInTheDocument();
  });

  it("加载时显示加载，加载完成为空才显示空", async () => {
    let resolve!: (value: typeof styles) => void;
    api.getStyles.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<Workspace />);
    expect(screen.getByRole("status", { name: "正在加载风格" })).toBeInTheDocument();
    expect(screen.queryByText("暂时没有可选风格。", { exact: false })).not.toBeInTheDocument();
    await act(async () => resolve([]));
    expect(screen.getByText("暂时没有可选风格。", { exact: false })).toBeInTheDocument();
  });

  it("照片先本地预览，明确点击才上传；跨房间选择进入准确的费用确认", async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const proceed = screen.getByRole("button", { name: "预览生成信息" });
    expect(proceed).toBeDisabled();
    await user.upload(screen.getByLabelText("选择房间照片"), new File(["room"], "room.png", { type: "image/png" }));
    expect(api.uploadPhoto).not.toHaveBeenCalled();
    expect(screen.getByAltText("待改造的房间原图")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "上传这张照片" }));
    await screen.findByText("房间照片已就位");
    await user.click(screen.getByRole("radio", { name: /北欧风/ }));
    await user.click(await screen.findByRole("button", { name: "沙发" }));
    expect(proceed).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "焦糖皮质沙发" }));
    await user.click(screen.getByRole("button", { name: "卧室" }));
    await user.click(screen.getByRole("button", { name: "床" }));
    await user.click(screen.getByRole("radio", { name: "弧形软包床" }));
    await user.click(proceed);
    expect(screen.getByRole("dialog", { name: "看看这次的搭配" })).toHaveTextContent("客厅·沙发、卧室·床");
    expect(screen.getByRole("dialog")).toHaveTextContent("¥0.30");
    expect(screen.getByRole("dialog")).toHaveTextContent("焦糖皮质沙发");
    expect(screen.getByRole("dialog")).toHaveTextContent("弧形软包床");
    expect(within(screen.getByRole("dialog")).getAllByRole("img")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "确认并生成" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "返回继续搭配" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "弧形软包床" })).toBeChecked();
  });

  it("确认后调用真实生成，并在右侧展示前后对比与商品链接", async () => {
    const user = userEvent.setup();
    api.createTask.mockResolvedValue({ taskId: "task-1", status: "processing", styleId: "nordic", elementIds: ["sofa"], resultImageUrl: "", cost: 0.3 });
    api.getTask.mockResolvedValue({ taskId: "task-1", status: "succeeded", styleId: "nordic", elementIds: ["sofa"], resultImageUrl: "/api/v1/tasks/task-1/image", cost: 0.3 });
    render(<Workspace />);
    await user.upload(screen.getByLabelText("选择房间照片"), new File(["room"], "room.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "上传这张照片" }));
    await screen.findByText("房间照片已就位");
    await user.click(screen.getByRole("radio", { name: /北欧风/ }));
    await user.click(await screen.findByRole("button", { name: "沙发" }));
    await user.click(screen.getByRole("radio", { name: "焦糖皮质沙发" }));
    await user.click(screen.getByRole("button", { name: "预览生成信息" }));
    await user.click(screen.getByRole("button", { name: "确认并生成" }));
    await waitFor(() => expect(api.createTask).toHaveBeenCalledWith("photo-123", "nordic", [
      expect.objectContaining({ element: expect.objectContaining({ id: "sofa" }), option: expect.objectContaining({ id: "sofa-2", name: "焦糖皮质沙发", panel: 1 }) }),
    ], expect.anything()));
    expect(await screen.findByAltText("生成后的软装效果图")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "拖动查看改造前后效果" })).toHaveValue("50");
    expect(await screen.findByRole("link", { name: /沙发同款搜索/ })).toHaveAttribute("href", "https://s.taobao.com/search?q=sofa");
    expect(screen.getByRole("link", { name: /打开独立结果页/ })).toHaveAttribute("href", "/r/task-1");
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("生成失败时保留确认层并给出可读提示", async () => {
    const user = userEvent.setup();
    api.createTask.mockRejectedValue(new AppError("IMAGE_GEN_FAILED", "这次没有成功出图，请稍后重试。", true));
    render(<Workspace />);
    await user.upload(screen.getByLabelText("选择房间照片"), new File(["room"], "room.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "上传这张照片" }));
    await screen.findByText("房间照片已就位");
    await user.click(screen.getByRole("radio", { name: /北欧风/ }));
    await user.click(await screen.findByRole("button", { name: "沙发" }));
    await user.click(screen.getByRole("radio", { name: "焦糖皮质沙发" }));
    await user.click(screen.getByRole("button", { name: "预览生成信息" }));
    await user.click(screen.getByRole("button", { name: "确认并生成" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("这次没有成功出图");
    expect(screen.getByRole("button", { name: "确认并生成" })).toBeEnabled();
  });

  it("上传失败后保留原图和选择，允许显式重试", async () => {
    const user = userEvent.setup();
    api.uploadPhoto.mockRejectedValueOnce(new AppError("NETWORK_ERROR", "暂时连不上服务"));
    render(<Workspace />);
    await user.upload(screen.getByLabelText("选择房间照片"), new File(["room"], "room.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "上传这张照片" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("暂时连不上服务");
    expect(screen.getByAltText("待改造的房间原图")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新上传" }));
    await screen.findByText("房间照片已就位");
    expect(api.uploadPhoto).toHaveBeenCalledTimes(2);
  });

  it("上传进行中锁住重复请求", async () => {
    const user = userEvent.setup();
    api.uploadPhoto.mockReturnValue(new Promise(() => {}));
    render(<Workspace />);
    await user.upload(screen.getByLabelText("选择房间照片"), new File(["room"], "room.png", { type: "image/png" }));
    await user.dblClick(screen.getByRole("button", { name: "上传这张照片" }));
    expect(screen.getByRole("button", { name: "正在上传…" })).toBeDisabled();
    expect(api.uploadPhoto).toHaveBeenCalledTimes(1);
  });

  it("快速切风格后忽略过期响应，同时清空旧选择", async () => {
    const user = userEvent.setup();
    let oldResolve!: (value: Element[]) => void;
    api.getElements.mockImplementation((id: string) => id === "nordic" ? new Promise((resolve) => { oldResolve = resolve; }) : Promise.resolve([{ id: "new", name: "新款沙发", room: "客厅" }]));
    render(<Workspace />);
    await user.click(await screen.findByRole("radio", { name: /北欧风/ }));
    await user.click(screen.getByRole("radio", { name: /奶油风/ }));
    await screen.findByRole("button", { name: "新款沙发" });
    await act(async () => oldResolve(elements));
    expect(screen.queryByRole("button", { name: "沙发" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新款沙发" })).toBeInTheDocument();
    expect(screen.getByText("这类家具的款式图片还在准备中，请先看看其他家具。")).toBeInTheDocument();
  });

  it("目录失败可恢复，元素为空不能进入生成", async () => {
    const user = userEvent.setup();
    api.getStyles.mockRejectedValueOnce(new AppError("NETWORK", "风格加载失败"));
    api.getElements.mockResolvedValue([]);
    render(<Workspace />);
    await screen.findByText("风格加载失败");
    await user.click(screen.getByRole("button", { name: "重试" }));
    await user.click(await screen.findByRole("radio", { name: /北欧风/ }));
    await waitFor(() => expect(screen.getByText("这个风格暂时没有软装可选，请尝试另一种风格。")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "预览生成信息" })).toBeDisabled();
  });

  it("卧室的床分类下面展示三款独立图片，不自动代选", async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(await screen.findByRole("radio", { name: /北欧风/ }));
    await user.click(await screen.findByRole("button", { name: "卧室" }));
    const gallery = screen.getByRole("group", { name: "卧室·床款式" });
    expect(within(gallery).getAllByRole("radio")).toHaveLength(3);
    expect(within(gallery).getAllByRole("img")).toHaveLength(3);
    for (const radio of within(gallery).getAllByRole("radio")) expect(radio).not.toBeChecked();
    expect(within(gallery).getByAltText("抽屉收纳床，智能款式示意图")).toHaveStyle({ objectPosition: "100% center" });
    expect(screen.getByText(/以下为智能款式示意图，不是真实在售商品；生成会参考所选款式/)).toBeInTheDocument();
  });

  it("选图加入清单，同一类换款只保留一个，跨房间保留并可移除", async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(await screen.findByRole("radio", { name: /北欧风/ }));
    await user.click(await screen.findByRole("radio", { name: "亚麻布艺沙发" }));
    await user.click(screen.getByRole("button", { name: "卧室" }));
    await user.click(screen.getByRole("radio", { name: "木质靠背床" }));
    await user.click(screen.getByRole("radio", { name: "抽屉收纳床" }));
    const summary = within(screen.getByRole("region", { name: "当前搭配" }));
    expect(summary.getAllByRole("listitem")).toHaveLength(2);
    expect(summary.queryByText("木质靠背床")).not.toBeInTheDocument();
    expect(summary.getByText("抽屉收纳床")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "客厅" }));
    expect(screen.getByRole("radio", { name: "亚麻布艺沙发" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "移除客厅的沙发" }));
    expect(screen.getByRole("radio", { name: "亚麻布艺沙发" })).not.toBeChecked();
    expect(summary.getAllByRole("listitem")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "移除卧室的床" }));
    expect(summary.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "预览生成信息" })).toBeDisabled();
  });

  it("换风格清空具体款式；同一风格重复点击不清空", async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(await screen.findByRole("radio", { name: /北欧风/ }));
    await user.click(await screen.findByRole("radio", { name: "焦糖皮质沙发" }));
    await user.click(screen.getByRole("radio", { name: /北欧风/ }));
    expect(screen.getByRole("radio", { name: "焦糖皮质沙发" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /奶油风/ }));
    expect(await screen.findByRole("radio", { name: "焦糖皮质沙发" })).not.toBeChecked();
    expect(within(screen.getByRole("region", { name: "当前搭配" })).queryByRole("list")).not.toBeInTheDocument();
  });

  it("切换家具分类显示对应图片，已有选择不受影响", async () => {
    const user = userEvent.setup();
    api.getElements.mockResolvedValue([...elements, { id: "nightstand", name: "床头柜", room: "卧室" }]);
    render(<Workspace />);
    await user.click(await screen.findByRole("radio", { name: /北欧风/ }));
    await user.click(await screen.findByRole("button", { name: "卧室" }));
    await user.click(screen.getByRole("radio", { name: "木质靠背床" }));
    await user.click(screen.getByRole("button", { name: "床头柜" }));
    expect(screen.queryByRole("radio", { name: "木质靠背床" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "双抽屉床头柜" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "床" }));
    expect(screen.getByRole("radio", { name: "木质靠背床" })).toBeChecked();
  });

  it("支持键盘切换款式，图片加载失败时仍有明确款名", async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(await screen.findByRole("radio", { name: /北欧风/ }));
    const first = await screen.findByRole("radio", { name: "亚麻布艺沙发" });
    first.focus();
    await user.keyboard(" ");
    expect(first).toBeChecked();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "焦糖皮质沙发" })).toBeChecked();
    fireEvent.error(screen.getByAltText("亚麻布艺沙发，智能款式示意图"));
    expect(screen.getByText(/图片暂未加载/)).toHaveTextContent("亚麻布艺沙发");
    expect(screen.queryByAltText("亚麻布艺沙发，智能款式示意图")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "亚麻布艺沙发" })).toBeInTheDocument();
  });
});
