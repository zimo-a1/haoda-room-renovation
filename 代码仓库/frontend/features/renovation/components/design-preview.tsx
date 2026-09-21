"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { FurnitureChoice, GeneratedTask, Photo, Resource, Style, TaskProducts } from "../types";
import { FurnitureImage } from "./furniture-image";

export function DesignPreview({
  photo,
  style,
  choices,
  task,
  products,
}: {
  photo: Photo | null;
  style: Style | null;
  choices: FurnitureChoice[];
  task: GeneratedTask | null;
  products: Resource<TaskProducts> | null;
}) {
  const [position, setPosition] = useState(50);
  const [beforeFailed, setBeforeFailed] = useState(false);
  const [afterFailed, setAfterFailed] = useState(false);

  const hasResult = !!task?.resultImageUrl;
  const currentChoices = task?.furnitureChoices?.length ? task.furnitureChoices : choices;

  return (
    <aside className="design-preview-panel" aria-label="图片对比与商品链接">
      <header className="design-preview-heading">
        <div>
          <span className="design-preview-kicker">空间预览</span>
          <h2>在右边，看清每一次改变。</h2>
        </div>
        <span className={`preview-state ${hasResult ? "ready" : ""}`}>
          {hasResult ? "效果图已生成" : photo ? "原图已就位" : "等待上传原图"}
        </span>
      </header>

      <figure className="studio-preview-figure">
        <div className={`studio-preview-canvas ${photo ? "has-photo" : ""} ${hasResult ? "has-result" : ""}`}>
          {!photo && (
            <div className="studio-preview-empty">
              <span>01</span>
              <strong>先放入一张房间照片</strong>
              <p>上传后在这里查看原图；生成完成后可拖动比较改造前后。</p>
            </div>
          )}

          {photo && !hasResult && (
            beforeFailed ? (
              <div className="image-failure" role="alert"><p>这张原图暂时无法预览，请重新选择。</p></div>
            ) : (
              <Image src={photo.url} alt="待改造的房间原图" fill sizes="(min-width: 900px) 60vw, 100vw" unoptimized onError={() => setBeforeFailed(true)} />
            )
          )}

          {photo && hasResult && (
            <>
              {afterFailed ? (
                <div className="image-failure" role="alert"><p>效果图暂时无法显示，可打开独立结果页重试。</p></div>
              ) : (
                <Image className="studio-after-image" src={task.resultImageUrl} alt="生成后的软装效果图" fill sizes="(min-width: 900px) 60vw, 100vw" unoptimized onError={() => setAfterFailed(true)} />
              )}
              {!beforeFailed && (
                <div className="studio-before-layer" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
                  <Image src={photo.url} alt="改造前的房间原图" fill sizes="(min-width: 900px) 60vw, 100vw" unoptimized onError={() => setBeforeFailed(true)} />
                </div>
              )}
              <span className="studio-compare-label before" aria-hidden="true">改造前</span>
              <span className="studio-compare-label after" aria-hidden="true">改造后</span>
              <span className="studio-compare-line" style={{ left: `${position}%` }} aria-hidden="true"><span>‹ ›</span></span>
              <input
                className="studio-compare-control"
                type="range"
                min="0"
                max="100"
                value={position}
                aria-label="拖动查看改造前后效果"
                aria-valuetext={`左侧显示 ${position}% 改造前画面，右侧显示改造后画面`}
                onChange={(event) => setPosition(Number(event.target.value))}
              />
            </>
          )}

          {photo && !hasResult && <span className="studio-single-label">改造前 · 原图</span>}
        </div>
        <figcaption>
          <span>{hasResult ? "左右拖动，逐处核对家具与空间结构" : "墙地门窗与拍摄视角保持为生成约束"}</span>
          <span>{style ? `${style.name} · 已选 ${choices.length} 件` : "风格与家具待选择"}</span>
        </figcaption>
      </figure>

      <section className="preview-products" aria-labelledby="preview-products-heading">
        <div className="preview-products-heading">
          <div>
            <span>商品对应</span>
            <h3 id="preview-products-heading">图内家具与选购链接</h3>
          </div>
          {task && <Link href={`/r/${encodeURIComponent(task.taskId)}`}>打开独立结果页 ↗</Link>}
        </div>

        {!task && currentChoices.length === 0 && (
          <p className="preview-products-empty">左侧选好具体家具款式并完成生成后，这里会按家具分类列出对应商品链接。</p>
        )}

        {!task && currentChoices.length > 0 && (
          <>
            <p className="preview-products-note">已选款式会逐件提交。生成完成后，这里会按相同家具分类展示选购入口。</p>
            <ul className="preview-choice-list">
              {currentChoices.map(({ element, option }) => (
                <li key={element.id}>
                  <FurnitureImage option={option} small />
                  <div><span>{element.room} · {element.name}</span><strong>{option.name}</strong></div>
                  <span>待生成匹配</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {task && products?.status === "loading" && <p className="preview-products-empty" role="status">正在加载商品链接…</p>}
        {task && products?.status === "error" && <p className="preview-products-empty" role="alert">{products.message}</p>}
        {task && products?.status === "success" && (
          <>
            {products.data.message && <p className="preview-products-note">{products.data.message}</p>}
            <ul className="studio-product-groups">
              {products.data.products.map((group) => (
                <li key={group.elementId}>
                  <div className="studio-product-name"><span>{group.elementName}</span><small>{group.items.length ? `${group.items.length} 个入口` : "暂无链接"}</small></div>
                  <div className="studio-product-links">
                    {group.items.length ? group.items.map((item) => (
                      <a key={item.clickUrl} href={item.clickUrl} target="_blank" rel="noopener noreferrer">
                        {item.imageUrl && <Image src={item.imageUrl} alt="" width={52} height={52} unoptimized />}
                        <span>{item.title}{item.price ? ` · ${item.price}` : ""}</span>
                        <b aria-hidden="true">↗</b>
                      </a>
                    )) : <span className="product-empty">暂无对应商品</span>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </aside>
  );
}
