import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DemoWorkspace } from "@/features/renovation/components/demo-workspace";

it("演示可跨房间选款、查看搜索链接并拖动示例，且不访问业务接口", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  try {
    const { container } = render(<DemoWorkspace />);
    fireEvent.click(screen.getByRole("radio", { name: "焦糖皮质沙发" }));
    fireEvent.click(screen.getByRole("button", { name: "卧室" }));
    fireEvent.click(screen.getByRole("radio", { name: "弧形软包床" }));
    expect(screen.getByRole("status")).toHaveTextContent("已选 2 件软装");
    expect(screen.getAllByRole("link", { name: "搜索相似款 ↗" })).toHaveLength(2);
    expect(decodeURIComponent(screen.getAllByRole("link", { name: "搜索相似款 ↗" })[0].getAttribute("href")!)).toContain("中古风 焦糖皮质沙发");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "100" } });
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "全部显示改造前画面");
    fireEvent.click(screen.getByRole("button", { name: "移除客厅的沙发" }));
    expect(screen.getByRole("status")).toHaveTextContent("已选 1 件软装");
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /生成/ })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { fetchSpy.mockRestore(); }
});
