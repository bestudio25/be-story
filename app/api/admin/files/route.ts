import { handle, json, body } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

/** Edição em lote: mover de capítulo, destaque, renomear (com {n}), tags. */
export const PATCH = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ ids?: string[]; chapterId?: string | null; highlight?: boolean; name?: string; addTags?: string[]; removeTags?: string[]; tags?: string[]; posterTime?: number }>(req);
  const ids = (b.ids ?? []).filter((x) => /^[0-9a-f-]{36}$/.test(x));
  if (!ids.length) return json({ error: "Selecione arquivos" }, 400);
  const db = sql();
  if ("chapterId" in b) {
    await db`update files set chapter_id = ${b.chapterId ?? null} where id = any(${ids}::uuid[])`;
    const [ev] = await db`select event_id from files where id = ${ids[0]}`;
    if (ev) await db`update events set manual_order = true where id = ${ev.event_id}`;
  }
  if (typeof b.highlight === "boolean") await db`update files set is_highlight = ${b.highlight} where id = any(${ids}::uuid[])`;
  if (b.name !== undefined) {
    const name = b.name.trim().slice(0, 140);
    if (!name) return json({ error: "Nome vazio" }, 400);
    const rows = await db`select id from files where id = any(${ids}::uuid[]) order by position`;
    const pad = String(rows.length).length;
    for (const [i, r] of rows.entries()) {
      const n = name.includes("{n}") ? name.replaceAll("{n}", String(i + 1).padStart(pad, "0")) : rows.length > 1 ? `${name} ${String(i + 1).padStart(pad, "0")}` : name;
      await db`update files set display_name = ${n} where id = ${r.id}`;
    }
  }
  if (b.tags) await db`update files set tags = ${b.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)} where id = any(${ids}::uuid[])`;
  if (b.addTags?.length) await db`update files set tags = (select array(select distinct unnest(tags || ${b.addTags.map((t) => t.trim().toLowerCase())}::text[]))) where id = any(${ids}::uuid[])`;
  if (b.removeTags?.length) await db`update files set tags = (select array(select unnest(tags) except select unnest(${b.removeTags}::text[]))) where id = any(${ids}::uuid[])`;
  return json({ ok: true });
});
