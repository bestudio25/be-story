"use client";
import { useMemo, useState } from "react";
import { api, TYPES } from "./api";

const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " e ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export default function NewEvent() {
  const [f, setF] = useState({ clientNames: "", eventType: "casamento", eventDate: "", location: "", slug: "", driveUrl: "", expiresInDays: 90 });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const slug = slugTouched ? f.slug : slugify(f.clientNames);
  const site = typeof window !== "undefined" ? window.location.origin : "";
  const valid = useMemo(() => f.clientNames.trim() && f.eventDate && slug, [f, slug]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: k === "expiresInDays" ? Number(e.target.value) : e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await api<{ id: string; syncError?: string }>("/api/admin/events", { body: { ...f, slug } });
      window.location.href = `/admin/e/${r.id}?passo=arquivos${r.syncError ? "&erro=" + encodeURIComponent(r.syncError) : ""}`;
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-8">
      <div>
        <div className="eyebrow">Novo evento · passo 1 de 5</div>
        <h1 className="mt-2 font-serif text-3xl italic">Dados do evento</h1>
        <p className="mt-2 text-sm text-white/60">Depois você escreve a carta, organiza os arquivos, escolhe as capas e publica.</p>
      </div>
      <div className="card space-y-5 p-6">
        <div><label className="label">Nomes dos clientes</label><input className="field" placeholder="Aline & Hélio" value={f.clientNames} onChange={set("clientNames")} required autoFocus /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Tipo de evento</label>
            <select className="field" value={f.eventType} onChange={set("eventType")}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="label">Data</label><input className="field" type="date" value={f.eventDate} onChange={set("eventDate")} required /></div>
        </div>
        <div><label className="label">Local (opcional)</label><input className="field" placeholder="Igreja, salão, cidade…" value={f.location} onChange={set("location")} /></div>
        <div>
          <label className="label">Endereço do site</label>
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-ink px-3.5 text-[15px]">
            <span className="text-white/40">{site.replace(/^https?:\/\//, "")}/</span>
            <input className="w-full bg-transparent py-2.5 outline-none" value={slug} onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: slugify(e.target.value) }); }} />
          </div>
        </div>
      </div>
      <div className="card space-y-5 p-6">
        <div>
          <label className="label">Link da pasta do Drive</label>
          <input className="field" placeholder="https://drive.google.com/drive/folders/…" value={f.driveUrl} onChange={set("driveUrl")} />
          <p className="mt-2 text-xs text-white/50">Cada subpasta vira um capítulo. O arquivo <b>Reels_…</b> na raiz vira o clipe pronto e o filme. Você também pode enviar arquivos direto depois.</p>
        </div>
        <div><label className="label">Validade do site</label>
          <select className="field" value={f.expiresInDays} onChange={set("expiresInDays")}>
            <option value={30}>30 dias após o evento</option><option value={60}>60 dias</option><option value={90}>90 dias (recomendado)</option>
            <option value={180}>6 meses</option><option value={365}>1 ano</option><option value={0}>Sem validade</option>
          </select></div>
      </div>
      {err && <p className="text-sm text-red-300" role="alert">{err}</p>}
      <div className="flex justify-end gap-3">
        <a href="/admin" className="btn-ghost">Cancelar</a>
        <button className="btn-cream" disabled={!valid || busy}>{busy ? "Lendo a pasta do Drive…" : f.driveUrl ? "Gerar site →" : "Criar evento →"}</button>
      </div>
    </form>
  );
}
