import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = await realpath(resolve(import.meta.dirname, "../.demo-build"));
const types = { ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon" };
createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  const error = (status) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { code: "DEMO_ONLY", message: "演示版仅供浏览与筛选。" } })); };
  if (!["GET", "HEAD"].includes(req.method)) return error(405);
  try {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (path.split("/").some((part) => part.startsWith(".")) || /^\/(api|r)(\/|$)/.test(path)) return error(404);
    const relative = path === "/" ? "/index.html" : path === "/design" || path === "/design/" ? "/design.html" : path;
    let file = await realpath(resolve(root, `.${relative}`));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile() || !types[extname(file)]) return error(404);
    if (file.endsWith(".png") && req.headers.accept?.includes("image/webp")) {
      try { await stat(`${file}.webp`); file += ".webp"; } catch { /* Original is a valid fallback. */ }
      res.setHeader("Vary", "Accept");
    }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)], "Content-Length": body.length, "Cache-Control": file.includes("/_next/") ? "public, max-age=86400" : "no-cache" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch { error(404); }
}).listen(3101, "127.0.0.1", () => console.log("Demo only: http://127.0.0.1:3101"));
