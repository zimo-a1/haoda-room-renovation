import { readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";

// Transport encoding only; originals and dimensions remain unchanged.
async function encode(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, file.name);
    if (file.isDirectory()) await encode(path);
    else if (file.name.endsWith(".png")) await sharp(path).webp({ quality: 82 }).toFile(`${path}.webp`);
  }
}
await encode(resolve(import.meta.dirname, "../.demo-build/images"));
console.log("Demo WebP transport variants ready; original images preserved.");
