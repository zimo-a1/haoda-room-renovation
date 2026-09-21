import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Workspace } from "@/features/renovation/components/workspace";
import { DemoWorkspace } from "@/features/renovation/components/demo-workspace";

export default function DesignPage() {
  return (
    <>
      <a className="skip-link" href="#design-workspace">跳到设计工作台</a>
      <SiteHeader />
      <main className="content-width design-page-main">
        {process.env.DEMO_EXPORT === "1" ? <DemoWorkspace /> : <Workspace />}
      </main>
      <SiteFooter />
    </>
  );
}
