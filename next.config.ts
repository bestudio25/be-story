import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Versão dos arquivos da página do casal muda a cada publicação, para o navegador nunca misturar JS/CSS antigo com HTML novo
  env: { NEXT_PUBLIC_ASSET_VERSION: process.env.NEXT_PUBLIC_ASSET_VERSION || (process.env.COMMIT_REF || "").slice(0, 8) || String(Date.now()) },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: process.env.MEDIA_PUBLIC_HOST || "media.bestudiomkt.com.br" },
    ],
  },
  async headers() {
    return [
      {
        // Páginas de evento e admin nunca são indexadas
        source: "/(e|admin|api)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
