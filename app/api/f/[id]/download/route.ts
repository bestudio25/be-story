import { handle, json } from "@/lib/api";
import { sql, track } from "@/lib/db";
import { accessibleEvent } from "@/lib/client-access";
import { signedUrl } from "@/lib/storage";

/** "Baixar original" (master) ou "Baixar versão leve" (720p). Sempre por URL assinada de curta duração. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Arquivo não encontrado" }, 404);
  const [f] = await sql()`select f.*, e.slug from files f join events e on e.id = f.event_id where f.id = ${id}`;
  if (!f) return json({ error: "Arquivo não encontrado" }, 404);
  const { ev, visitor } = await accessibleEvent(f.slug);
  const lite = new URL(req.url).searchParams.get("v") === "lite";
  const base = (f.display_name as string).replace(/[\\/:*?"<>|]+/g, " ").trim() || "arquivo";
  const ext = (f.original_name.match(/\.[^.]+$/)?.[0] ?? (f.kind === "video" ? ".mp4" : ".jpg")).toLowerCase();
  const key = lite ? (f.kind === "video" ? f.lite_key ?? f.web_key : f.poster_key) : f.master_key;
  if (!key) return json({ error: "Arquivo ainda em preparação" }, 409);
  const name = lite ? `${base} (leve)${f.kind === "video" ? ".mp4" : ".jpg"}` : `${base}${ext}`;
  await track(ev.id, "download", { fileId: f.id, visitorId: visitor, value: lite ? 0 : Number(f.size_bytes), meta: { lite } });
  const url = await signedUrl(key, { download: name, expires: 3600 });
  return Response.redirect(new URL(url!, req.url), 302);
});
