"use client";
import { useState } from "react";
import { api } from "./api";

export default function LoginForm({ setupToken }: { setupToken: string | null }) {
  const setup = setupToken !== null;
  const [f, setF] = useState({ name: "", email: "", password: "", password2: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (setup && f.password !== f.password2) return setErr("As senhas não conferem");
    setBusy(true);
    try {
      await api(setup ? "/api/admin/setup" : "/api/admin/login", { body: setup ? { token: setupToken, ...f } : { email: f.email, password: f.password } });
      window.location.href = "/admin";
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="relative w-full max-w-sm space-y-5 text-center">
      <img src="/brand/be-logo-cream.png" alt="BE Studio" className="mx-auto w-14" />
      <div>
        <div className="eyebrow">BE Story · Painel</div>
        <h1 className="mt-2 font-serif text-2xl italic">{setup ? "Criar acesso da BE Studio" : "Entrar"}</h1>
        {setup && !setupToken && <p className="mt-2 text-sm text-amber-300">Use o link de configuração com o código de acesso.</p>}
      </div>
      <div className="space-y-3 text-left">
        {setup && <div><label className="label">Seu nome</label><input className="field" value={f.name} onChange={set("name")} autoComplete="name" /></div>}
        <div><label className="label">E-mail</label><input className="field" type="email" required value={f.email} onChange={set("email")} autoComplete="email" /></div>
        <div><label className="label">Senha</label><input className="field" type="password" required value={f.password} onChange={set("password")} autoComplete={setup ? "new-password" : "current-password"} minLength={setup ? 10 : undefined} /></div>
        {setup && <div><label className="label">Repita a senha</label><input className="field" type="password" required value={f.password2} onChange={set("password2")} autoComplete="new-password" /></div>}
      </div>
      {err && <p className="text-sm text-red-300" role="alert">{err}</p>}
      <button className="btn-cream w-full" disabled={busy}>{busy ? "Aguarde…" : setup ? "Criar acesso" : "Entrar"}</button>
    </form>
  );
}
