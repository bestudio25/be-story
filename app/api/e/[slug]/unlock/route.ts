import { cookies } from "next/headers";
import { getEventBySlug, isExpired } from "@/lib/events";
import { checkKeyword, eventCookie, sign } from "@/lib/auth";
import { handle, json, body } from "@/lib/api";
import { track } from "@/lib/db";

// tentativas por IP (memória da função; suficiente para frear força bruta casual)
const tries = new Map<string, { n: number; t: number }>();

export const POST = handle(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "?";
  const k = `${slug}|${ip}`;
  const t = tries.get(k);
  if (t && t.n >= 8 && Date.now() - t.t < 10 * 60_000) return json({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429);
  const ev = await getEventBySlug(slug);
  if (!ev || ev.status === "rascunho" || isExpired(ev)) return json({ error: "Evento não encontrado" }, 404);
  const { password } = await body<{ password?: string }>(req);
  if (!ev.password_hash) return json({ ok: true });
  if (!password || !(await checkKeyword(password, ev.password_hash))) {
    tries.set(k, { n: (t?.n ?? 0) + 1, t: Date.now() });
    return json({ error: "Palavra-chave incorreta. Confira a mensagem que enviamos." }, 401);
  }
  tries.delete(k);
  const jar = await cookies();
  jar.set(eventCookie(slug), await sign({ slug }, "365d"), { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 365 * 86400 });
  await track(ev.id, "unlock");
  return json({ ok: true });
});
