import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("首页品牌展示", () => {
  it("不展示首屏 Logo，并提供独立的设计页入口", () => {
    render(<Home />);
    const logo = document.querySelector(".hero-logo");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(logo).not.toBeInTheDocument();
    expect(heading).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /开始你的空间改造/ })).toHaveAttribute("href", "/design");
    expect(screen.getByRole("navigation", { name: "主要导航" })).toHaveTextContent("首页");
    expect(screen.getByRole("navigation", { name: "主要导航" })).toHaveTextContent("开始设计");
    expect(screen.getByRole("button", { name: "登录" })).toBeDisabled();
    const slider = screen.getByRole("slider", { name: "拖动查看改造前后的空间效果" });
    expect(slider).toHaveValue("50");
    expect(slider).toHaveAttribute("aria-valuetext", "左侧显示 50% 改造前画面，右侧显示改造后画面");
    fireEvent.change(slider, { target: { value: "72" } });
    expect(slider.parentElement).toHaveStyle({ "--reveal": "72%" });
    expect(slider).toHaveAttribute("aria-valuetext", "左侧显示 72% 改造前画面，右侧显示改造后画面");
    fireEvent.change(slider, { target: { value: "0" } });
    expect(slider).toHaveAttribute("aria-valuetext", "全部显示改造后画面");
    fireEvent.change(slider, { target: { value: "100" } });
    expect(slider).toHaveAttribute("aria-valuetext", "全部显示改造前画面");
    expect(screen.getByRole("heading", { name: "先找到，你想住进去的感觉。" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "把日常的每一个房间，慢慢搭成喜欢的样子。" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "设计工作台" })).not.toBeInTheDocument();
  });

  it("前后对比保持单帧 4:3 比例，改造前在左侧裁切层", () => {
    render(<Home />);
    const stage = screen.getByRole("slider", { name: "拖动查看改造前后的空间效果" }).parentElement;
    expect(stage?.children[0]).toHaveClass("compare-after");
    expect(stage?.children[1]).toHaveClass("compare-before");

    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/\.compare-stage\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3;/);
    expect(css).toMatch(/\.compare-before\s*\{[^}]*clip-path:\s*inset\(0 calc\(100% - var\(--reveal\)\) 0 0\);/);
    expect(css).not.toMatch(/\.compare-after\s*\{[^}]*clip-path:/);
    expect(css.match(/\.compare-stage\s*\{[^}]*aspect-ratio:/g)).toHaveLength(1);
    expect(css).toContain('background-image: url("/images/showcase-before-after-v2.png")');
    expect(screen.getByRole("img", { name: /改造前使用老旧家具的客厅/ })).toBeInTheDocument();
    expect(screen.getByText("左右拖动，查看同一空间从老旧家具到完整软装后的变化。")).toBeInTheDocument();
  });

  it("桌面端收窄整体版心，同时保留平板和手机的可用宽度", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/:root\s*\{[^}]*--content-max-width:\s*1120px;[^}]*--page-gutter:\s*72px;/);
    expect(css).toMatch(/@media\s*\(max-width:\s*1199px\)\s*\{\s*:root\s*\{\s*--page-gutter:\s*32px;/);
    expect(css).toMatch(/@media\s*\(max-width:\s*679px\)\s*\{\s*:root\s*\{\s*--page-gutter:\s*22px;/);
  });

  it("SVG 保持原始比例、全部路径为白色，且没有背景或外部资源", () => {
    const source = readFileSync(resolve(process.cwd(), "public/images/haoda-logo-white.svg"), "utf8");
    const svg = new DOMParser().parseFromString(source, "image/svg+xml");
    expect(svg.querySelector("parsererror")).toBeNull();
    expect(svg.documentElement.getAttribute("viewBox")).toBe("0 0 1680 511");
    expect(svg.documentElement.getAttribute("width")).toBe("1680");
    expect(svg.documentElement.getAttribute("height")).toBe("511");
    const paths = [...svg.querySelectorAll("path")];
    expect(paths).toHaveLength(9);
    expect([...svg.querySelectorAll("*")].every((element) => ["svg", "path"].includes(element.localName))).toBe(true);
    for (const path of paths) {
      expect(path.getAttribute("fill")).toBe("#FFFFFF");
      expect(path.getAttribute("d")).toBeTruthy();
    }
    expect(source).not.toMatch(/\bon[a-z]+\s*=|\bhref\s*=/i);
  });
});
