/**
 * Importa/sincroniza a estrutura de um evento a partir do Drive (ou de uma pasta local em desenvolvimento).
 * Pastas viram capítulos, subpastas viram subcapítulos, arquivos de foto/vídeo viram itens da galeria.
 * O arquivo "Reels_*" da raiz é sempre o clipe 9:16 e o filme do evento (não entra na galeria).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { sql } from "./db";
import { readFolderTree, REELS_PATTERN, type DriveTree, type DriveNode } from "./drive";

const VIDEO_EXT = /\.(mov|mp4|m4v|avi|mts|mkv|webm|3gp)$/i;
/** Pasta de arquivos brutos (ex.: "02. Arquivos brutos"): fica no Drive, o cliente baixa direto de lá. */
export const RAW_PATTERN = /brut/i;
const PHOTO_EXT = /\.(jpe?g|png|heic|heif|webp|tiff?|dng)$/i;

/** "01. Making of" → "Making of"; "02.Arquivos brutos" → "Arquivos brutos" */
export function cleanFolderName(name: string) {
  return name.replace(/^\s*\d+\s*[.\-_)]\s*/, "").trim() || name.trim();
}
/** Nome amigável inicial: tira extensão e prefixos técnicos ("copy_", "IMG_") quando sobra algo útil. */
export function friendlyName(file: string) {
  const base = file.replace(/\.[^.]+$/, "").trim();
  if (/^(copy_)?[0-9A-F]{8}-[0-9A-F-]{27,}$/i.test(base)) return "Momento";
  return base.replace(/^copy_/i, "");
}

export async function localTree(root: string, prefix = ""): Promise<DriveTree> {
  const tree: DriveTree = { folders: [], files: [] };
  const id = (rel: string) => "local:" + (prefix ? prefix.replace(/\/$/, "") + "/" : "") + rel;
  async function walk(dir: string, rel: string[]) {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      const r = [...rel, e.name];
      if (e.isDirectory()) {
        tree.folders.push({ id: id(r.join("/")), name: e.name, path: r });
        await walk(p, r);
      } else if (VIDEO_EXT.test(e.name) || PHOTO_EXT.test(e.name)) {
        const st = await fs.stat(p);
        tree.files.push({
          id: id(r.join("/")),
          name: e.name,
          path: rel,
          mimeType: VIDEO_EXT.test(e.name) ? "video/quicktime" : "image/jpeg",
          size: st.size,
          recordedAt: st.mtime.toISOString(),
        });
      }
    }
  }
  await walk(root, []);
  return tree;
}

export async function loadTree(source: string): Promise<DriveTree> {
  if (source.startsWith("local:")) return localTree(path.resolve(process.env.LOCAL_SOURCE_DIR || ".", source.slice(6)), source.slice(6));
  return readFolderTree(source);
}

export interface SyncResult {
  chapters: number;
  newFiles: number;
  totalFiles: number;
  removed: number;
  renamed: number;
  reels: string | null;
}

