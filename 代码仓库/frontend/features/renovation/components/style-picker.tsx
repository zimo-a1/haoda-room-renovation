import Image from "next/image";
import { useRef } from "react";
import { ErrorNotice, LoadingCards } from "@/components/ui";
import type { Resource, Style } from "../types";
import { styleMood } from "../utils";

export function StylePicker({ styles, value, onChange, retry }: { styles: Resource<Style[]>; value: string; onChange: (style: Style) => void; retry: () => void }) {
  const rail = useRef<HTMLDivElement>(null);

  function scroll(direction: number) {
    const node = rail.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  if (styles.status === "loading") return <LoadingCards label="正在加载风格" />;
  if (styles.status === "error") return <ErrorNotice message={styles.message} retry={retry} />;
  if (!styles.data.length) return <div className="empty-state">暂时没有可选风格。<button type="button" className="text-button" onClick={retry}>重新加载</button></div>;
  const orderedStyles = [...styles.data.filter((style) => style.id === "mid-century"), ...styles.data.filter((style) => style.id !== "mid-century")];

  return <fieldset className="style-picker">
    <legend className="sr-only">选择软装风格</legend>
    <div className="style-grid" id="style-rail" ref={rail}>
      {orderedStyles.map((style, index) => {
        const mood = styleMood[style.id];
        return <label key={style.id} className={`style-card ${value === style.id ? "selected" : ""}`}>
          <input type="radio" name="style" value={style.id} checked={value === style.id} onChange={() => onChange(style)} />
          <span className="style-art" aria-hidden="true">
            {mood ? <Image src={mood.photo} alt="" fill sizes="(max-width: 599px) 75vw, (max-width: 899px) 40vw, 280px" /> : <span className="style-placeholder">{style.name}</span>}
          </span>
          <span className="style-title"><strong>{style.name}<sup>{String(index + 1).padStart(2, "0")}</sup></strong><span className="selected-mark" aria-hidden="true">{value === style.id ? "已选择" : "选择 ↗"}</span></span>
          <span className="style-description">{mood?.description ?? "发现新的灵感"}</span>
        </label>;
      })}
    </div>
    <div className="carousel-footer"><span>五种风格，各有日常。</span><div className="carousel-controls"><button type="button" aria-label="上一组风格" aria-controls="style-rail" onClick={() => scroll(-1)}>←</button><button type="button" aria-label="下一组风格" aria-controls="style-rail" onClick={() => scroll(1)}>→</button></div></div>
  </fieldset>;
}
