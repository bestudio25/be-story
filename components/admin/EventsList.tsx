"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fmtBytes, fmtDate, STATUS, TYPES } from "./api";

type Ev = { id: string; slug: string; title: string; client_names: string; event_type: string; event_date: string; status: string; expires_at: string | null;
  storage_bytes: number; files: number; ready: number; errors: number; visitors: number; opens: number; cover?: string; has_password: boolean };

export default function EventsList() {
  const [data, setData] = useState<{ events: Ev[]; storageBytes: number } | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { api("/api/admin/events").then(setData).catch(() => {}); }, []);
  const list = (data?.events ?? []).filter((e) => !q || `${e.client_names} ${e.title} ${e.slug}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Memórias entregues</div>
          <h1 className="mt-2 font-serif text-3xl italic">Eventos</h1>
        </div>
        <div className="flex items-center gap-3">
          <input className="field w-56" placeholder="Buscar evento…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Link href="/admin/novo" className="btn-cream">+ Novo evento</Link>
        </div>
      </div>
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Eventos", data.events.length],
            ["Publicados", data.events.filter((e) => e.status === "ativo").length],
            ["Visitantes", data.events.reduce((s, e) => s + e.visitors, 0)],
            ["Armazenamento", fmtBytes(data.storageBytes)],
          ].map(([l, v]) => (
            <div key={l as string} className="card p-4"><div className="text-xs text-white/50">{l}</div><div className="mt-1 font-serif text-2xl">{v}</div></div>
          ))}
        </div>
      )}
      {!data && <p className="text-white/50">Carregando…</p>}
      {data && !list.length && (
        <div className="card p-10 text-center text-white/60">
          <p className="font-serif text-xl italic text-cream">Nenhum evento ainda</p>
          <p className="mt-2 text-sm">Crie o primeiro com o link da pasta do Drive.</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((e) => (
          <Link key={e.id} href={`/admin/e/${e.id}`} className="card group overflow-hidden transition hover:border-white/25">
            <div className="relative aspect-[16/10] bg-panel-2">
              {e.cover && <img src={e.cover} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS[e.status]?.cls}`}>{STATUS[e.status]?.label}</span>
              {e.has_password && <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px]">🔒 palavra-chave</span>}
              <div className="absolute bottom-3 left-4 right-4">
                <div className="font-serif text-xl">{e.client_names}</div>
                <div className="text-xs text-white/70">{TYPES[e.event_type]} · {fmtDate(e.event_date)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs text-white/60">
              <span>{e.ready}/{e.files} prontos{e.errors ? <b className="ml-1 text-red-300">· {e.errors} com erro</b> : null}</span>
              <span>{e.visitors} visitantes</span>
              <span>{fmtBytes(e.storage_bytes)}</span>
              <span className="text-white/40">/{e.slug}</span>
            </div>
            {e.files > 0 && e.ready < e.files && (
              <div className="h-1 bg-white/5"><div className="h-full bg-sand transition-all" style={{ width: `${(e.ready / e.files) * 100}%` }} /></div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
