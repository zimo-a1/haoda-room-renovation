import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DesignPage from "@/app/design/page";

vi.mock("@/features/renovation/components/workspace", () => ({
  Workspace: () => <section id="design-workspace" aria-label="设计工作台" />,
}));

describe("设计工作台页面", () => {
  it("承载原有工作台，并保留首页与设计页导航", () => {
    render(<DesignPage />);
    expect(screen.getByRole("region", { name: "设计工作台" })).toHaveAttribute("id", "design-workspace");
    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "开始设计" })).toHaveAttribute("href", "/design");
    expect(screen.getByRole("button", { name: "登录" })).toBeDisabled();
  });
});
