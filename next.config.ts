import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // onnxruntime-web is browser-only (Finish Cam Analyse); keep it out of the server bundle.
  serverExternalPackages: ["onnxruntime-web"],
  webpack: (config, { webpack }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      buffer: require.resolve("buffer/"),
      fs: false,
      stream: false,
    };
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
      }),
    );
    return config;
  },
};

export default nextConfig;
