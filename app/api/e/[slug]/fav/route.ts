import { accessibleEvent } from "@/lib/client-access";
import { handle, json, body } from "@/lib/api";
import { sql } from "@/lib/db";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const { ev, visitor } = await accessibleEvent(slug);
  const { fileId, on } = await body<{ fileId?: string; on?: boolean }>(req);
  if (!visitor || !fileId) return json({ error: "Dados inválidos" }, 400);
  const db = sql();
  const [f] = await db`select id from files where id = ${fileId} and event_id = ${ev.id}`;
  if (!f) return json({ error: "Arquivo não encontrado" }, 404);
  if (on) await db`insert into favorites (file_id, visitor_id) values (${fileId}, ${visitor}) on conflict do nothing`;
  else await db`delete from favorites where file_id = ${fileId} and visitor_id = ${visitor}`;
  return json({ ok: true });
});
