"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fmtBytes, fmtDate, STATUS } from "./api";

export default function Storage() {
  const [d, setD] = useState<{ total: number; events: { id: string; client_names: string; status: string; event_date: string; expires_at: string | null; storage_bytes: number }[] } | null>(null);
  const load = () => api("/api/admin/storage").then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <p className="text-white/50">Carregando…</p>;
  const usd = Math.max(0, d.total / 1e9 - 10) * 0.015;
  return (
    <div className="space-y-6">
      <div><div className="eyebrow">Cloudflare R2</div><h1 className="mt-2 font-serif text-3xl italic">Armazenamento</h1></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs text-white/50">Total em uso</div><div className="font-serif text-2xl">{fmtBytes(d.total)}</div></div>
        <div className="card p-4"><div className="text-xs text-white/50">Estimativa mensal</div><div className="font-serif text-2xl">US$ {usd.toFixed(2)}</div><div className="text-xs text-white/40">10 GB grátis · US$ 0,015/GB acima disso</div></div>
        <div className="card p-4"><div className="text-xs text-white/50">Eventos com arquivos</div><div className="font-serif text-2xl">{d.events.filter((e) => e.storage_bytes > 0).length}</div></div>
      </div>
      <div className="card divide-y divide-white/5">
        {d.events.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-4 p-4 text-sm">
            <Link href={`/admin/e/${e.id}`} className="min-w-40 flex-1 hover:text-sand">{e.client_names}</Link>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS[e.status]?.cls}`}>{STATUS[e.status]?.label}</span>
            <span className="w-32 text-white/50">evento {fmtDate(e.event_date)}</span>
            <span className="w-32 text-white/50">expira {fmtDate(e.expires_at)}</span>
            <span className="w-24 text-right">{fmtBytes(e.storage_bytes)}</span>
            {e.storage_bytes > 0 && e.status !== "ativo" && (
              <button className="chip" onClick={async () => { if (confirm("Liberar o espaço deste evento? Os originais continuam no Drive.")) { await api(`/api/admin/events/${e.id}/archive`, { body: {} }); load(); } }}>Arquivar</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
