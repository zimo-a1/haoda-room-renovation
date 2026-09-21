"use client";

import { useState } from "react";
import { BeforeAfterShowcase } from "@/components/before-after-showcase";
import { StylePicker } from "./style-picker";
import { ElementPicker } from "./element-picker";
import { FurnitureImage } from "./furniture-image";
import { resolveFurnitureChoices } from "../furniture";
import { demoStyles, demoElements } from "../demo-catalog";

export function DemoWorkspace() {
  const [style, setStyle] = useState(demoStyles[0]);
  const [room, setRoom] = useState("客厅");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const choices = resolveFurnitureChoices(demoElements, selections);
  return <section id="design-workspace" className="workspace design-studio" aria-labelledby="workspace-heading" tabIndex={-1}>
    <div className="design-controls" aria-label="设计功能与筛选">
      <header className="control-panel-heading"><span>好搭 · 分享演示版</span><h1 id="workspace-heading">试试你的软装搭配</h1><p>选择风格与家具，体验搭配流程。此演示不上传照片、不生成图片，也不产生生成费用。</p></header>
      <div className="workspace-promise control-promise"><strong>用示例房间，先看看变化</strong><span>右侧为固定展示示例，不随选款生成；你选择的家具会列在下方。</span></div>
      <section className="workflow-stage style-section" aria-labelledby="style-heading">
        <div className="section-heading"><h2 id="style-heading"><span className="stage-number">01</span>选择喜欢的风格</h2></div>
        <StylePicker styles={{ status: "success", data: demoStyles }} value={style.id} onChange={setStyle} retry={() => {}} />
      </section>
      <section className="workflow-stage elements-section" aria-labelledby="elements-heading">
        <div className="section-heading"><h2 id="elements-heading"><span className="stage-number">02</span>选择房间与家具</h2><span className="section-aside">已选 {choices.length}</span></div>
        <ElementPicker elements={{ status: "success", data: demoElements }} selections={selections} room={room} onRoom={setRoom} onChoose={(id, option) => setSelections((current) => ({ ...current, [id]: option }))} retry={() => {}} />
      </section>
      <div className="action-dock control-action-dock"><div className="action-inner"><div className="action-summary"><p role="status">{style.name} · 已选 {choices.length} 件软装</p><span>演示版仅供浏览与筛选，刷新后重新选择</span></div><a className="button primary" href="#demo-products">查看我的搭配 ↗</a></div></div>
    </div>
    <aside className="design-preview-panel" aria-label="图片对比与商品链接">
      <header className="design-preview-heading"><div><span className="design-preview-kicker">空间预览</span><h2>一个房间，两种生活。</h2></div><span className="preview-state">展示示例</span></header>
      <BeforeAfterShowcase />
      <p className="furniture-disclosure">示例图用于展示前后对比交互，不代表当前选款的生成结果。</p>
      <section id="demo-products" className="preview-products" aria-labelledby="demo-products-heading">
        <div className="preview-products-heading"><div><span>我的搭配 · {style.name}</span><h3 id="demo-products-heading">已选家具与选购参考</h3></div></div>
        <p className="furniture-disclosure">款式图为智能示意。链接前往淘宝搜索相似款，不保证与示意图完全一致；微信内可能需要在浏览器打开。</p>
        {!choices.length && <p className="preview-products-empty">选一款喜欢的家具，它会出现在这里。</p>}
        <ul className="chosen-furniture">{choices.map(({ element, option }) => <li key={element.id}>
          <FurnitureImage option={option} small />
          <div><span>{element.room} · {element.name}</span><p>{option.name}</p><a target="_blank" rel="noopener noreferrer" href={`https://s.taobao.com/search?q=${encodeURIComponent(`${style.name} ${option.name}`)}`}>搜索相似款 ↗</a></div>
          <button className="text-button" type="button" aria-label={`移除${element.room}的${element.name}`} onClick={() => setSelections((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== element.id)))}>移除</button>
        </li>)}</ul>
      </section>
    </aside>
  </section>;
}
