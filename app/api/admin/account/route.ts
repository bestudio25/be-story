import { handle, json, body } from "@/lib/api";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { sql } from "@/lib/db";

/** Conta da BE logada: ver e-mail, trocar e-mail e/ou senha (sem precisar da senha antiga, pois já está logada). */
export const GET = handle(async () => {
  const a = await requireAdmin();
  const [r] = await sql()`select email, name from admins where id = ${a.sub}`;
  return json({ email: r?.email ?? a.email, name: r?.name ?? "" });
});

export const POST = handle(async (req: Request) => {
  const a = await requireAdmin();
  const b = await body<{ email?: string; name?: string; password?: string }>(req);
  const db = sql();
  if (b.email !== undefined) {
    const email = b.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido" }, 400);
    await db`update admins set email = ${email} where id = ${a.sub}`;
  }
  if (b.name !== undefined) await db`update admins set name = ${b.name.trim() || null} where id = ${a.sub}`;
  if (b.password !== undefined) {
    if (b.password.length < 10) return json({ error: "A senha precisa ter pelo menos 10 caracteres" }, 400);
    await db`update admins set password_hash = ${await hashPassword(b.password, 12)} where id = ${a.sub}`;
  }
  return json({ ok: true });
});
