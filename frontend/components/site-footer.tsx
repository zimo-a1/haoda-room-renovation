import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer content-width">
      <div>
        <p className="footer-label">快捷入口</p>
        <Link href="/#style-showcase">寻找风格</Link>
        <Link href="/design">开始改造</Link>
      </div>
      <div>
        <p className="footer-label">使用说明</p>
        <Link href={process.env.DEMO_EXPORT === "1" ? "/design#demo-products" : "/design#photo-guide"}>{process.env.DEMO_EXPORT === "1" ? "体验家具搭配" : "拍照小贴士"}</Link>
        <span>{process.env.DEMO_EXPORT === "1" ? "分享演示 · 不上传照片，不产生生成费用" : "本地体验 · 原图仅用于本次设计"}</span>
      </div>
      <div className="footer-colophon">用一点改变，<br />回应每一天的生活。<small>© 2026 软装改造</small></div>
    </footer>
  );
}
