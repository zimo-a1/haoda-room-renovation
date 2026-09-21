"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="fallback-page"><h1>页面暂时没能打开</h1><p>请重新加载。房间照片不会保存在浏览器中，需要重新选择。</p><button className="button primary" onClick={reset}>重新加载</button></main>;
}
