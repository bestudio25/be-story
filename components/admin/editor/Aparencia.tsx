"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Ctx } from "./types";
import { CATALOG, DEFAULT_FONTS, type FontRole } from "@/lib/fonts";

/** Paleta oficial da BE Studio: fundos e cores de destaque permitidos na página do casal. */
const THEMES = [
  { k: "classico-escuro", l: "Preto BE", bg: "#0b0b0b", fg: "#faf8f4" },
  { k: "sepia", l: "Marrom BE", bg: "#20150c", fg: "#faf4ea" },
  { k: "editorial-claro", l: "Bege BE", bg: "#f3ede3", fg: "#20150c" },
  { k: "creme", l: "Creme BE", bg: "#faf4ea", fg: "#4c2a22" },
  { k: "minimal", l: "Branco", bg: "#ffffff", fg: "#111111" },
];
const ACCENTS = [
  { c: "#c9a77c", l: "Bege dourado" }, { c: "#b98a5e", l: "Dourado BE" }, { c: "#eee0d4", l: "Bege claro" },
  { c: "#4c2a22", l: "Marrom BE" }, { c: "#20150c", l: "Marrom escuro" }, { c: "#111111", l: "Preto" },
];
const ROLES: { k: FontRole; l: string; s: string }[] = [
  { k: "manuscrita", l: "Manuscrita", s: "Nomes na Polaroid e “Com carinho,”" },
  { k: "titulo", l: "Títulos", s: "Títulos das seções, em itálico" },
  { k: "texto", l: "Texto", s: "Textos, botões e a data da Polaroid" },
];
type Custom = { id: string; name: string; format: string; url: string };
const FMT: Record<string, string> = { woff2: "woff2", woff: "woff", otf: "opentype", ttf: "truetype" };

