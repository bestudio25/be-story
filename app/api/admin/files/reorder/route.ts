import { handle, json, body } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

/** Nova ordem (arrastar e soltar) dos arquivos de um capítulo. Recebe a lista completa de ids na ordem desejada. */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const { ids, eventId, byTime } = await body<{ ids?: string[]; eventId?: string; byTime?: boolean }>(req);
  const db = sql();
  if (byTime && eventId) {
    await db`update files f set position = s.rn from (
               select id, row_number() over (order by recorded_at nulls last, original_name) as rn from files where event_id = ${eventId}) s
             where f.id = s.id`;
    await db`update events set manual_order = false where id = ${eventId}`;
    return json({ ok: true });
  }
  if (!ids?.length) return json({ error: "Lista vazia" }, 400);
  const rows = await db`select id, position from files where id = any(${ids}::uuid[]) order by position`;
  const slots = rows.map((r) => r.position as number).sort((a, b) => a - b);
  for (const [i, id] of ids.entries()) await db`update files set position = ${slots[i] ?? i} where id = ${id}`;
  const [ev] = await db`select event_id from files where id = ${ids[0]}`;
  if (ev) await db`update events set manual_order = true where id = ${ev.event_id}`;
  return json({ ok: true });
});
