"use client";
import { useEffect, useState } from "react";
import { api, fmtBytes } from "../api";
import type { Ctx } from "./types";

type M = { totals: Record<string, { n: number; u: number; v: number }>; top: { id: string; display_name: string; kind: string; views: number; downloads: number }[]; days: { d: string; u: number }[]; referrals: { links: number; clicks: number }; favorites: number };

export default function Metricas({ d, toast, reload }: Ctx) {
  const [m, setM] = useState<M | null>(null);
  useEffect(() => { api<M>(`/api/admin/events/${d.event.id}/metrics`).then(setM).catch(() => {}); }, [d.event.id]);
  const t = (k: string) => m?.totals[k] ?? { n: 0, u: 0, v: 0 };
  const max = Math.max(1, ...(m?.days ?? []).map((x) => x.u));
  const cards: [string, string | number, string?][] = [
    ["Aberturas", t("open").n, `${t("open").u} pessoas`], ["Revelaram a Polaroid", t("reveal").u],
    ["Visualizações", t("view").n], ["Tempo assistido", `${Math.round(t("watch").v / 60)} min`], ["Assistiram ao filme", t("film").n],
    ["Downloads", t("download").n, fmtBytes(t("download").v)], ["ZIPs pedidos", t("zip").n],
    ["Compartilhamentos", t("share").n], ["Favoritos", m?.favorites ?? 0],
    ["Indicações geradas", m?.referrals.links ?? 0, `${m?.referrals.clicks ?? 0} cliques`],
    ["Brutos baixados", t("raw_download").n, t("raw_folder").n ? `${t("raw_folder").n} abriram a pasta` : undefined],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map(([l, v, s]) => <div key={l} className="card p-4"><div className="text-xs text-white/50">{l}</div><div className="mt-1 font-serif text-2xl">{v}</div>{s && <div className="text-xs text-white/40">{s}</div>}</div>)}
      </div>
      {!!m?.days.length && (
        <div className="card p-5">
          <div className="label">Visitantes por dia (30 dias)</div>
          <div className="mt-4 flex h-32 items-end gap-1">
            {m.days.map((x) => <div key={x.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${x.d}: ${x.u}`}><div className="w-full max-w-10 rounded-t bg-sand/80" style={{ height: `${Math.max(4, (x.u / max) * 100)}%` }} /><span className="text-[9px] text-white/40">{x.d.slice(0, 2)}</span></div>)}
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="label">Arquivos mais vistos</div>
          <ol className="mt-3 space-y-2 text-sm">
            {(m?.top ?? []).map((f, i) => <li key={f.id} className="flex justify-between gap-3"><span className="truncate">{i + 1}. {f.display_name}</span><span className="shrink-0 text-white/50">{f.views} views · {f.downloads} downloads</span></li>)}
            {!m?.top.length && <li className="text-white/40">Ainda sem visualizações.</li>}
          </ol>
        </div>
        <div className="card p-5">
          <div className="label">Pedidos de ZIP</div>
          <ul className="mt-3 space-y-3 text-sm">
            {d.zips.map((z) => (
              <li key={z.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{z.label} · <span className="text-white/50">{z.status === "pronto" ? fmtBytes(z.size_bytes) : `${z.status} ${z.progress}%`}</span></span>
                {z.notify_phone && z.status === "pronto" && !z.notified_at && (
                  <a className="chip border-sand text-sand" target="_blank" onClick={async () => { await api(`/api/admin/zips/${z.id}`, { body: {} }); toast("Marcado como avisado"); reload(); }}
                    href={`https://wa.me/${z.notify_phone.replace(/^(?!55)/, "55")}?text=${encodeURIComponent(`Oi! 🤎 O download "${z.label}" de ${d.event.client_names} já está pronto. É só abrir ${location.origin}/${d.event.slug}, ir em "Baixar tudo" e tocar em "Baixar ZIP". Com carinho, BE Studio`)}`}>Avisar no WhatsApp</a>
                )}
                {z.notified_at && <span className="text-xs text-emerald-300">avisado</span>}
                {z.notify_email && !z.notified_at && <span className="text-xs text-white/40">e-mail: {z.notify_email}</span>}
              </li>
            ))}
            {!d.zips.length && <li className="text-white/40">Nenhum pedido ainda.</li>}
          </ul>
        </div>
      </div>
      <div className="card p-5">
        <div className="label">Bilhetes de volta</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {d.notes.map((n) => (
            <div key={n.id} className="rounded-xl bg-[#f6f1e7] p-4 text-[#2b2420]">
              <div className="font-script text-2xl">{n.author_name}</div>
              <p className="mt-1 whitespace-pre-line text-sm">{n.body}</p>
              <div className="mt-2 text-xs text-[#7a685b]">{n.rating ? "★".repeat(n.rating) : ""} · {n.allow_public_use ? "pode publicar" : "uso interno"} · {new Date(n.created_at).toLocaleDateString("pt-BR")}</div>
            </div>
          ))}
          {!d.notes.length && <p className="text-sm text-white/40">Nenhum bilhete ainda.</p>}
        </div>
      </div>
    </div>
  );
}
