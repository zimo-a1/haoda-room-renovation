import { ErrorNotice, LoadingCards } from "@/components/ui";
import { useState } from "react";
import { furnitureOptions } from "../furniture";
import { FurnitureImage } from "./furniture-image";
import type { Element, Resource } from "../types";

export function ElementPicker({ elements, selections, room, onRoom, onChoose, retry }: { elements: Resource<Element[]> | null; selections: Record<string, string>; room: string; onRoom: (room: string) => void; onChoose: (elementId: string, optionId: string) => void; retry: () => void }) {
  const [activeId, setActiveId] = useState("");
  if (!elements) return <div className="empty-state">先选择一种风格，再挑选想添置的软装。</div>;
  if (elements.status === "loading") return <LoadingCards label="正在加载软装元素" count={3} />;
  if (elements.status === "error") return <ErrorNotice message={elements.message} retry={retry} />;
  if (!elements.data.length) return <div className="empty-state">这个风格暂时没有软装可选，请尝试另一种风格。</div>;
  const rooms = [...new Set(elements.data.map((item) => item.room))];
  const currentRoom = rooms.includes(room) ? room : rooms[0];
  const visibleElements = elements.data.filter((element) => element.room === currentRoom);
  const active = visibleElements.find((element) => element.id === activeId) ?? visibleElements[0];
  const options = furnitureOptions(active.id);
  return <>
    <div className="room-tabs" role="group" aria-label="按房间筛选软装">{rooms.map((item) => {
      const count = elements.data.filter((element) => element.room === item && selections[element.id]).length;
      return <button key={item} type="button" aria-label={item} aria-pressed={currentRoom === item} onClick={() => { onRoom(item); setActiveId(""); }}>{item}{count > 0 && <sup className="room-count" aria-hidden="true">{count}</sup>}</button>;
    })}</div>
    <div className="element-grid" role="group" aria-label={`${currentRoom}家具分类`}>{visibleElements.map((element) => <button key={element.id} type="button" className={`element-chip ${active.id === element.id ? "checked" : ""}`} aria-label={element.name} aria-pressed={active.id === element.id} aria-controls="furniture-gallery" onClick={() => setActiveId(element.id)}>{element.name}{selections[element.id] && <span className="element-selected" aria-hidden="true">已选</span>}</button>)}</div>
    <section id="furniture-gallery" className="furniture-gallery" aria-labelledby="furniture-heading">
      <div className="furniture-heading"><h4 id="furniture-heading">为{active.name}选一个款式</h4><span>{options.length ? `${options.length} 款可选 · 每类选 1 款` : "款式待补充"}</span></div>
      <p id="furniture-disclosure" className="furniture-disclosure">以下为智能款式示意图，不是真实在售商品；生成会参考所选款式的造型、材质和颜色，再协调空间风格，细节可能存在偏差。</p>
      {options.length ? <fieldset className="furniture-grid" aria-describedby="furniture-disclosure"><legend className="sr-only">{currentRoom}·{active.name}款式</legend>{options.map((option) => <label key={option.id} className={`furniture-card ${selections[active.id] === option.id ? "selected" : ""}`}>
        <input type="radio" name={`furniture-${active.id}`} value={option.id} aria-label={option.name} checked={selections[active.id] === option.id} onChange={() => onChoose(active.id, option.id)} />
        <FurnitureImage option={option} />
        <span className="furniture-card-meta"><span>{option.name}</span><span className="furniture-choice-state" aria-hidden="true">{selections[active.id] === option.id ? "已选择" : "选择此款"}</span></span>
        <span className="furniture-card-note">智能款式示意</span>
      </label>)}</fieldset> : <div className="empty-state">这类家具的款式图片还在准备中，请先看看其他家具。</div>}
    </section>
  </>;
}
