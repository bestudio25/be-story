"use client";
import { useState } from "react";
import { TYPES } from "../api";
import type { Ctx } from "./types";

export default function Dados({ d, patchEvent }: Ctx) {
  const e = d.event;
  const [f, setF] = useState({ client_names: e.client_names, title: e.title, event_type: e.event_type, event_date: e.event_date, location: e.location ?? "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: ev.target.value });
  return (
    <form className="card max-w-2xl space-y-5 p-6" onSubmit={async (ev) => { ev.preventDefault(); setBusy(true); try { await patchEvent(f); } finally { setBusy(false); } }}>
      <div><label className="label">Nomes dos clientes (aparecem escritos à mão na Polaroid)</label><input className="field" value={f.client_names} onChange={set("client_names")} required /></div>
      <div><label className="label">Título</label><input className="field" value={f.title} onChange={set("title")} required /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Tipo</label><select className="field" value={f.event_type} onChange={set("event_type")}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Data</label><input className="field" type="date" value={f.event_date} onChange={set("event_date")} required /></div>
      </div>
      <div><label className="label">Local</label><input className="field" value={f.location} onChange={set("location")} placeholder="Opcional" /></div>
      <div className="flex justify-end"><button className="btn-cream" disabled={busy}>Salvar</button></div>
    </form>
  );
}
