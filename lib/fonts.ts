/**
 * Fontes que a BE pode escolher para a página do casal.
 * Três papéis: títulos (serifada, usada em itálico), texto (corpo, botões, data da Polaroid) e manuscrita (nomes na Polaroid, "Com carinho,").
 * Além do catálogo, a BE pode enviar fontes próprias no painel (ficam no R2 e aparecem para todos os eventos).
 */
export type FontRole = "titulo" | "texto" | "manuscrita";
type Face = { w: number; s: "normal" | "italic"; file: string };
export type CatalogFont = { id: string; family: string; role: FontRole; label: string; fallback: string; faces: Face[]; brand?: boolean };

const f = (file: string, w = 400, s: Face["s"] = "normal"): Face => ({ w, s, file: `/fonts/${file}` });

export const CATALOG: CatalogFont[] = [
  // Títulos
  { id: "libre-baskerville", family: "Libre Baskerville", role: "titulo", label: "Libre Baskerville (padrão)", fallback: "Georgia, serif",
    faces: [f("libre-baskerville-latin-400-normal.woff2"), f("libre-baskerville-latin-400-italic.woff2", 400, "italic")] },
  { id: "playfair-display", family: "Playfair Display", role: "titulo", label: "Playfair Display", fallback: "Georgia, serif", brand: true,
    faces: [f("playfair-display-latin-400-normal.woff2"), f("playfair-display-latin-400-italic.woff2", 400, "italic"), f("playfair-display-latin-600-normal.woff2", 600), f("playfair-display-latin-600-italic.woff2", 600, "italic")] },
  { id: "cormorant-garamond", family: "Cormorant Garamond", role: "titulo", label: "Cormorant Garamond", fallback: "Georgia, serif",
    faces: [f("cormorant-garamond-latin-400-normal.woff2"), f("cormorant-garamond-latin-400-italic.woff2", 400, "italic"), f("cormorant-garamond-latin-600-normal.woff2", 600), f("cormorant-garamond-latin-600-italic.woff2", 600, "italic")] },
  { id: "montserrat-titulo", family: "Montserrat", role: "titulo", label: "Montserrat", fallback: "system-ui, sans-serif", brand: true,
    faces: [f("montserrat-latin-400-normal.woff2"), f("montserrat-latin-400-italic.woff2", 400, "italic"), f("montserrat-latin-500-normal.woff2", 500)] },
  // Texto
  { id: "poppins", family: "Poppins", role: "texto", label: "Poppins (padrão)", fallback: "system-ui, sans-serif",
    faces: [300, 400, 500, 600].map((w) => f(`poppins-latin-${w}-normal.woff2`, w)) },
  { id: "montserrat", family: "Montserrat", role: "texto", label: "Montserrat", fallback: "system-ui, sans-serif", brand: true,
    faces: [300, 400, 500, 600].map((w) => f(`montserrat-latin-${w}-normal.woff2`, w)) },
  { id: "lato", family: "Lato", role: "texto", label: "Lato", fallback: "system-ui, sans-serif",
    faces: [f("lato-latin-300-normal.woff2", 300), f("lato-latin-400-normal.woff2", 400), f("lato-latin-700-normal.woff2", 600)] },
  // Manuscrita
  { id: "gentlemens-script", family: "Gentlemens Script", role: "manuscrita", label: "Gentlemens Script (padrão)", fallback: "cursive",
    faces: [f("gentlemens-script.woff2")] },
  { id: "allura", family: "Allura", role: "manuscrita", label: "Allura", fallback: "cursive", faces: [f("allura-latin-400-normal.woff2")] },
  { id: "great-vibes", family: "Great Vibes", role: "manuscrita", label: "Great Vibes", fallback: "cursive", faces: [f("great-vibes-latin-400-normal.woff2")] },
  { id: "parisienne", family: "Parisienne", role: "manuscrita", label: "Parisienne", fallback: "cursive", faces: [f("parisienne-latin-400-normal.woff2")] },
  { id: "pinyon-script", family: "Pinyon Script", role: "manuscrita", label: "Pinyon Script", fallback: "cursive", faces: [f("pinyon-script-latin-400-normal.woff2")] },
];

export const DEFAULT_FONTS: Record<FontRole, string> = { titulo: "libre-baskerville", texto: "poppins", manuscrita: "gentlemens-script" };
const VAR: Record<FontRole, string> = { titulo: "--serif", texto: "--sans", manuscrita: "--script" };
const FALLBACK: Record<FontRole, string> = { titulo: "Georgia, serif", texto: "system-ui, sans-serif", manuscrita: "cursive" };

export type CustomFont = { id: string; name: string; url: string; format: string };
export type EventFonts = Partial<Record<FontRole, string>>;

const fmt = (format: string) => ({ woff2: "woff2", woff: "woff", otf: "opentype", ttf: "truetype" } as Record<string, string>)[format] ?? "woff2";
const q = (s: string) => `'${s.replace(/['\\]/g, "")}'`;

/** CSS para a página do casal: @font-face só das fontes escolhidas (fora do padrão) e as variáveis --serif/--sans/--script. */
export function fontCss(chosen: EventFonts | null | undefined, custom: CustomFont[]) {
  const out: string[] = [];
  const vars: string[] = [];
  for (const role of ["titulo", "texto", "manuscrita"] as FontRole[]) {
    const id = chosen?.[role];
    if (!id || id === DEFAULT_FONTS[role]) continue;
    if (id.startsWith("custom:")) {
      const c = custom.find((x) => `custom:${x.id}` === id);
      if (!c) continue;
      const fam = `BE ${c.name}`;
      out.push(`@font-face{font-family:${q(fam)};font-style:normal;font-weight:100 900;font-display:${role === "manuscrita" ? "block" : "swap"};src:url("${c.url}") format('${fmt(c.format)}')}`);
      if (role === "titulo") out.push(`@font-face{font-family:${q(fam)};font-style:italic;font-weight:100 900;font-display:swap;src:url("${c.url}") format('${fmt(c.format)}')}`);
      vars.push(`${VAR[role]}:${q(fam)},${FALLBACK[role]}`);
      continue;
    }
    const cat = CATALOG.find((x) => x.id === id && x.role === role);
    if (!cat) continue;
    for (const face of cat.faces) out.push(`@font-face{font-family:${q(cat.family)};font-style:${face.s};font-weight:${face.w};font-display:${role === "manuscrita" ? "block" : "swap"};src:url(${face.file}) format('woff2')}`);
    vars.push(`${VAR[role]}:${q(cat.family)},${cat.fallback}`);
  }
  if (vars.length) out.push(`:root{${vars.join(";")}}`);
  return out.join("\n");
}
