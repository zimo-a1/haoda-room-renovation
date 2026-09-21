import Image from "next/image";
import Link from "next/link";
import { BeforeAfterShowcase } from "@/components/before-after-showcase";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const styleShowcase = [
  { name: "中古风", note: "温润木色与经典轮廓", image: "/images/style-mid-century-v3.png" },
  { name: "北欧风", note: "明亮留白与轻盈日常", image: "/images/style-nordic-v3.png" },
  { name: "日式风", note: "克制材质与安静秩序", image: "/images/style-japanese-v3.png" },
  { name: "奶油风", note: "柔和色调与圆润触感", image: "/images/style-cream-v3.png" },
  { name: "法式风", note: "细腻线条与松弛优雅", image: "/images/style-french-v3.png" },
];

const caseShowcase = [
  { name: "客厅案例", note: "用木色、织物与一把单椅，重新整理家的会客区。", image: "/images/showcase-case-living-v1.png", alt: "暖阳下的中古风客厅展示案例" },
  { name: "卧室案例", note: "让睡眠区只留下安静的材质、光线与必要的陪伴。", image: "/images/showcase-case-bedroom-v1.png", alt: "自然木床与亚麻织物的卧室展示案例" },
  { name: "餐厅案例", note: "一张圆桌，把日常的用餐时间变得更有停留感。", image: "/images/showcase-case-dining-v1.png", alt: "圆木餐桌与暖光的餐厅展示案例" },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#style-showcase">跳到主要内容</a>
      <main>
        <section className="hero" aria-labelledby="page-title">
          <Image src="/images/editorial-room-v2.png" alt="暖阳照进客厅，原木座椅、陶土色沙发与石材茶几形成温暖的搭配" fill sizes="100vw" preload className="hero-image" />
          <SiteHeader appearance="hero" />
          <div className="hero-copy">
            <h1 id="page-title">一张照片，打开家的另一种可能。</h1>
            <p>留下熟悉的空间，把喜欢的颜色、材质和家具慢慢添进来。</p>
            <Link href="/design" className="hero-link">开始你的空间改造 <span aria-hidden="true">↗</span></Link>
          </div>
        </section>

        <section id="style-showcase" className="landing-section content-width" aria-labelledby="style-showcase-heading">
          <div className="landing-heading">
            <div><h2 id="style-showcase-heading">先找到，你想住进去的感觉。</h2><p>从中古风开始，选择一个让你愿意多停留一会儿的空间方向。</p></div>
          </div>
          <div className="landing-style-grid">
            {styleShowcase.map((style) => (
              <article className="landing-style-card" key={style.name}>
                <Image src={style.image} alt={`${style.name}空间示意`} width={1254} height={1254} sizes="(max-width: 679px) 70vw, (max-width: 1000px) 35vw, 20vw" />
                <h3>{style.name}</h3>
                <p>{style.note}</p>
              </article>
            ))}
          </div>
          <Link href="/design#style-heading" className="landing-link">带着喜欢的风格开始设计 <span aria-hidden="true">↗</span></Link>
        </section>

        <section className="landing-section landing-compare-section" aria-labelledby="compare-heading">
          <div className="content-width">
            <div className="landing-heading">
              <div><h2 id="compare-heading">不换房，也能换一种回家的心情。</h2><p>保留熟悉的格局，让软装一点点把生活的节奏铺开。</p></div>
            </div>
            <BeforeAfterShowcase />
            <p className="showcase-disclosure">首页展示案例，用于说明改造方向，不代表任何用户的真实生成结果。</p>
          </div>
        </section>

        <section className="landing-section content-width case-section" aria-labelledby="case-heading">
          <div className="landing-heading">
            <div><h2 id="case-heading">把日常的每一个房间，慢慢搭成喜欢的样子。</h2><p>从会客、睡眠到用餐，好的搭配都应贴近真实的生活方式。</p></div>
          </div>
          <div className="case-grid">
            {caseShowcase.map((item) => (
              <article className="case-card" key={item.name}>
                <Image src={item.image} alt={item.alt} width={1448} height={1086} sizes="(max-width: 679px) 100vw, 33vw" />
                <div><h3>{item.name}</h3><p>{item.note}</p></div>
              </article>
            ))}
          </div>
          <p className="showcase-disclosure">以上为展示案例，用于呈现首页设计方向。</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
