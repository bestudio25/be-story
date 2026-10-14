import { accessibleEvent } from "@/lib/client-access";
import { handle, json, body } from "@/lib/api";
import { sql } from "@/lib/db";

const ALLOWED = new Set(["🤎", "😭", "🔥", "✨"]);

export const POST = handle(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const { ev, visitor } = await accessibleEvent(slug);
  const { fileId, emoji, on } = await body<{ fileId?: string; emoji?: string; on?: boolean }>(req);
  if (!visitor || !fileId || !emoji || !ALLOWED.has(emoji)) return json({ error: "Dados inválidos" }, 400);
  const db = sql();
  const [f] = await db`select id from files where id = ${fileId} and event_id = ${ev.id}`;
  if (!f) return json({ error: "Arquivo não encontrado" }, 404);
  if (on) await db`insert into reactions (file_id, visitor_id, emoji) values (${fileId}, ${visitor}, ${emoji}) on conflict do nothing`;
  else await db`delete from reactions where file_id = ${fileId} and visitor_id = ${visitor} and emoji = ${emoji}`;
  return json({ ok: true });
});
