"use client";

import { useEffect, useRef, useState } from "react";
import { getElements, getStyles, getTaskProducts, uploadPhoto } from "../api";
import type { Element, GeneratedTask, Photo, Resource, Style, TaskProducts } from "../types";
import { validatePhoto } from "../utils";
import { errorMessage } from "@/lib/api/client";
import { PhotoUploader } from "./photo-uploader";
import { StylePicker } from "./style-picker";
import { ElementPicker } from "./element-picker";
import { ConfirmationDialog } from "./confirmation-dialog";
import { FurnitureImage } from "./furniture-image";
import { resolveFurnitureChoices } from "../furniture";
import { DesignPreview } from "./design-preview";

export function Workspace() {
  const [styles, setStyles] = useState<Resource<Style[]>>({ status: "loading" });
  const [styleRetry, setStyleRetry] = useState(0);
  const [style, setStyle] = useState<Style | null>(null);
  const [elements, setElements] = useState<Resource<Element[]> | null>(null);
  const [elementRetry, setElementRetry] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [room, setRoom] = useState("客厅");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [generatedTask, setGeneratedTask] = useState<GeneratedTask | null>(null);
  const [products, setProducts] = useState<Resource<TaskProducts> | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const objectUrl = photo?.url;
  const choices = elements?.status === "success" ? resolveFurnitureChoices(elements.data, selections) : [];
  const ready = photo?.status === "success" && !!style && choices.length > 0;
  const step = photo?.status !== "success" ? 1 : !style ? 2 : 3;

  useEffect(() => {
    const controller = new AbortController();
    getStyles(controller.signal).then((data) => { if (!controller.signal.aborted) setStyles({ status: "success", data }); }).catch((error: unknown) => { if (!controller.signal.aborted) setStyles({ status: "error", message: errorMessage(error) }); });
    return () => controller.abort();
  }, [styleRetry]);

  useEffect(() => {
    if (!style) return;
    const controller = new AbortController();
    getElements(style.id, controller.signal).then((data) => { if (!controller.signal.aborted) setElements({ status: "success", data }); }).catch((error: unknown) => { if (!controller.signal.aborted) setElements({ status: "error", message: errorMessage(error) }); });
    return () => controller.abort();
  }, [style, elementRetry]);

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  useEffect(() => () => uploadController.current?.abort(), []);

  useEffect(() => {
    if (!generatedTask) return;
    const controller = new AbortController();
    getTaskProducts(generatedTask.taskId, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setProducts({ status: "success", data }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setProducts({ status: "error", message: errorMessage(error) }); });
    return () => controller.abort();
  }, [generatedTask]);

  function clearGeneratedPreview() {
    setGeneratedTask(null);
    setProducts(null);
  }

  function selectPhoto(file: File) {
    const error = validatePhoto(file);
    if (error) { setPhotoError(error); return; }
    uploadController.current?.abort();
    setPhotoError(null);
    clearGeneratedPreview();
    setPhoto({ file, url: URL.createObjectURL(file), photoId: null, status: "ready" });
  }

  async function upload() {
    if (!photo || uploadController.current || photo.status === "success") return;
    const controller = new AbortController();
    uploadController.current = controller;
    setPhotoError(null);
    setPhoto({ ...photo, status: "uploading", message: undefined });
    try {
      const photoId = await uploadPhoto(photo.file, controller.signal);
      if (!controller.signal.aborted) setPhoto({ ...photo, status: "success", photoId });
    } catch (error) {
      if (!controller.signal.aborted) setPhoto({ ...photo, status: "error", message: errorMessage(error) });
    } finally {
      if (uploadController.current === controller) uploadController.current = null;
    }
  }

  function chooseStyle(nextStyle: Style) {
    if (style?.id === nextStyle.id) return;
    clearGeneratedPreview();
    setStyle(nextStyle);
    setSelections({});
    setElements({ status: "loading" });
    setRoom("客厅");
  }

  function removeChoice(elementId: string) {
    clearGeneratedPreview();
    setSelections((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== elementId)));
  }

  function chooseFurniture(elementId: string, optionId: string) {
    clearGeneratedPreview();
    setSelections((current) => ({ ...current, [elementId]: optionId }));
  }

  const readinessMessage = !photo || photo.status !== "success" ? "上传照片后，就可以预览生成信息" : !style ? "再选择一种喜欢的风格" : !choices.length ? "再为一件家具选好具体款式" : `已选 ${style.name} · ${choices.length} 件软装`;

  return <>
    <section id="design-workspace" className="workspace design-studio" aria-labelledby="workspace-heading" tabIndex={-1}>
      <div className="design-controls" aria-label="设计功能与筛选">
        <header className="control-panel-heading">
          <span>开始设计</span>
          <h1 id="workspace-heading">从你的房间开始</h1>
          <p>在左边完成上传与筛选，右边始终保留图片和商品对应关系。</p>
        </header>

        <ol className="workflow-steps control-steps" aria-label="设计步骤">
          {["上传房间", "选择风格", "挑选家具"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}><span>{`0${index + 1}`}</span><span>{label}</span></li>)}
        </ol>

        <div className="workspace-promise control-promise" aria-label="生成边界说明">
          <strong>空间结构保持不变</strong>
          <span>墙地门窗与拍摄视角作为生成约束；已选家具会逐件作为参考。</span>
        </div>

        <section className="workflow-stage upload-stage" aria-labelledby="upload-heading">
          <div className="section-heading"><h2 id="upload-heading"><span className="stage-number">01</span>上传房间照片</h2></div>
          <PhotoUploader photo={photo} error={photoError} onSelect={selectPhoto} onUpload={upload} onError={setPhotoError} />
        </section>

        <section className="workflow-stage style-section" aria-labelledby="style-heading">
          <div className="section-heading"><h2 id="style-heading"><span className="stage-number">02</span>选择喜欢的风格</h2><span className="section-aside">单选</span></div>
          <StylePicker styles={styles} value={style?.id ?? ""} onChange={chooseStyle} retry={() => { setStyles({ status: "loading" }); setStyleRetry((value) => value + 1); }} />
        </section>

        <section className="workflow-stage elements-section" aria-labelledby="elements-heading">
          <div className="section-heading"><h2 id="elements-heading"><span className="stage-number">03</span>选择房间与家具</h2><span className="section-aside">{choices.length ? `已选 ${choices.length}` : "逐件选款"}</span></div>
          <ElementPicker key={style?.id ?? "none"} elements={elements} selections={selections} room={room} onRoom={setRoom} onChoose={chooseFurniture} retry={() => { setElements({ status: "loading" }); setElementRetry((value) => value + 1); }} />
        </section>

        <section className="design-summary" aria-label="当前搭配">
          <div className="summary-top"><h2>我的搭配清单</h2><span>{choices.length.toString().padStart(2, "0")} 件</span></div>
          <div className="summary-content"><span className="summary-style">{style ? style.name : "风格待选择"}</span><p>{choices.length ? "可继续更换或移除；修改后右侧旧结果会清空，避免错配。" : "先选家具分类，再点击喜欢的款式图片加入清单。"}</p></div>
          {choices.length > 0 && <ul className="chosen-furniture">{choices.map(({ element, option }) => <li key={element.id}>
            <FurnitureImage key={option.id} option={option} small />
            <div><span>{element.room} · {element.name}</span><p>{option.name}</p><small>智能款式示意</small></div>
            <button type="button" className="text-button" aria-label={`移除${element.room}的${element.name}`} onClick={() => removeChoice(element.id)}>移除</button>
          </li>)}</ul>}
        </section>

        <div className="action-dock control-action-dock"><div className="action-inner"><div className="action-summary"><p role="status">{readinessMessage}</p><span id="generation-note">确认费用后生成一张同角度效果图</span></div><button className="button primary generate-button" type="button" disabled={!ready} aria-describedby="generation-note" onClick={() => setConfirming(true)}>预览生成信息<span aria-hidden="true">↗</span></button></div></div>
      </div>

      <DesignPreview key={`${photo?.url ?? "empty"}-${generatedTask?.taskId ?? "draft"}`} photo={photo} style={style} choices={choices} task={generatedTask} products={products} />
    </section>

    <section id="photo-guide" className="editorial-section photo-guide" aria-labelledby="guide-heading"><p className="margin-label">拍照小贴士</p><div className="section-body"><h2 id="guide-heading">让房间，好好入镜。</h2><div className="guide-columns"><div><span>01 / 光线</span><p>选择白天，打开窗帘。<br />自然光让材质和颜色更清楚。</p></div><div><span>02 / 视角</span><p>站在房间一角，横向拍摄。<br />让地面、墙面与家具完整入镜。</p></div><div><span>03 / 空间</span><p>收起暂时的杂物。<br />留下你想保留的家具和生活痕迹。</p></div></div></div></section>
    {confirming && style && photo?.photoId && <ConfirmationDialog style={style} choices={choices} photoId={photo.photoId} onClose={() => setConfirming(false)} onGenerated={(task) => { setProducts({ status: "loading" }); setGeneratedTask(task); setConfirming(false); }} />}
  </>;
}
