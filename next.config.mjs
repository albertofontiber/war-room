import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  // Activar con `ANALYZE=true npm run build`. Genera reportes HTML en
  // .next/analyze/{client,server}.html con los chunks visualizados por tamaño.
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse v2 depends on @napi-rs/canvas (native .node binary).
  // Without this, Next.js tries to webpack-bundle it → silent 500 in serverless.
  serverExternalPackages: ["pdf-parse"],
};

export default withBundleAnalyzer(nextConfig);
