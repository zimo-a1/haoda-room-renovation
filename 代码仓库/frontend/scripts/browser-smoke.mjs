/* global taskSpace */
// Run in ego-browser's browser-owned Node runtime. Does not launch another browser.
// FRONTEND_QA_SPACE=20 ego-browser nodejs < scripts/browser-smoke.mjs
const assert = (await import("node:assert/strict")).default;
const path = await import("node:path");
const fs = await import("node:fs/promises");
const evidence = path.resolve(process.cwd(), "../../docs/evidence/阶段3/第1子阶段");
await fs.mkdir(evidence, { recursive: true });
const task = await taskSpace(process.env.FRONTEND_QA_SPACE ? Number(process.env.FRONTEND_QA_SPACE) : "软装前端代表页验收");
const page = task.page("p1");
console.log({ spaceId: task.spaceId });
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelectorAll('input[name="style"]').length === 5);
console.log(await page.snapshot());
await page.click('label.style-card:has-text("日式原木")');
await page.waitForSelector('label.element-chip:has-text("沙发")');
await page.click('label.element-chip:has-text("沙发")');
assert.equal(await page.evaluate(() => document.querySelector(".generate-button").disabled), true);
await page.screenshot({ path: path.join(evidence, "01-桌面工作台.png"), fullPage: true });

// Use the original SVG room drawing as a non-private upload fixture.
const clip = await page.evaluate(() => {
  const box = document.querySelector(".room-canvas").getBoundingClientRect();
  return { x: box.x, y: box.y, width: box.width, height: box.height };
});
const fixture = path.join(evidence, "上传测试用空间示意.png");
await page.screenshot({ path: fixture, clip });
await page.setInputFiles('input[type="file"]', [fixture]);
await page.waitForSelector('loc=role:button[name="上传这张照片"]');
assert.equal(await page.evaluate(() => document.querySelector(".generate-button").disabled), true);
await page.click('loc=role:button[name="上传这张照片"]');
await page.waitForSelector('text="房间照片已就位"');
await page.click('loc=role:button[name="卧室"]');
await page.click('label.element-chip:text-is("床")');
await page.click('loc=role:button[name="预览生成信息"]');
await page.waitForSelector("dialog[open]");
assert.equal(await page.evaluate(() => document.querySelector("dialog").textContent.includes("客厅·沙发、卧室·床")), true);
assert.equal(await page.evaluate(() => document.querySelector("dialog .primary").disabled), true);
await page.screenshot({ path: path.join(evidence, "02-费用确认.png"), fullPage: false });
await page.keyboard.press("Escape");
assert.equal(await page.evaluate(() => document.querySelector("dialog") === null), true);
assert.equal(await page.evaluate(() => document.activeElement?.textContent.includes("预览生成信息")), true);

const widths = [];
for (const width of [1440, 1280, 768, 390]) {
  await page.cdp("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  const result = await page.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth }));
  assert.equal(result.viewport, width);
  assert.ok(result.content <= width, `horizontal overflow at ${width}`);
  widths.push(result);
  await page.screenshot({ path: path.join(evidence, `03-布局-${width}px.png`), fullPage: true });
}
await page.click('loc=role:button[name="预览生成信息"]');
await page.waitForSelector("dialog[open]");
await page.screenshot({ path: path.join(evidence, "04-手机费用确认.png"), fullPage: false });
await page.click('loc=role:button[name="返回继续搭配"]');
await page.reload({ waitUntil: "networkidle" });
assert.equal(await page.evaluate(() => document.querySelector(".generate-button").disabled), true);
assert.equal(await page.evaluate(() => document.querySelector('.room-canvas img') === null), true);
console.log({ passed: true, checks: ["real catalog", "explicit upload", "cross-room selection", "confirmation", "no paid submission", "Escape and focus return", "responsive layout", "reload privacy"], widths });
await page.cdp("Emulation.clearDeviceMetricsOverride");
await task.finish({ keep: ["p1"] });
