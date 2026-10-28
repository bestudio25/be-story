"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, STATUS, TYPES, fmtDate } from "../api";
import type { Detail, Ctx } from "./types";
import Dados from "./Dados";
import Carta from "./Carta";
import Arquivos from "./Arquivos";
import Capas from "./Capas";
import Publicar from "./Publicar";
import Metricas from "./Metricas";

const TABS = [
  { k: "dados", l: "1 · Dados" }, { k: "carta", l: "2 · Carta" }, { k: "arquivos", l: "3 · Arquivos" },
  { k: "capas", l: "4 · Capas" }, { k: "publicar", l: "5 · Publicar" }, { k: "metricas", l: "Métricas" },
] as const;

export default function EventEditor({ id }: { id: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<string>(sp.get("passo") || "arquivos");
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(sp.get("erro") || "");
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => { try { setD(await api<Detail>(`/api/admin/events/${id}`)); } catch (e) { setErr((e as Error).message); } }, [id]);
  useEffect(() => { reload(); }, [reload]);
  // enquanto houver arquivos na fila, atualiza a cada 8s
  const pending = d ? (d.processing.pendente ?? 0) + (d.processing.processando ?? 0) : 0;
  useEffect(() => { if (!pending) return; const t = setInterval(reload, 8000); return () => clearInterval(t); }, [pending, reload]);

  const toast = (m: string) => { setMsg(m); if (tRef.current) clearTimeout(tRef.current); tRef.current = setTimeout(() => setMsg(""), 2800); };
  const patchEvent = async (b: Record<string, unknown>) => { await api(`/api/admin/events/${id}`, { method: "PATCH", body: b }); await reload(); toast("Salvo"); };
  const go = (k: string) => { setTab(k); router.replace(`/admin/e/${id}?passo=${k}`, { scroll: false }); };

  if (!d) return <p className="text-white/50">{err || "Carregando…"}</p>;
  const ctx: Ctx = { d, reload, patchEvent, toast };
  // arquivos de capítulos escondidos ou de brutos (ficam no Drive) não entram na contagem
  const hiddenCh = new Set(d.chapters.filter((c) => c.is_internal || c.is_raw).map((c) => c.id));
  for (let grew = true; grew; ) { grew = false; for (const c of d.chapters) if (c.parent_id && hiddenCh.has(c.parent_id) && !hiddenCh.has(c.id)) { hiddenCh.add(c.id); grew = true; } }
  const counted = d.files.filter((f) => !f.is_reels && !(f.chapter_id && hiddenCh.has(f.chapter_id)));
  const total = counted.length;
  const ready = counted.filter((f) => f.processing === "pronto").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <a href="/admin" className="text-xs text-white/50 hover:text-cream">← Eventos</a>
          <h1 className="mt-2 font-serif text-3xl">{d.event.client_names}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/60">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS[d.event.status]?.cls}`}>{STATUS[d.event.status]?.label}</span>
            <span>{TYPES[d.event.event_type]} · {fmtDate(d.event.event_date)}</span>
            <span className="text-white/40">/{d.event.slug}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <a className="btn-ghost" href={`/${d.event.slug}?preview=1`} target="_blank">Pré-visualizar como cliente</a>
          {d.event.status !== "ativo" && <button className="btn-cream" onClick={() => go("publicar")}>Publicar</button>}
        </div>
      </div>
      {total > 0 && ready < total && (
        <div className="card flex items-center gap-4 p-4 text-sm">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-sand transition-all" style={{ width: `${(ready / total) * 100}%` }} /></div>
          <span className="text-white/70">{ready} de {total} arquivos prontos{d.processing.erro ? ` · ${d.processing.erro} com erro` : ""}</span>
        </div>
      )}
      {err && <div className="card border-red-400/30 p-4 text-sm text-red-200">{err} <button className="ml-2 underline" onClick={() => setErr("")}>ok</button></div>}
      <nav className="flex gap-1 overflow-x-auto border-b border-white/10">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => go(t.k)} className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition ${tab === t.k ? "border-sand text-cream" : "border-transparent text-white/50 hover:text-cream"}`}>{t.l}</button>
        ))}
      </nav>
      {tab === "dados" && <Dados {...ctx} />}
      {tab === "carta" && <Carta {...ctx} />}
      {tab === "arquivos" && <Arquivos {...ctx} onError={setErr} />}
      {tab === "capas" && <Capas {...ctx} />}
      {tab === "publicar" && <Publicar {...ctx} />}
      {tab === "metricas" && <Metricas {...ctx} />}
      {msg && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-cream px-5 py-2.5 text-sm font-medium text-[#20150c] shadow-xl">{msg}</div>}
    </div>
  );
}
