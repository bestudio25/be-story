"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

export default function Account() {
  const [email, setEmail] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ email: string }>("/api/admin/account").then((r) => setEmail(r.email)).catch(() => {}); }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setMsg("");
    if (p1 && p1 !== p2) return setErr("As senhas não conferem");
    setBusy(true);
    try {
      await api("/api/admin/account", { body: { email, ...(p1 ? { password: p1 } : {}) } });
      setMsg(p1 ? "Pronto! Use este e-mail e a nova senha para entrar." : "E-mail atualizado.");
      setP1(""); setP2("");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="mx-auto max-w-md space-y-6">
      <div>
        <div className="eyebrow">Minha conta</div>
        <h1 className="mt-2 font-serif text-3xl italic">Acesso ao painel</h1>
        <p className="mt-2 text-sm text-white/60">É com este e-mail e senha que você entra no painel em qualquer aparelho.</p>
      </div>
      <div className="card space-y-4 p-6">
        <div><label className="label">E-mail de acesso</label><input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
        <div><label className="label">Nova senha (mín. 10 caracteres)</label><input className="field" type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" minLength={10} /></div>
        <div><label className="label">Repita a nova senha</label><input className="field" type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></div>
      </div>
      {err && <p className="text-sm text-red-300" role="alert">{err}</p>}
      {msg && <p className="text-sm text-emerald-300" role="status">{msg}</p>}
      <button className="btn-cream w-full" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
    </form>
  );
}
