import fs from "node:fs";
import path from "node:path";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let markup: string | null = null;
export function storyMarkup() {
  if (!markup || process.env.NODE_ENV !== "production") markup = fs.readFileSync(path.join(process.cwd(), "story", "markup.html"), "utf8");
  return markup;
}

const ASSET_V = process.env.NEXT_PUBLIC_ASSET_VERSION || "1";

export function page(opts: { title: string; description?: string; ogImage?: string; url?: string; body: string; bodyClass?: string; head?: string; theme?: string }) {
  const d = opts.description ?? "BE STORY · Memórias, por BE Studio Audiovisual";
  return `<!doctype html>
<html lang="pt-BR"${opts.theme ? ` data-theme="${esc(opts.theme)}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="theme-color" content="#0f0d0b">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(d)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(d)}">
${opts.ogImage ? `<meta property="og:image" content="${esc(opts.ogImage)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : ""}
${opts.url ? `<meta property="og:url" content="${esc(opts.url)}">` : ""}
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/gentlemens-script.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/story/fonts.css?v=${ASSET_V}">
<link rel="stylesheet" href="/story/story.css?v=${ASSET_V}">
${opts.head ?? ""}
</head>
<body class="${opts.bodyClass ?? ""}">
${opts.body}
</body>
</html>`;
}

export const htmlResponse = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });

/** JSON seguro dentro de <script type="application/json"> */
export const safeJson = (v: unknown) =>
  JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
