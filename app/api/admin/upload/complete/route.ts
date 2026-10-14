import { handle, json, body } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql, enqueueJob, wakeWorker } from "@/lib/db";
import { completeMultipart } from "@/lib/storage";
import { cleanFolderName, friendlyName } from "@/lib/importer";

const VIDEO = /\.(mov|mp4|m4v|avi|mts|mkv|webm|3gp)$/i;

/** Finaliza o envio e cria o arquivo no capítulo correspondente à estrutura de pastas arrastada. */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const { id, parts, chapterId } = await body<{ id?: string; parts?: { PartNumber: number; ETag: string }[]; chapterId?: string | null }>(req);
  const db = sql();
  const [u] = await db`select * from uploads where id = ${id ?? ""}`;
  if (!u || !parts?.length) return json({ error: "Envio não encontrado" }, 404);
  if (!u.completed) {
    await completeMultipart(u.key, u.upload_id, parts);
    await db`update uploads set completed = true where id = ${u.id}`;
  }
  // pastas do caminho relativo → capítulos/subcapítulos (dentro do capítulo escolhido, se houver)
  const segs = (u.relative_path as string).split("/").filter(Boolean);
  const name = segs.pop()!;
  let parent: string | null = chapterId ?? null;
  for (const s of segs) {
    const nm = cleanFolderName(s);
    const [ex] = await db`select id from chapters where event_id = ${u.event_id} and parent_id is not distinct from ${parent} and lower(name) = lower(${nm}) limit 1`;
    if (ex) parent = ex.id;
    else {
      const [m] = await db`select coalesce(max(position),-1)+1 as p from chapters where event_id = ${u.event_id} and parent_id is not distinct from ${parent}`;
      const [c] = await db`insert into chapters (event_id, parent_id, name, position) values (${u.event_id}, ${parent}, ${nm}, ${m.p}) returning id`;
      parent = c.id;
    }
  }
  const [m] = await db`select coalesce(max(position),-1)+1 as p from files where event_id = ${u.event_id}`;
  const [f] = await db`
    insert into files (event_id, chapter_id, kind, original_name, display_name, position, drive_file_id, master_key, size_bytes, recorded_at)
    values (${u.event_id}, ${parent}, ${VIDEO.test(name) ? "video" : "foto"}, ${name}, ${friendlyName(name)}, ${m.p}, ${"upload:" + u.id}, ${u.key},
            ${u.size_bytes}, ${u.last_modified ? new Date(Number(u.last_modified)) : null})
    on conflict (event_id, drive_file_id) do update set master_key = excluded.master_key
    returning id`;
  await enqueueJob("process_file", { fileId: f.id }, { dedupe: true });
  await wakeWorker("upload");
  return json({ fileId: f.id });
});
