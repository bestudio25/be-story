import { cookies } from "next/headers";
import { handle, json, body } from "@/lib/api";
import { sql } from "@/lib/db";
import { adminCount, hashPassword, sign, ADMIN_COOKIE } from "@/lib/auth";

/** Primeiro acesso: cria a conta da BE (só funciona enquanto não existir nenhum admin e com o SETUP_TOKEN). */
export const POST = handle(async (req: Request) => {
  const b = await body<{ token?: string; email?: string; name?: string; password?: string }>(req);
  if ((await adminCount()) > 0) return json({ error: "O painel já foi configurado" }, 403);
  if (!process.env.SETUP_TOKEN || b.token !== process.env.SETUP_TOKEN) return json({ error: "Link de configuração inválido" }, 403);
  const email = (b.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido" }, 400);
  if ((b.password ?? "").length < 10) return json({ error: "A senha precisa ter pelo menos 10 caracteres" }, 400);
  const [a] = await sql()`insert into admins (email, name, password_hash) values (${email}, ${b.name ?? null}, ${await hashPassword(b.password!, 12)}) returning id`;
  (await cookies()).set(ADMIN_COOKIE, await sign({ sub: a.id, email, role: "admin" }, "30d"), { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 30 * 86400 });
  return json({ ok: true });
});
