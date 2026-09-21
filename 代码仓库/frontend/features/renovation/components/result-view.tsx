"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getTask, getTaskProducts } from "../api";
import type { GeneratedTask, GenerationDiagnostics, Resource, TaskProducts } from "../types";
import { apiErrorMessage, AppError, errorMessage } from "@/lib/api/client";
import { FurnitureImage } from "./furniture-image";
import { GenerationDiagnosticDetails } from "./generation-diagnostics";
import { SiteHeader } from "@/components/site-header";

export function ResultView({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Resource<GeneratedTask>>({ status: "loading" });
  const [products, setProducts] = useState<Resource<TaskProducts> | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [failureDetails, setFailureDetails] = useState<{ taskId: string; diagnostics?: GenerationDiagnostics }>();

  useEffect(() => {
    const controller = new AbortController();
    getTask(taskId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.status === "failed") {
          setFailureDetails({ taskId, diagnostics: data.diagnostics });
          throw new AppError(data.errorCode ?? "IMAGE_GEN_FAILED", apiErrorMessage(data.errorCode ?? "IMAGE_GEN_FAILED"));
        }
        if (data.status !== "succeeded" || !data.resultImageUrl) throw new AppError("STILL_PROCESSING", "效果图尚未生成完成，请稍后刷新，不要重复提交。");
        setTask({ status: "success", data });
        getTaskProducts(taskId, controller.signal)
          .then((value) => { if (!controller.signal.aborted) setProducts({ status: "success", data: value }); })
          .catch((error: unknown) => { if (!controller.signal.aborted) setProducts({ status: "error", message: errorMessage(error) }); });
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setTask({ status: "error", message: errorMessage(error) }); });
    return () => controller.abort();
  }, [taskId]);

  return (
    <>
      <SiteHeader />
      <main className="result-page editorial-section">
      <p className="margin-label">效果图</p>
      <div className="section-body">
        <div className="result-heading">
          <h1>你的软装效果图</h1>
          <p>保持原图拍摄角度，只替换软装陈设。</p>
        </div>

        {task.status === "loading" && <p className="result-status" role="status">正在读取结果…</p>}

        {task.status === "error" && (
          <div className="result-error" role="alert">
            <p>{task.message}</p>
            <GenerationDiagnosticDetails diagnostics={failureDetails?.taskId === taskId ? failureDetails.diagnostics : undefined} />
            <Link className="button secondary" href="/design">返回重新搭配</Link>
          </div>
        )}

        {task.status === "success" && (
          <>
            <figure className="result-figure">
              {imageFailed ? (
                <div className="image-failure" role="alert"><p>结果图暂时无法显示，请刷新页面重试。</p></div>
              ) : (
                <Image
                  src={task.data.resultImageUrl}
                  alt="生成后的软装效果图"
                  width={1280}
                  height={960}
                  unoptimized
                  className="result-image"
                  onError={() => setImageFailed(true)}
                />
              )}
              <figcaption>
                <span>智能生成 · 保持原图角度</span>
                <span>{task.data.cost != null ? `本次成本约 ¥${task.data.cost.toFixed(2)}` : ""}</span>
              </figcaption>
            </figure>

            {!!task.data.furnitureChoices?.length && (
              <section className="result-products" aria-label="本次生成参考款式">
                <h2>本次选款，逐件核对</h2>
                <p className="result-note">以下是本次提交给模型的参考款式，不代表已验证生成结果完全一致。请核对造型、材质和颜色；图片为智能款式示意，不是在售商品。</p>
                <ul className="chosen-furniture confirmation-furniture">
                  {task.data.furnitureChoices.map(({ element, option }) => (
                    <li key={element.id}>
                      <FurnitureImage option={option} small />
                      <div><span>{element.room} · {element.name}</span><p>{option.name}</p></div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="result-products" aria-label="图内商品">
              <h2>图内家具与选购</h2>
              {products?.status === "loading" && <p className="result-status" role="status">正在加载选购链接…</p>}
              {products?.status === "error" && <p className="result-status">{products.message}</p>}
              {products?.status === "success" && (
                <>
                  {products.data.message && <p className="result-note">{products.data.message}</p>}
                  <ul className="product-groups">
                    {products.data.products.map((group) => (
                      <li key={group.elementId}>
                        <strong>{group.elementName}</strong>
                        <div className="product-links">
                          {group.items.length ? (
                            group.items.map((item) => (
                              <a key={item.clickUrl} className="product-link" href={item.clickUrl} target="_blank" rel="noopener noreferrer">
                                {item.imageUrl && <Image src={item.imageUrl} alt="" width={56} height={56} unoptimized />}
                                <span>{item.title}{item.price ? `（${item.price}）` : ""}</span>
                              </a>
                            ))
                          ) : (
                            <span className="product-empty">暂无对应商品</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <div className="result-actions">
              <Link className="button secondary" href="/design">再改造一间</Link>
            </div>
          </>
        )}
      </div>
      </main>
    </>
  );
}
