// Read-only HTTP smoke check against an already running local frontend.
// This is not a browser rendering or visual layout test.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkJavaScriptAssets } from "./check-javascript-assets.mjs";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:3000/");
assert(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Only loopback servers are allowed");
assert(base.protocol === "http:" && !base.username && !base.password, "Use a local HTTP address without credentials");

async function request(path) {
  const url = new URL(path.replaceAll("&amp;", "&"), base);
  assert.equal(url.origin, base.origin, "Asset must be same-origin");
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: "error" });
  assert.equal(response.status, 200, `${url.pathname}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length > 0, `${url.pathname}: empty response`);
  return { bytes, type: response.headers.get("content-type") ?? "" };
}

const page = await request("/");
assert(page.type.includes("text/html"), "Homepage must return HTML");
const html = page.bytes.toString();
assert(html.includes('id="page-title"') && html.includes("软装改造"), "Expected homepage is missing");
console.log("PASS homepage: HTTP 200 and expected page content");

const logoPath = "/images/haoda-logo-white.svg";
assert(html.includes(`src="${logoPath}"`), "Homepage must reference the white brand logo");
const logo = await request(logoPath);
assert(logo.type.includes("image/svg+xml"), "Brand logo must return SVG");
const logoSource = logo.bytes.toString();
assert(logoSource.includes('viewBox="0 0 1680 511"'), "Brand logo must retain its aspect ratio");
const logoFills = [...logoSource.matchAll(/\bfill="([^"]+)"/g)].map((match) => match[1]);
assert(logoFills.length === 9 && logoFills.every((fill) => fill === "#FFFFFF"), "Brand logo must be entirely white");
console.log("PASS brand logo: local white SVG, HTTP 200 and original aspect ratio");

// A stale next start process can serve an old HTML manifest after next build
// replaces its chunks. CSS/images may pass while the whole client UI is broken.
const scriptCount = await checkJavaScriptAssets(html, request);
console.log(`PASS JavaScript: ${scriptCount} actual homepage script references`);

// Render only the result page shell with a synthetic ID. No browser JS runs,
// so this does not fetch a real task, upload a photo or start paid generation.
const resultPage = await request("/r/00000000-0000-0000-0000-000000000000");
assert(resultPage.type.includes("text/html") && resultPage.bytes.toString().includes("你的软装效果图"), "Expected result page shell is missing");
const resultScriptCount = await checkJavaScriptAssets(resultPage.bytes.toString(), request);
console.log(`PASS result page shell: HTTP 200 and ${resultScriptCount} actual script references`);

const designPage = await request("/design");
assert(designPage.type.includes("text/html") && designPage.bytes.toString().includes('id="design-workspace"'), "Expected design workspace page is missing");
const designScriptCount = await checkJavaScriptAssets(designPage.bytes.toString(), request);
console.log(`PASS design page: HTTP 200 and ${designScriptCount} actual script references`);

const stylesheets = [...new Set([...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => /\brel="stylesheet"/.test(tag) ? tag.match(/\bhref="([^"]+)"/)?.[1] : null).filter(Boolean))];
assert(stylesheets.length > 0, "Homepage has no stylesheet links");
let css = "";
for (const url of stylesheets) {
  const resource = await request(url);
  assert(resource.type.includes("text/css"), "Stylesheet returned a non-CSS response");
  css += resource.bytes.toString();
}
assert(css.includes(".hero") && css.includes(".style-grid"), "Page layout CSS is missing");
assert(css.includes(".furniture-grid") && css.includes(".chosen-furniture"), "Furniture option layout CSS is missing");
for (const family of ["Atelier Inter", "Atelier Cormorant", "Atelier Sans SC", "Atelier Serif SC"]) assert(css.includes(family), `${family} is missing from served CSS`);
console.log(`PASS stylesheets: ${stylesheets.length}, layout rules and all four font families`);

const fonts = [...new Set([...css.matchAll(/url\(\s*["']?(\/fonts\/[^\s)"']+\.woff2)["']?\s*\)/g)].map((match) => match[1]))];
assert(fonts.length > 0, "Served CSS has no local font references");
let cursor = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < fonts.length) {
    const path = fonts[cursor++];
    const { bytes, type } = await request(path);
    assert(/font|octet-stream/.test(type), `${path}: unexpected font content type`);
    assert.equal(bytes.toString("ascii", 0, 4), "wOF2", `${path}: invalid WOFF2 signature`);
    assert.equal(bytes.readUInt32BE(8), bytes.length, `${path}: incomplete WOFF2 file`);
  }
}));
console.log(`PASS fonts: ${fonts.length} HTTP responses and complete WOFF2 files`);

const source = await readFile(new URL("../features/renovation/utils.ts", import.meta.url), "utf8");
const showcaseImages = [
  "showcase-before-after-v2.png",
  "showcase-case-living-v1.png",
  "showcase-case-bedroom-v1.png",
  "showcase-case-dining-v1.png",
];
const images = ["editorial-room-v2.png", ...new Set([...source.matchAll(/photo: "\/images\/([^"]+)"/g)].map((match) => match[1])), ...showcaseImages];
assert.equal(images.length, 10, "Expected the hero, five style images and four homepage showcase images");
const furniture = JSON.parse(await readFile(new URL("../features/renovation/furniture-catalog.json", import.meta.url), "utf8"));
assert.equal(Object.keys(furniture).length, 24, "Expected all 24 furniture categories");
const furnitureImages = [...new Set(Object.values(furniture).map((group) => group.image))];
assert.equal(furnitureImages.length, 22, "Expected 22 furniture photo atlases");
images.push(...furnitureImages.map((path) => path.replace(/^\/images\//, "")));
for (const name of images) {
  const { bytes, type } = await request(`/images/${name}`);
  assert(type.includes("image/png"), `${name}: unexpected image type`);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${name}: invalid PNG signature`);
  const isFurniture = name.startsWith("furniture/");
  if (isFurniture) assert.equal(bytes.readUInt32BE(16), bytes.readUInt32BE(20) * 3, `${name}: atlas must have three square panels`);
  const width = name === "editorial-room-v2.png" || name === "showcase-before-after-v2.png" ? 1920 : isFurniture || name.startsWith("showcase-case-") ? 1200 : 384;
  const optimized = await request(`/_next/image?url=${encodeURIComponent(`/images/${name}`)}&w=${width}&q=75`);
  assert(optimized.type.startsWith("image/") && optimized.bytes.length > 100, `${name}: image optimizer failed`);
}
console.log(`PASS images: ${images.length} original files and ${images.length} optimized responses`);
console.log("Local asset loading passed. Browser rendering and device checks remain separate.");
