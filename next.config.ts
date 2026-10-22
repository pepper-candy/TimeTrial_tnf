import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // onnxruntime-web is browser-only (Finish Cam Analyse); keep it out of the server bundle.
  serverExternalPackages: ["onnxruntime-web"],
};

export default nextConfig;
