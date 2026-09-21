import Link from "next/link";

export default function NotFound() {
  return <main className="fallback-page"><p className="eyebrow">404</p><h1>这个房间还没有开门</h1><p>页面不存在，可以回到工作台开始新的设计。</p><Link className="button primary" href="/design">回到工作台</Link></main>;
}
