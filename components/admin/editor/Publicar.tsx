"use client";
import { useState } from "react";
import { api } from "../api";
import type { Ctx } from "./types";

const THEMES = [
  { k: "classico-escuro", l: "Clássico escuro", bg: "#0b0b0b", fg: "#faf8f4" },
  { k: "editorial-claro", l: "Editorial claro", bg: "#f4efe6", fg: "#1f1914" },
  { k: "sepia", l: "Sépia", bg: "#2a1f17", fg: "#f3e6d3" },
  { k: "minimal", l: "Minimal", bg: "#ffffff", fg: "#111111" },
];
const ACCENTS = ["#c9a77c", "#b8826a", "#a7b39a", "#9fb3c8", "#c99aa8", "#d8c3a5"];

export default function Publicar({ d, patchEvent, toast }: Ctx) {
  const e = d.event;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/${e.slug}`;
  const [slug, setSlug] = useState<string>(e.slug);
  const [pw, setPw] = useState("");
  const [exp, setExp] = useState<string>(e.expires_at ? new Date(e.expires_at).toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" }) : "");
  const [phone, setPhone] = useState("");
  const ready = d.files.filter((f) => f.processing === "pronto" && !f.is_reels).length;
  const waText = `Oi, ${e.client_names}! 🤎\nO site de memórias de vocês está pronto: ${link}${pw ? `\nPalavra-chave: ${pw}` : ""}\n\nPara guardar, lembrar e reviver. Com carinho, BE Studio`;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <div className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div><div className="font-medium">Status</div><div className="text-xs text-white/50">{e.status === "ativo" ? "O cliente já pode abrir o link." : "Só você vê, pela pré-visualização."}</div></div>
            {e.status === "ativo"
              ? <button className="btn-ghost" onClick={() => patchEvent({ status: "rascunho" })}>Voltar para rascunho</button>
              : <button className="btn-cream" disabled={!ready} onClick={() => patchEvent({ status: "ativo" })}>{e.status === "arquivado" || e.status === "expirado" ? "Reativar e publicar" : "Publicar agora"}</button>}
          </div>
          {!ready && <p className="text-xs text-amber-300">Aguarde pelo menos alguns arquivos ficarem prontos para publicar.</p>}
        </div>

        <div className="card space-y-4 p-5">
          <div><label className="label">Endereço</label>
            <div className="flex gap-2"><div className="flex flex-1 items-center rounded-xl border border-white/10 bg-ink px-3 text-sm"><span className="text-white/40">{origin.replace(/^https?:\/\//, "")}/</span>
              <input className="w-full bg-transparent py-2.5 outline-none" value={slug} onChange={(ev) => setSlug(ev.target.value)} /></div>
              {slug !== e.slug && <button className="btn-cream" onClick={() => patchEvent({ slug })}>Salvar</button>}</div></div>
          <div><label className="label">Palavra-chave {e.has_password ? "(ativa)" : "(opcional)"}</label>
            <div className="flex gap-2"><input className="field" value={pw} onChange={(ev) => setPw(ev.target.value)} placeholder={e.has_password ? "Digite para trocar" : "ex.: amor"} />
              <button className="btn-ghost" disabled={!pw} onClick={async () => { await patchEvent({ password: pw }); }}>Definir</button>
              {e.has_password && <button className="btn-ghost" onClick={() => patchEvent({ password: "" })}>Remover</button>}</div>
            <p className="mt-1 text-xs text-white/50">Pedida antes da Polaroid, com o texto “Digite a palavra-chave da sua história”. Não diferencia maiúsculas nem acentos.</p></div>
          <div><label className="label">Expira em</label>
            <div className="flex gap-2"><input className="field" type="date" value={exp} onChange={(ev) => setExp(ev.target.value)} />
              <button className="btn-ghost" onClick={() => patchEvent({ expires_at: exp ? new Date(exp + "T23:59:59-03:00").toISOString() : null })}>Salvar</button></div>
            <p className="mt-1 text-xs text-white/50">Ao expirar, as versões web saem do armazenamento e os originais continuam no Drive. Dá para reativar depois.</p></div>
        </div>

        <div className="card space-y-4 p-5">
          <div className="label">Tema visual</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {THEMES.map((t) => (
              <button key={t.k} onClick={() => patchEvent({ theme: t.k })} className={`rounded-xl border p-3 text-left text-xs ${e.theme === t.k ? "border-sand" : "border-white/10"}`}>
                <div className="mb-2 flex h-12 items-end rounded-lg p-2 font-serif text-sm" style={{ background: t.bg, color: t.fg }}>Aa <span className="ml-1 h-1.5 w-6 rounded-full" style={{ background: e.accent_color }} /></div>{t.l}
              </button>
            ))}
          </div>
          <div className="label">Cor de destaque</div>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((c) => <button key={c} onClick={() => patchEvent({ accent_color: c })} className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-[#151311] ${e.accent_color === c ? "ring-cream" : "ring-transparent"}`} style={{ background: c }} aria-label={c} />)}
            <input type="color" value={e.accent_color} onChange={(ev) => patchEvent({ accent_color: ev.target.value })} className="h-8 w-10 cursor-pointer rounded bg-transparent" />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card space-y-4 p-5">
          <div className="label">Link do cliente</div>
          <div className="flex gap-2"><input className="field" readOnly value={link} onFocus={(ev) => ev.target.select()} />
            <button className="btn-cream" onClick={async () => { await navigator.clipboard.writeText(link); toast("Link copiado"); }}>Copiar</button></div>
          <div className="flex flex-wrap gap-2">
            <a className="btn-ghost" href={`/${e.slug}?preview=1`} target="_blank">Pré-visualizar</a>
            <a className="btn-ghost" href={`/api/admin/qr?text=${encodeURIComponent(link)}`} target="_blank">QR Code</a>
            <a className="btn-ghost" href={`/api/og/${e.slug}`} target="_blank">Imagem do WhatsApp</a>
          </div>
          <img src={`/api/admin/qr?text=${encodeURIComponent(link)}`} alt="QR Code" className="w-40 rounded-lg" />
        </div>
        <div className="card space-y-3 p-5">
          <div className="label">Enviar por WhatsApp</div>
          <input className="field" placeholder="WhatsApp do cliente (com DDD)" value={phone} onChange={(ev) => setPhone(ev.target.value)} />
          <textarea className="field min-h-32 text-sm" readOnly value={waText} />
          {e.has_password && !pw && <p className="text-xs text-amber-300">Digite a palavra-chave no campo ao lado para ela ir junto na mensagem.</p>}
          <a className="btn-cream" target="_blank" href={`https://wa.me/${phone.replace(/\D/g, "").replace(/^(?!55)/, "55")}?text=${encodeURIComponent(waText)}`}>Abrir no WhatsApp</a>
        </div>
        <div className="card flex flex-wrap gap-2 p-5">
          <button className="btn-ghost" onClick={async () => { if (confirm("Arquivar? As versões web saem do armazenamento (os originais ficam no Drive) e o link mostra que expirou.")) { await api(`/api/admin/events/${e.id}/archive`, { body: {} }); location.reload(); } }}>Arquivar e liberar espaço</button>
          <button className="btn-danger" onClick={async () => { if (prompt(`Para excluir de vez, digite: ${e.slug}`) === e.slug) { await api(`/api/admin/events/${e.id}`, { method: "DELETE" }); location.href = "/admin"; } }}>Excluir evento</button>
        </div>
      </div>
    </div>
  );
}
