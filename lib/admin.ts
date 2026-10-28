import { sql } from "./db";
import { signedUrl } from "./storage";

export async function eventDetail(id: string) {
  const db = sql();
  const [ev] = await db`select * from events where id = ${id}`;
  if (!ev) return null;
  const [chapters, files, notes, zips, counts] = await Promise.all([
    db`select * from chapters where event_id = ${id} order by position, name`,
    db`select id, chapter_id, kind, original_name, display_name, position, size_bytes, width, height, duration_sec, poster_time_sec,
              recorded_at, recorded_at_known, is_highlight, is_reels, tags, processing, processing_error, thumb_key, poster_key, web_key, lite_key
       from files where event_id = ${id} order by position, original_name`,
    db`select * from notes where event_id = ${id} order by created_at desc`,
    db`select id, label, status, progress, size_bytes, notify_email, notify_phone, notified_at, created_at, ready_at, zip_key from zip_requests where event_id = ${id} order by created_at desc limit 50`,
    db`with recursive h as (select c.id from chapters c where c.event_id = ${id} and (c.is_internal or c.is_raw) union select c.id from chapters c join h on c.parent_id = h.id)
        select processing, count(*)::int n from files where event_id = ${id} and (chapter_id is null or chapter_id not in (select id from h)) group by processing`,
  ]);
  const withUrls = await Promise.all(
    files.map(async (f) => ({
      ...f,
      size_bytes: Number(f.size_bytes),
      duration_sec: f.duration_sec ? Number(f.duration_sec) : null,
      poster_time_sec: f.poster_time_sec ? Number(f.poster_time_sec) : null,
      thumb: await signedUrl(f.thumb_key),
      poster: await signedUrl(f.poster_key),
      lite: await signedUrl(f.lite_key ?? f.web_key),
      thumb_key: undefined, poster_key: undefined, web_key: undefined, lite_key: undefined,
    })),
  );
  const { password_hash, ...rest } = ev;
  return {
    event: { ...rest, soundtrack_url: await signedUrl(ev.soundtrack_key), has_password: !!password_hash, storage_bytes: Number(ev.storage_bytes), event_date: ev.event_date.toISOString().slice(0, 10) },
    chapters, files: withUrls, notes,
    zips: zips.map((z) => ({ ...z, size_bytes: z.size_bytes ? Number(z.size_bytes) : null, zip_key: undefined, has_zip: !!z.zip_key })),
    processing: Object.fromEntries(counts.map((c) => [c.processing, c.n])),
  };
}

export const EDITABLE_EVENT_FIELDS = [
  "title", "client_names", "event_type", "event_date", "location", "theme", "accent_color", "status", "expires_at",
  "cover_file_id", "polaroid_file_id", "final_file_id", "hero_file_ids", "reels_file_id", "film_file_id",
  "letter", "testimonial", "share_caption", "slug", "drive_folder_id", "manual_order",
] as const;

export function driveError(e: unknown) {
  const m = (e as Error)?.message ?? String(e);
  if (/not found|404/i.test(m)) return "Não encontrei a pasta. Confira o link e se ela foi compartilhada com a conta de serviço do BE STORY.";
  if (/permission|403|insufficient/i.test(m)) return "Sem permissão para ler a pasta. Compartilhe a pasta (ou a pasta-mãe) com o e-mail da conta de serviço como Leitor.";
  return m;
}
