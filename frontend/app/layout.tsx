import type { Metadata } from "next";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "软装改造 · 住进喜欢的生活",
  description: "从一张房间照片开始，找到喜欢的风格，搭配属于你的日常。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{process.env.DEMO_EXPORT === "1" && <p className="content-width furniture-disclosure">好搭分享演示 · 可浏览、筛选和拖动示例对比 · 暂不开放上传与生成</p>}{children}</body></html>;
}
