import Image from "next/image";
import Link from "next/link";

type SiteHeaderProps = {
  appearance?: "hero" | "light";
};

export function SiteHeader({ appearance = "light" }: SiteHeaderProps) {
  const whiteLogo = appearance === "hero";

  return (
    <header className={`site-header site-header-${appearance}`}>
      <Link className="brand" href="/" aria-label="好搭首页">
        <Image
          className="site-brand-logo"
          src={whiteLogo ? "/images/haoda-logo-white.svg" : "/images/haoda-logo-refined-no-english.svg"}
          alt="好搭"
          width={1680}
          height={511}
          unoptimized
          priority={whiteLogo}
        />
      </Link>
      <nav aria-label="主要导航">
        <Link href="/">首页</Link>
        <Link href="/design">开始设计</Link>
      </nav>
      <button className="header-login" type="button" disabled title="登录功能将在正式上线时开放">
        登录
      </button>
    </header>
  );
}
