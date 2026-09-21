import { cp, mkdtemp, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const source = resolve(import.meta.dirname, "..");
const stage = await mkdtemp(join(tmpdir(), "haoda-demo-"));
// Explicit source allowlist: never copy .env, backend data, task routes or dev builds.
for (const entry of ["app", "components", "features", "lib", "public", "package.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", "postcss.config.mjs"]) {
  await cp(join(source, entry), join(stage, entry), { recursive: true, filter: (path) => path !== join(source, "app/r") });
}
await symlink(join(source, "node_modules"), join(stage, "node_modules"));
const result = spawnSync(process.execPath, [join(source, "node_modules/next/dist/bin/next"), "build", "--webpack"], {
  cwd: stage, stdio: "inherit", env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "production", DEMO_EXPORT: "1", NEXT_TELEMETRY_DISABLED: "1" },
});
if (result.status !== 0) process.exit(result.status ?? 1);
await cp(join(stage, "out"), join(source, ".demo-build"), { recursive: true });
await import("./optimize-demo.mjs");
console.log("Demo exported to .demo-build (static files only). Staging:", stage);
