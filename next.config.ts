import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // onnxruntime-web is browser-only (Finish Cam Analyse); keep it out of the server bundle.
  serverExternalPackages: ["onnxruntime-web"],
  // Next 16 defaults to Turbopack — do not add a webpack-only Buffer polyfill here.
  // `lib/client/webm-seekable.ts` imports `buffer` and assigns globalThis.Buffer for ts-ebml.
};

export default nextConfig;
