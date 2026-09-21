// Download public font assets only. No project content is read or sent.
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "public/fonts");
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const fonts = [
  ["Inter", "inter", "Atelier Inter"],
  ["Cormorant Garamond", "cormorant-garamond", "Atelier Cormorant"],
  ["Noto Sans SC", "noto-sans-sc", "Atelier Sans SC"],
  ["Noto Serif SC", "noto-serif-sc", "Atelier Serif SC"],
];
async function download(url) {
  const { stdout } = await exec("curl", ["-fLsS", "--http1.1", "--retry", "2", "--max-time", "15", "-A", userAgent, url], { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}
await mkdir(out, { recursive: true });
const jobs = [];
const sheets = [];
for (const [family, file, localFamily] of fonts) {
  const url = new URL("https://fonts.googleapis.com/css2");
  url.searchParams.set("family", `${family}:wght@400`);
  url.searchParams.set("display", "swap");
  const css = (await download(url.href)).toString();
  let index = 0;
  const localCss = css.replaceAll(`'${family}'`, `'${localFamily}'`).replace(/url\((https:\/\/[^)]+)\) format\('woff2'\)/g, (_, fontUrl) => {
    const filename = `${file}-400-${index++}.woff2`;
    jobs.push(async () => {
      const bytes = await download(fontUrl);
      if (bytes.subarray(0, 4).toString() !== "wOF2") throw new Error(`Invalid WOFF2 for ${family}`);
      await writeFile(path.join(out, filename), bytes);
    });
    return `url('/fonts/${filename}') format('woff2')`;
  });
  if (!index || /https:\/\//.test(localCss)) throw new Error(`Incomplete local conversion for ${family}`);
  sheets.push(localCss);
  jobs.push(async () => {
    const license = await download(`https://raw.githubusercontent.com/google/fonts/main/ofl/${file.replaceAll("-", "")}/OFL.txt`);
    await writeFile(path.join(out, `${file}-OFL.txt`), license);
  });
  console.log(`${family}: ${index} public unicode segments.`);
}
let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < jobs.length) await jobs[cursor++]();
}));
await writeFile(path.join(root, "app/fonts.css"), "/* Generated from public Google Fonts CSS. All assets are served locally. */\n" + sheets.join("\n"));
console.log("All four fonts and OFL licenses saved. No runtime requests to Google Fonts.");