export default function Aparencia({ d, patchEvent, toast }: Ctx) {
  const e = d.event;
  const [custom, setCustom] = useState<Custom[]>([]);
  const [busy, setBusy] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const fonts: Record<FontRole, string> = { ...DEFAULT_FONTS, ...(e.fonts ?? {}) };
  const loadCustom = () => api<{ fonts: Custom[] }>("/api/admin/fonts").then((r) => setCustom(r.fonts)).catch(() => {});
  useEffect(() => { loadCustom(); }, []);

  // @font-face de todas as opções, só para a pré-visualização no painel
  const faceCss = useMemo(() => [
    ...CATALOG.flatMap((f) => f.faces.map((x) => `@font-face{font-family:'pv-${f.id}';font-style:${x.s};font-weight:${x.w};src:url(${x.file}) format('woff2')}`)),
    ...custom.map((c) => `@font-face{font-family:'pv-custom-${c.id}';src:url("${c.url}") format('${FMT[c.format] ?? "woff2"}')}`),
  ].join("\n"), [custom]);
  const fam = (id: string) => (id.startsWith("custom:") ? `'pv-custom-${id.slice(7)}'` : `'pv-${id}'`);

  const setFont = (role: FontRole, id: string) => patchEvent({ fonts: { ...fonts, [role]: id } });
  const upload = async (file: File) => {
    try {
      setBusy("Enviando fonte…");
      const { key, url, contentType } = await api<{ key: string; url: string; contentType: string }>("/api/admin/fonts", { body: { fileName: file.name, size: file.size } });
      const r = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      if (!r.ok) throw new Error("Falha no envio (" + r.status + ")");
      await api("/api/admin/fonts", { method: "PUT", body: { key, name: file.name } });
      await loadCustom(); toast("Fonte adicionada à biblioteca da BE");
    } catch (err) { toast((err as Error).message); } finally { setBusy(""); if (input.current) input.current.value = ""; }
  };
  const theme = THEMES.find((t) => t.k === e.theme) ?? THEMES[0];

  return (
    <div className="card space-y-5 p-5">
      <style>{faceCss}</style>
      <div className="font-medium">Aparência da página</div>

      <div>
        <div className="label">Fundo</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {THEMES.map((t) => (
            <button key={t.k} onClick={() => patchEvent({ theme: t.k })} className={`rounded-xl border p-2 text-left text-xs ${e.theme === t.k ? "border-sand" : "border-white/10"}`}>
              <div className="mb-1.5 flex h-10 items-end rounded-lg p-2 text-sm" style={{ background: t.bg, color: t.fg, fontFamily: fam(fonts.titulo), fontStyle: "italic" }}>Aa<span className="ml-1 h-1.5 w-5 rounded-full" style={{ background: e.accent_color }} /></div>{t.l}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="label">Cor de destaque</div>
        <div className="flex flex-wrap items-center gap-3">
          {ACCENTS.map((a) => (
            <button key={a.c} title={a.l} onClick={() => patchEvent({ accent_color: a.c })} className="flex flex-col items-center gap-1 text-[10px] text-white/50">
              <span className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-[#151311] ${e.accent_color?.toLowerCase() === a.c ? "ring-cream" : "ring-transparent"}`} style={{ background: a.c, border: "1px solid rgba(255,255,255,.15)" }} />{a.l}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="label">Fontes</div>
        {ROLES.map((r) => {
          const options = [...CATALOG.filter((f) => f.role === r.k).map((f) => ({ id: f.id, label: f.label + (f.brand ? " · BE" : "") })), ...custom.map((c) => ({ id: `custom:${c.id}`, label: `${c.name} · enviada` }))];
          return (
            <div key={r.k} className="grid items-center gap-2 sm:grid-cols-[150px_1fr]">
              <div><div className="text-sm">{r.l}</div><div className="text-[11px] text-white/40">{r.s}</div></div>
              <select className="field" value={fonts[r.k]} onChange={(ev) => setFont(r.k, ev.target.value)}>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      {/* pré-visualização com fundo, cor e fontes escolhidos */}
      <div className="rounded-xl p-5" style={{ background: theme.bg, color: theme.fg }}>
        <div style={{ fontFamily: fam(fonts.manuscrita), fontSize: 38, lineHeight: 1.1 }}>{e.client_names}</div>
        <div style={{ fontFamily: fam(fonts.texto), fontSize: 11, letterSpacing: ".34em", opacity: .7, marginTop: 4 }}>10.10.26</div>
        <div style={{ fontFamily: fam(fonts.titulo), fontStyle: "italic", fontSize: 22, marginTop: 14 }}>Para guardar, lembrar e reviver.</div>
        <div style={{ fontFamily: fam(fonts.texto), fontSize: 13, opacity: .75, marginTop: 6 }}>Um dia especial merece um lugar para ser lembrado.</div>
        <div className="mt-3 flex items-center gap-2" style={{ fontFamily: fam(fonts.texto), fontSize: 12 }}>
          <span style={{ fontFamily: fam(fonts.manuscrita), fontSize: 22, color: e.accent_color }}>Com carinho,</span><span style={{ letterSpacing: ".2em" }}>BE STUDIO</span>
        </div>
      </div>

      <div className="space-y-2 border-t border-white/10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><div className="text-sm">Fontes da BE</div><div className="text-[11px] text-white/40">Envie uma fonte (.woff2, .otf, .ttf) e ela aparece nas opções acima, para todos os eventos.</div></div>
          <button className="btn-ghost" disabled={!!busy} onClick={() => input.current?.click()}>{busy || "Enviar fonte"}</button>
          <input ref={input} type="file" accept=".woff2,.woff,.otf,.ttf" hidden onChange={(ev) => { const f = ev.target.files?.[0]; if (f) upload(f); }} />
        </div>
        {custom.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
            <span style={{ fontFamily: `'pv-custom-${c.id}'`, fontSize: 20 }}>{c.name}</span>
            <button className="chip" onClick={async () => { if (!confirm(`Remover a fonte "${c.name}"? Os eventos que usam ela voltam para a fonte padrão.`)) return; await api(`/api/admin/fonts?id=${c.id}`, { method: "DELETE" }); await loadCustom(); toast("Fonte removida"); }}>Remover</button>
          </div>
        ))}
      </div>
    </div>
  );
}
