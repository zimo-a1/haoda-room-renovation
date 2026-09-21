import { describe, expect, it, vi } from "vitest";
import { checkJavaScriptAssets, scriptSources } from "../scripts/check-javascript-assets.mjs";

const page = '<script src="/_next/static/chunks/webpack-current.js"></script><script async src="/_next/static/chunks/app/page-old.js"></script>';
const javascript = { type: "application/javascript; charset=UTF-8", bytes: new TextEncoder().encode("console.log('loaded')") };

describe("实际页面脚本检查", () => {
  it("解析真实 script src，去重并处理单引号和查询参数", () => {
    expect(scriptSources('<script>window.ready=true</script><script src="/a.js?v=1&amp;x=2"></script><script src=\'/b.js\'></script><script defer src=\'/b.js\'></script><script data-src="/not-loaded.js"></script>')).toEqual(["/a.js?v=1&x=2", "/b.js"]);
  });

  it("必须请求 HTML 实际引用的旧脚本，而不能只核对磁盘新产物", async () => {
    const request = vi.fn().mockResolvedValue(javascript);
    expect(await checkJavaScriptAssets(page, request)).toBe(2);
    expect(request).toHaveBeenNthCalledWith(2, "/_next/static/chunks/app/page-old.js");
  });

  it.each([404, 500])("首页正常但交互脚本 HTTP %i 时必须失败", async (status) => {
    const request = vi.fn().mockResolvedValueOnce(javascript).mockRejectedValueOnce(new Error(`page-old.js: HTTP ${status}`));
    await expect(checkJavaScriptAssets(page, request)).rejects.toThrow(`HTTP ${status}`);
  });

  it("HTTP 200 返回 HTML 错误页时不能当作脚本成功", async () => {
    const request = vi.fn().mockResolvedValue({ type: "text/html", bytes: new TextEncoder().encode("<html>error</html>") });
    await expect(checkJavaScriptAssets(page, request)).rejects.toThrow("expected JavaScript");
  });

  it("没有脚本引用或脚本内容为空时必须失败", async () => {
    await expect(checkJavaScriptAssets("<html></html>", vi.fn())).rejects.toThrow("no external JavaScript");
    await expect(checkJavaScriptAssets(page, vi.fn().mockResolvedValue({ ...javascript, bytes: new Uint8Array() }))).rejects.toThrow("empty JavaScript");
  });
});
