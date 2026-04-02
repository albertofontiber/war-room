/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse v2 depends on @napi-rs/canvas (native .node binary).
  // Without this, Next.js tries to webpack-bundle it → silent 500 in serverless.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "pdfjs-dist"],
};

export default nextConfig;
