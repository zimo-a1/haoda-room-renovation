import type { Element, Style } from "./types";

// Public catalog only. No user photos, task records or provider configuration.
export const demoStyles: Style[] = [
  { id: "mid-century", name: "中古风" }, { id: "nordic", name: "北欧风" },
  { id: "japanese", name: "日式原木" }, { id: "cream", name: "奶油风" },
  { id: "french", name: "法式" },
];
const rooms: Record<string, [string, string][]> = {
  客厅: [["sofa", "沙发"], ["coffee-table", "茶几"], ["tv-stand", "电视柜"], ["floor-lamp", "落地灯"], ["living-main-light", "主灯"], ["rug", "地毯"], ["curtain", "窗帘"], ["wall-art", "挂画"], ["green-plant", "绿植"], ["cushion", "抱枕"], ["side-table", "边几"]],
  卧室: [["bed", "床"], ["bedding", "床品四件套"], ["nightstand", "床头柜"], ["wardrobe", "衣柜"], ["dressing-table", "梳妆台"], ["table-lamp", "台灯"], ["desk", "书桌"], ["bedroom-main-light", "主灯"], ["bedroom-rug", "地毯"]],
  餐厅: [["dining-table", "餐桌"], ["dining-chair", "餐椅"], ["sideboard", "餐边柜"], ["pendant-lamp", "吊灯"]],
};
export const demoElements: Element[] = Object.entries(rooms).flatMap(([room, items]) => items.map(([id, name]) => ({ id, name, room })));