export async function syncEvent(eventId: string): Promise<SyncResult> {
  const db = sql();
  const [ev] = await db`select id, drive_folder_id from events where id = ${eventId}`;
  if (!ev?.drive_folder_id) throw new Error("Evento sem pasta do Drive");
  const tree = await loadTree(ev.drive_folder_id);

  // ── capítulos ──
  const folderIds = new Map<string, string>(); // caminho → chapter id
  const sortedFolders = [...tree.folders].sort((a, b) => a.path.length - b.path.length || a.name.localeCompare(b.name, "pt-BR"));
  const posByParent = new Map<string, number>();
  for (const f of sortedFolders) {
    const parentPath = f.path.slice(0, -1).join("/");
    const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
    const pk = parentId ?? "root";
    const position = posByParent.get(pk) ?? 0;
    posByParent.set(pk, position + 1);
    const [row] = await db`
      insert into chapters (event_id, parent_id, name, position, drive_folder_id, drive_path, is_raw)
      values (${eventId}, ${parentId}, ${cleanFolderName(f.name)}, ${position}, ${f.id}, ${f.path.join("/")}, ${f.path.length === 1 && RAW_PATTERN.test(f.name)})
      on conflict (event_id, drive_folder_id) do update set drive_path = excluded.drive_path
      returning id`;
    folderIds.set(f.path.join("/"), row.id);
  }

  // ── arquivos (em lote: uma consulta para todos, rápido mesmo com centenas de arquivos) ──
  const prevRows = await db`select id, drive_file_id, processing, original_name, display_name from files where event_id = ${eventId}`;
  const prev = new Map(prevRows.map((r) => [r.drive_file_id as string, r.processing as string]));
  const sorted = [...tree.files].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
  const rows = sorted.map((f, pos) => {
    const isReels = f.path.length === 0 && REELS_PATTERN.test(f.name) && isVideo(f);
    return {
      event_id: eventId, chapter_id: f.path.length ? folderIds.get(f.path.join("/")) ?? null : null,
      kind: isVideo(f) ? "video" : "foto", original_name: f.name, display_name: isReels ? "Reels" : friendlyName(f.name), position: pos,
      drive_file_id: f.id, mime_type: f.mimeType, size_bytes: f.size, width: f.width ?? null, height: f.height ?? null,
      duration_sec: f.durationSec ?? null, recorded_at: f.recordedAt ?? null, is_reels: isReels,
    };
  });
  const saved: { id: string; drive_file_id: string; is_reels: boolean }[] = [];
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    saved.push(...(await db`
      insert into files ${db(chunk as never)}
      on conflict (event_id, drive_file_id) do update set size_bytes = excluded.size_bytes, original_name = excluded.original_name,
        is_reels = case when files.chapter_id is null then excluded.is_reels else files.is_reels end
      returning id, drive_file_id, is_reels` as unknown as { id: string; drive_file_id: string; is_reels: boolean }[]));
  }
  // ── nomes renomeados no Drive: o nome exibido acompanha, a não ser que tenha sido trocado à mão no painel ──
  const newName = new Map(tree.files.map((f) => [f.id, f.name]));
  let renamed = 0;
  for (const r of prevRows) {
    const now = newName.get(r.drive_file_id as string);
    if (!now || now === r.original_name) continue;
    const auto = friendlyName(r.original_name as string);
    if (r.display_name !== auto && r.display_name !== (r.original_name as string).replace(/\.[^.]+$/, "")) continue;
    await db`update files set display_name = ${friendlyName(now)} where id = ${r.id}`;
    renamed++;
  }
  // arquivos em capítulos internos (e subcapítulos) não entram na fila
  const chs = await db`select id, parent_id, is_internal, is_raw from chapters where event_id = ${eventId}`;
  const hidden = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of chs) if (!hidden.has(c.id) && (c.is_internal || c.is_raw || (c.parent_id && hidden.has(c.parent_id)))) { hidden.add(c.id); changed = true; }
  }
  const chapterOf = new Map(rows.map((r) => [r.drive_file_id, r.chapter_id]));
  const toQueue = saved.filter((r) => {
    const ch = chapterOf.get(r.drive_file_id);
    if (ch && hidden.has(ch)) return false;
    return !prev.has(r.drive_file_id) || prev.get(r.drive_file_id) === "erro";
  });
  const newFiles = saved.filter((r) => !prev.has(r.drive_file_id)).length;
  if (toQueue.length) {
    const ids = toQueue.map((r) => r.id);
    await db`update files set processing = 'pendente', processing_error = null where id = any(${ids}::uuid[]) and processing = 'erro'`;
    await db`insert into jobs (kind, payload) select 'process_file', json_build_object('fileId', x)::jsonb from unnest(${ids}::uuid[]) as x
             where not exists (select 1 from jobs j where j.kind = 'process_file' and j.payload->>'fileId' = x::text and j.status in ('pendente','processando'))`;
  }
  // ── arquivos apagados do Drive saem da plataforma (e do armazenamento) ──
  // Só quando a leitura do Drive trouxe arquivos, para nunca esvaziar um evento por falha momentânea de leitura.
  let removed = 0;
  if (tree.files.length) {
    const inDrive = tree.files.map((f) => f.id);
    const gone = await db`select id, master_key, thumb_key, poster_key, web_key, lite_key from files
      where event_id = ${eventId} and drive_file_id not like 'upload:%' and not (drive_file_id = any(${inDrive}::text[]))`;
    if (gone.length) {
      const ids = gone.map((g) => g.id as string);
      const keysToDelete = gone.flatMap((g) => [g.master_key, g.thumb_key, g.poster_key, g.web_key, g.lite_key]).filter(Boolean);
      await db`update events set
        cover_file_id = case when cover_file_id = any(${ids}::uuid[]) then null else cover_file_id end,
        polaroid_file_id = case when polaroid_file_id = any(${ids}::uuid[]) then null else polaroid_file_id end,
        final_file_id = case when final_file_id = any(${ids}::uuid[]) then null else final_file_id end,
        reels_file_id = case when reels_file_id = any(${ids}::uuid[]) then null else reels_file_id end,
        film_file_id = case when film_file_id = any(${ids}::uuid[]) then null else film_file_id end,
        hero_file_ids = array(select x from unnest(hero_file_ids) x where not (x = any(${ids}::uuid[])))
        where id = ${eventId}`;
      await db`update chapters set cover_file_id = null where event_id = ${eventId} and cover_file_id = any(${ids}::uuid[])`;
      await db`delete from jobs where kind = 'process_file' and status = 'pendente' and payload->>'fileId' = any(${ids}::text[])`;
      await db`delete from files where id = any(${ids}::uuid[])`;
      if (keysToDelete.length) await db`insert into jobs (kind, payload) values ('purge_files', ${db.json({ eventId, keys: keysToDelete } as never)})`;
      removed = gone.length;
    }
  }
  const reelsId = saved.find((r) => r.is_reels)?.id ?? null;
  if (reelsId) await db`update events set reels_file_id = ${reelsId} where id = ${eventId} and reels_file_id is null`;
  await db`update events set drive_synced_at = now(), updated_at = now() where id = ${eventId}`;
  return { chapters: tree.folders.length, newFiles, totalFiles: tree.files.length, removed, renamed, reels: reelsId };
}

function isVideo(f: DriveNode) {
  return f.mimeType.startsWith("video/") || VIDEO_EXT.test(f.name);
}

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const shortHash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 8);
