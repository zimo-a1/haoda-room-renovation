"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FurnitureChoice, GeneratedTask, GenerationDiagnostics, GenerationOptions, Style } from "../types";
import { createTask, getGenerationOptions, getTask } from "../api";
import { apiErrorMessage, AppError, errorMessage } from "@/lib/api/client";
import { FurnitureImage } from "./furniture-image";
import { GenerationDiagnosticDetails } from "./generation-diagnostics";

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

export function ConfirmationDialog({
  style,
  choices,
  photoId,
  onClose,
  onGenerated,
}: {
  style: Style;
  choices: FurnitureChoice[];
  photoId: string;
  onClose: () => void;
  onGenerated?: (task: GeneratedTask) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [options, setOptions] = useState<GenerationOptions | null>(null);
  const [submittedTaskId, setSubmittedTaskId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<GenerationDiagnostics>();

  useEffect(() => {
    const load = new AbortController();
    getGenerationOptions(load.signal)
      .then((data) => { if (!load.signal.aborted) setOptions(data); })
      .catch((caught: unknown) => { if (!load.signal.aborted) setError(errorMessage(caught)); });
    return () => load.abort();
  }, []);

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node?.close();
      document.body.style.overflow = previous;
      controller.current?.abort();
    };
  }, []);

  async function generate() {
    if (generating || submittedTaskId || !options?.configured || choices.length > options.maxProductImages) return;
    const current = new AbortController();
    controller.current = current;
    setGenerating(true);
    setError(null);
    try {
      let task = await createTask(photoId, style.id, choices, current.signal);
      setSubmittedTaskId(task.taskId);
      for (let attempt = 0; attempt < 80 && task.status === "processing"; attempt += 1) {
        if (attempt > 0) await delay(3000, current.signal);
        task = await getTask(task.taskId, current.signal);
      }
      if (task.status === "succeeded") {
        if (onGenerated) onGenerated(task);
        else router.push(`/r/${task.taskId}`);
        return;
      }
      if (task.status === "failed") {
        setDiagnostics(task.diagnostics);
        if (task.errorCode) throw new AppError(task.errorCode, apiErrorMessage(task.errorCode));
      }
      if (task.status === "processing") throw new AppError("STILL_PROCESSING", "任务仍在处理，请先核对后台任务状态，不要重复付费提交。");
      throw new AppError("IMAGE_GEN_FAILED", "这次没有成功出图，请稍后重试。", true);
    } catch (caught) {
      if (current.signal.aborted) return;
      setGenerating(false);
      setError(errorMessage(caught));
    }
  }

  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setGenerating(false);
    setError("已停止等待，后台任务不会因此取消，请查看这次任务；不要重复提交。");
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-description"
      className="confirmation-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (generating) return;
        onClose();
      }}
    >
      <button type="button" className="dialog-close text-button" onClick={onClose} disabled={generating} aria-label="关闭生成信息">
        关闭
      </button>
      <h2 id="confirmation-title">看看这次的搭配</h2>
      <p id="confirmation-description" className="dialog-description">原图角度不变，给日常添一些新意。</p>
      <dl className="confirmation-list">
        <div><dt>软装风格</dt><dd>{style.name}</dd></div>
        <div><dt>已选软装</dt><dd>{choices.map(({ element }) => `${element.room}·${element.name}`).join("、")}</dd></div>
      </dl>
      <ul className="chosen-furniture confirmation-furniture" aria-label="确认已选款式">
        {choices.map(({ element, option }) => (
          <li key={element.id}>
            <FurnitureImage option={option} small />
            <div><span>{element.room} · {element.name}</span><p>{option.name}</p><small>智能款式示意</small></div>
          </li>
        ))}
      </ul>
      <dl className="confirmation-list"><div className="confirmation-cost"><dt>预计单次模型成本</dt><dd>{options ? options.configured ? <><small>约</small> ¥{options.estimatedCost.toFixed(2)}</> : "待确认" : "读取配置中…"}</dd></div></dl>
      {options && <>
        <p className="dialog-privacy">点击生成后，房间照片与以上已选款式图片将发送至{options.providerLabel}，用于生成一张效果图。以所选家具外观为优先参考，智能生成仍可能存在漏项或款式偏差，需逐件核对。费用为预算估算，以供应商实际账单为准。</p>
        <p className="dialog-privacy">图像生成服务：{options.configured ? "已就绪" : "尚未配置"}</p>
        <p className="dialog-privacy">生成要求：所选家具款式不变，允许在原功能分区内小范围调整摆位，优化间距和光影；墙地门窗及拍摄角度保持不变。效果图仅作搭配参考，不作为实际尺寸依据。</p>
        {options.individualReferences ? <p className="dialog-privacy">房间原图 + {choices.length} 张商品单图逐张提交，不合并参考板。每次最多 {options.maxProductImages} 件商品。</p> : choices.length > 2 && <p className="dialog-privacy">当前供应商的多件选款会合并为编号参考图提交，细节还原需逐件核对。</p>}
        {!options.configured && <p role="alert" className="generation-error">图像服务尚未就绪，请检查后端模型和预算设置并重启后端。</p>}
        {choices.length > options.maxProductImages && <p role="alert" className="generation-error">最多选择 {options.maxProductImages} 件商品，请返回减少选款，不会自动丢弃已选项。</p>}
      </>}
      {generating && <p role="status" className="generation-status">正在生成效果图，可能需要数分钟。请保持页面打开，不要重复点击。</p>}
      {error && <p role="alert" className="generation-error">{error}</p>}
      {error && <GenerationDiagnosticDetails diagnostics={diagnostics} />}
      {submittedTaskId && <p className="dialog-privacy"><a href={`/r/${encodeURIComponent(submittedTaskId)}`}>查看这次任务</a> · 停止等待不会取消模型出图或计费。</p>}
      <button type="button" className="button primary full-width" disabled={generating || !!submittedTaskId || !options?.configured || choices.length > options.maxProductImages} onClick={generate}>
        {generating ? "生成中…" : "确认并生成"}
      </button>
      {generating ? (
        <button type="button" className="button secondary full-width" onClick={cancel}>停止等待（不会取消出图）</button>
      ) : (
        <button type="button" className="button secondary full-width" onClick={onClose} autoFocus>返回继续搭配<span aria-hidden="true">↗</span></button>
      )}
    </dialog>
  );
}
