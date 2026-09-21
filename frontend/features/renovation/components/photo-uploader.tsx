import { useRef, useState } from "react";
import type { Photo } from "../types";
import { ErrorNotice } from "@/components/ui";

type Props = { photo: Photo | null; error: string | null; onSelect: (file: File) => void; onUpload: () => void; onError: (message: string) => void };

export function PhotoUploader({ photo, error, onSelect, onUpload, onError }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const uploading = photo?.status === "uploading";
  function choose(files: FileList | null) {
    if (!files?.length || uploading) return;
    if (files.length !== 1) { onError("每次只需要一张房间照片，请重新选择。"); return; }
    onSelect(files[0]);
  }
  return <>
    <input ref={input} id="room-photo" type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={uploading} aria-label="选择房间照片" onChange={(event) => { choose(event.currentTarget.files); event.currentTarget.value = ""; }} />
    <div className={`upload-zone ${dragging ? "dragging" : ""} ${photo?.status === "success" ? "uploaded" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!uploading) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files); }}>
      <p className="upload-number" aria-hidden="true">从你的房间开始</p>
      <div className="upload-copy"><strong>{photo ? (photo.status === "success" ? "房间照片已就位" : "照片已选择") : "把房间的样子，放在这里"}</strong><p>{photo ? (photo.status === "error" ? "上传失败，请重新上传。" : "一张房间照片已选好。") : "拖入照片，或从相册中选择"}</p></div>
      <button className="button small secondary" type="button" disabled={uploading} onClick={() => input.current?.click()}>{photo ? "重新选择" : "选择照片"}<span aria-hidden="true">↗</span></button>
    </div>
    {photo && photo.status !== "success" && <div className="upload-action"><p>点击上传即同意将照片暂存到本机服务，用于本次设计。</p><button type="button" className="button small primary" disabled={uploading} onClick={onUpload}>{uploading ? "正在上传…" : photo.status === "error" ? "重新上传" : "上传这张照片"}</button></div>}
    <p className="field-hint" role="status">{photo?.status === "success" ? "上传成功 · 原图仅在本机服务内存暂存，刷新或重启后请重新上传。" : "常见图片格式，文件大小不超过 10 兆字节 · 原图仅用于本次设计"}</p>
    {error && <ErrorNotice message={error} />}
    {photo?.status === "error" && photo.message && <ErrorNotice message={photo.message} />}
  </>;
}
