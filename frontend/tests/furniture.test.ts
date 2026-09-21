import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import catalog from "@/features/renovation/furniture-catalog.json";
import { furnitureOptions, resolveFurnitureChoices } from "@/features/renovation/furniture";

describe("家具款式目录", () => {
  it("后端每一类家具都覆盖三张不同款式图，ID 全局唯一", () => {
    const source = readFileSync(resolve(process.cwd(), "../backend/app/services/catalog.py"), "utf8");
    const elements = [...source.matchAll(/\{"id": "([^"]+)", "name": "[^"]+", "room": "[^"]+"\}/g)].map((match) => match[1]);
    expect(elements).toHaveLength(24);
    expect(Object.keys(catalog).sort()).toEqual([...elements].sort());
    const allIds = new Set<string>();
    for (const element of elements) {
      const options = furnitureOptions(element);
      expect(options).toHaveLength(3);
      expect(new Set(options.map((option) => `${option.image}#${option.panel}`)).size).toBe(3);
      expect(new Set(options.map((option) => option.name)).size).toBe(3);
      expect(options.map((option) => option.panel)).toEqual([0, 1, 2]);
      for (const option of options) {
        expect(allIds.has(option.id)).toBe(false);
        allIds.add(option.id);
        expect(option.image).toMatch(/^\/images\/furniture\/[a-z-]+-v1\.png$/);
      }
    }
    expect(allIds.size).toBe(72);
  });

  it("全部图集在本地存在且为完整 3:1 PNG，不依赖外链", () => {
    const paths = new Set(Object.values(catalog).map((group) => group.image));
    expect(paths.size).toBe(22);
    for (const path of paths) {
      const bytes = readFileSync(resolve(process.cwd(), `public${path}`));
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.readUInt32BE(16)).toBe(bytes.readUInt32BE(20) * 3);
      expect(bytes.readUInt32BE(20)).toBeGreaterThanOrEqual(512);
      expect(bytes.subarray(-8, -4).toString()).toBe("IEND");
    }
  });

  it("未知类目没有假选项，无效或不属于该类目的款式不进入清单", () => {
    expect(furnitureOptions("unknown")).toEqual([]);
    expect(furnitureOptions("constructor")).toEqual([]);
    const elements = [{ id: "bed", name: "床", room: "卧室" }];
    expect(resolveFurnitureChoices(elements, { bed: "sofa-1" })).toEqual([]);
    expect(resolveFurnitureChoices(elements, { bed: "bed-2", sofa: "sofa-1" })).toEqual([{ element: elements[0], option: furnitureOptions("bed")[1] }]);
  });

  it("不同房间同名家具复用图片但选择 ID 相互独立", () => {
    const living = furnitureOptions("living-main-light");
    const bedroom = furnitureOptions("bedroom-main-light");
    expect(living[0].image).toBe(bedroom[0].image);
    expect(living[0].id).not.toBe(bedroom[0].id);
    const elements = [{ id: "living-main-light", name: "主灯", room: "客厅" }, { id: "bedroom-main-light", name: "主灯", room: "卧室" }];
    expect(resolveFurnitureChoices(elements, { "living-main-light": living[0].id, "bedroom-main-light": bedroom[2].id })).toHaveLength(2);
  });
});
