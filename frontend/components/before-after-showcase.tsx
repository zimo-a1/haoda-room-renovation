"use client";

import { useState, type CSSProperties } from "react";

export function BeforeAfterShowcase() {
  const [position, setPosition] = useState(50);
  const valueText = position === 0
    ? "全部显示改造后画面"
    : position === 100
      ? "全部显示改造前画面"
      : `左侧显示 ${position}% 改造前画面，右侧显示改造后画面`;

  return (
    <div className="compare-wrap">
      <div className="compare-stage" style={{ "--reveal": `${position}%` } as CSSProperties}>
        <div className="compare-panel compare-after" aria-hidden="true" />
        <div className="compare-panel compare-before" role="img" aria-label="左侧为改造前使用老旧家具的客厅，右侧为改造后的完整软装效果" />
        <div className="compare-rule" aria-hidden="true"><span /></div>
        <span className="compare-label compare-label-before" aria-hidden="true">改造前</span>
        <span className="compare-label compare-label-after" aria-hidden="true">改造后</span>
        <input
          className="compare-control"
          type="range"
          min="0"
          max="100"
          value={position}
          aria-label="拖动查看改造前后的空间效果"
          aria-valuetext={valueText}
          onChange={(event) => setPosition(Number(event.target.value))}
        />
      </div>
      <p>左右拖动，查看同一空间从老旧家具到完整软装后的变化。</p>
    </div>
  );
}
