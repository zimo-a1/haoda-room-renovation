import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StylePicker } from "@/features/renovation/components/style-picker";

const styles = [{ id: "nordic", name: "北欧风" }, { id: "new-style", name: "新风格" }];

describe("摄影风格目录", () => {
  it("中古风始终排第一，不修改后端目录且不擅自替用户选中", () => {
    const catalog = [...styles, { id: "mid-century", name: "中古风" }];
    render(<StylePicker styles={{ status: "success", data: catalog }} value="" onChange={vi.fn()} retry={vi.fn()} />);
    const choices = screen.getAllByRole("radio");
    expect(choices[0]).toHaveAccessibleName(/中古风/);
    expect(choices.every((choice) => !(choice as HTMLInputElement).checked)).toBe(true);
    expect(catalog[0].id).toBe("nordic");
  });

  it("照片卡保留单选语义，未知风格也可选择且不引用不存在的图片", async () => {
    const onChange = vi.fn();
    const { container } = render(<StylePicker styles={{ status: "success", data: styles }} value="nordic" onChange={onChange} retry={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /北欧风/ })).toBeChecked();
    expect(container.querySelectorAll("img")).toHaveLength(1);
    await userEvent.setup().click(screen.getByRole("radio", { name: /新风格/ }));
    expect(onChange).toHaveBeenCalledWith(styles[1]);
  });

  it.each([false, true])("方向按钮滚动目录，尊重减少动态效果设置 (%s)", async (reducedMotion) => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reducedMotion })));
    const { container } = render(<StylePicker styles={{ status: "success", data: styles }} value="" onChange={vi.fn()} retry={vi.fn()} />);
    const rail = container.querySelector("#style-rail")!;
    const scrollBy = vi.fn();
    Object.defineProperties(rail, { clientWidth: { value: 500 }, scrollBy: { value: scrollBy } });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "下一组风格" }));
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 400, behavior: reducedMotion ? "instant" : "smooth" });
    await user.click(screen.getByRole("button", { name: "上一组风格" }));
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -400, behavior: reducedMotion ? "instant" : "smooth" });
  });
});
