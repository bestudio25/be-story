import { accessibleEvent } from "@/lib/client-access";
import { handle, json, body } from "@/lib/api";
import { sql, enqueueJob, wakeWorker, track } from "@/lib/db";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const { ev, visitor } = await accessibleEvent(slug);
  const b = await body<{ scope?: string; fileIds?: string[]; label?: string }>(req);
  const scope = String(b.scope || "all").slice(0, 60);
  const db = sql();
  const ids = Array.isArray(b.fileIds) ? b.fileIds.filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 5000) : [];
  const valid = ids.length
    ? (await db`select id, size_bytes from files where event_id = ${ev.id} and id = any(${ids}::uuid[]) and processing = 'pronto'`)
    : (await db`select id, size_bytes from files where event_id = ${ev.id} and processing = 'pronto' and not is_reels`);
  if (!valid.length) return json({ error: "Nada para baixar" }, 400);
  const fileIds = valid.map((r) => r.id as string).sort();
  // reaproveita um ZIP idêntico já pronto/em andamento
  const [same] = await db`select id, status from zip_requests where event_id = ${ev.id} and file_ids = ${fileIds}::uuid[]
                          and status in ('pendente','processando','pronto') and created_at > now() - interval '6 days' order by created_at desc limit 1`;
  if (same) return json({ id: same.id, status: same.status });
  const [z] = await db`insert into zip_requests (event_id, scope, label, file_ids, visitor_id)
                       values (${ev.id}, ${scope}, ${String(b.label || "Arquivos").slice(0, 120)}, ${fileIds}::uuid[], ${visitor}) returning id, status`;
  await enqueueJob("build_zip", { zipId: z.id });
  await wakeWorker("zip");
  await track(ev.id, "zip", { visitorId: visitor, value: valid.reduce((s, r) => s + Number(r.size_bytes), 0), meta: { scope, count: fileIds.length } });
  return json({ id: z.id, status: z.status });
});
