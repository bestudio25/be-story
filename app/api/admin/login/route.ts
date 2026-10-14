import { cookies } from "next/headers";
import { handle, json, body } from "@/lib/api";
import { checkAdminLogin, sign, ADMIN_COOKIE } from "@/lib/auth";

const tries = new Map<string, { n: number; t: number }>();

export const POST = handle(async (req: Request) => {
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "?";
  const t = tries.get(ip);
  if (t && t.n >= 6 && Date.now() - t.t < 15 * 60_000) return json({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
  const { email, password } = await body<{ email?: string; password?: string }>(req);
  const a = email && password ? await checkAdminLogin(email, password) : null;
  if (!a) {
    tries.set(ip, { n: (t?.n ?? 0) + 1, t: Date.now() });
    return json({ error: "E-mail ou senha incorretos" }, 401);
  }
  tries.delete(ip);
  (await cookies()).set(ADMIN_COOKIE, await sign({ sub: a.id, email: a.email, role: "admin" }, "30d"), { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 30 * 86400 });
  return json({ ok: true });
});
