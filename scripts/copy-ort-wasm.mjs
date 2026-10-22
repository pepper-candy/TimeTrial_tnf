/** Copy onnxruntime-web WASM assets into public/ort for Finish Cam Analyse. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "..", "node_modules", "onnxruntime-web", "dist");
const out = path.join(root, "..", "public", "ort");

const files = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
];

if (!fs.existsSync(dist)) {
  console.warn("copy-ort-wasm: onnxruntime-web not installed — skip");
  process.exit(0);
}

fs.mkdirSync(out, { recursive: true });
for (const name of files) {
  const src = path.join(dist, name);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(out, name));
}
console.log("copy-ort-wasm: synced public/ort");
