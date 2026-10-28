import { handle, json, body } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql, wakeWorker } from "@/lib/db";
import { signedUrl } from "@/lib/storage";
import { parseFolderId } from "@/lib/drive";
import { slugify, syncEvent } from "@/lib/importer";
import { RESERVED_SLUGS } from "@/lib/events";
import { driveError } from "@/lib/admin";

export const GET = handle(async () => {
  await requireAdmin();
  const db = sql();
  const rows = await db`
    select e.id, e.slug, e.title, e.client_names, e.event_type, e.event_date, e.status, e.expires_at, e.storage_bytes, e.created_at,
           e.cover_file_id, e.password_hash is not null as has_password,
           (with recursive h as (select c.id from chapters c where c.event_id = e.id and (c.is_internal or c.is_raw) union select c.id from chapters c join h on c.parent_id = h.id) select count(*)::int from files f where f.event_id = e.id and not f.is_reels and (f.chapter_id is null or f.chapter_id not in (select id from h))) as files,
           (with recursive h as (select c.id from chapters c where c.event_id = e.id and (c.is_internal or c.is_raw) union select c.id from chapters c join h on c.parent_id = h.id) select count(*)::int from files f where f.event_id = e.id and f.processing = 'pronto' and not f.is_reels and (f.chapter_id is null or f.chapter_id not in (select id from h))) as ready,
           (with recursive h as (select c.id from chapters c where c.event_id = e.id and (c.is_internal or c.is_raw) union select c.id from chapters c join h on c.parent_id = h.id) select count(*)::int from files f where f.event_id = e.id and f.processing = 'erro' and (f.chapter_id is null or f.chapter_id not in (select id from h))) as errors,
           (select count(distinct visitor_id)::int from analytics a where a.event_id = e.id and a.kind = 'open') as visitors,
           (select count(*)::int from analytics a where a.event_id = e.id and a.kind = 'open') as opens,
           (select thumb_key from files f where f.id = coalesce(e.cover_file_id, e.polaroid_file_id)
              or (e.cover_file_id is null and f.event_id = e.id and f.kind = 'foto' and f.thumb_key is not null) order by f.is_highlight desc limit 1) as cover_key
    from events e order by e.event_date desc, e.created_at desc`;
  const events = await Promise.all(rows.map(async (r) => ({
    ...r, cover_key: undefined, cover: await signedUrl(r.cover_key), storage_bytes: Number(r.storage_bytes), event_date: r.event_date.toISOString().slice(0, 10),
  })));
  const [tot] = await db`select coalesce(sum(storage_bytes),0)::bigint as bytes from events`;
  return json({ events, storageBytes: Number(tot.bytes) });
});

export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ clientNames?: string; title?: string; eventType?: string; eventDate?: string; location?: string; slug?: string; driveUrl?: string; expiresInDays?: number }>(req);
  const names = (b.clientNames ?? "").trim();
  if (!names) return json({ error: "Informe os nomes dos clientes" }, 400);
  if (!b.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(b.eventDate)) return json({ error: "Informe a data do evento" }, 400);
  const slug = slugify(b.slug || names);
  if (!slug || RESERVED_SLUGS.has(slug)) return json({ error: "Endereço inválido" }, 400);
  let folder: string | null = null;
  if (b.driveUrl) {
    try { folder = b.driveUrl.startsWith("local:") ? b.driveUrl : parseFolderId(b.driveUrl); } catch (e) { return json({ error: (e as Error).message }, 400); }
  }
  const db = sql();
  const [dup] = await db`select 1 from events where slug = ${slug}`;
  if (dup) return json({ error: `O endereço /${slug} já está em uso` }, 409);
  const type = b.eventType ?? "casamento";
  const title = (b.title ?? "").trim() || `${({ casamento: "Casamento", aniversario: "Aniversário", formatura: "Formatura", corporativo: "Evento", saude: "Evento", inauguracao: "Inauguração", outro: "Evento" } as Record<string, string>)[type] ?? "Evento"} ${names}`;
  const days = b.expiresInDays === 0 ? null : (b.expiresInDays ?? 90);
  const [ev] = await db`
    insert into events (slug, title, client_names, event_type, event_date, location, drive_folder_id, expires_at)
    values (${slug}, ${title}, ${names}, ${type}, ${b.eventDate}, ${b.location || null}, ${folder},
            ${days ? new Date(new Date(b.eventDate + "T23:59:59-03:00").getTime() + days * 86400000) : null})
    returning id`;
  let sync = null;
  if (folder) {
    try { sync = await syncEvent(ev.id); await wakeWorker("novo evento"); }
    catch (e) { return json({ id: ev.id, slug, syncError: driveError(e) }); }
  }
  return json({ id: ev.id, slug, sync });
});

