"use client";
export async function api<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && typeof window !== "undefined" && !url.includes("/login")) window.location.href = "/admin/login";
  if (!r.ok) throw new Error(j.error || "Algo deu errado");
  return j as T;
}
export const fmtBytes = (b?: number | null) =>
  !b ? "0 MB" : b >= 1e12 ? (b / 1e12).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " TB" : b >= 1e9 ? (b / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " GB" : Math.max(1, Math.round(b / 1e6)) + " MB";
export const fmtDate = (d?: string | null) => (d ? new Date(d.length === 10 ? d + "T12:00:00-03:00" : d).toLocaleDateString("pt-BR") : "—");
export const fmtDur = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
export const STATUS: Record<string, { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-white/10 text-white/70" },
  ativo: { label: "Publicado", cls: "bg-emerald-400/15 text-emerald-300" },
  expirado: { label: "Expirado", cls: "bg-amber-400/15 text-amber-300" },
  arquivado: { label: "Arquivado", cls: "bg-white/5 text-white/40" },
};
export const TYPES: Record<string, string> = {
  casamento: "Casamento", aniversario: "Aniversário", formatura: "Formatura", corporativo: "Evento corporativo",
  saude: "Evento de saúde", inauguracao: "Inauguração de clínica", outro: "Outro",
};
