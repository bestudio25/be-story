import { handle, json, body } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { signPut, signedUrl, size, deletePrefix } from "@/lib/storage";

/** Biblioteca de fontes próprias da BE (servem para qualquer evento). */
const EXT = ["woff2", "woff", "otf", "ttf"];
const TYPE: Record<string, string> = { woff2: "font/woff2", woff: "font/woff", otf: "font/otf", ttf: "font/ttf" };

export const GET = handle(async () => {
  await requireAdmin();
  const rows = await sql()`select id, name, key, format from brand_fonts order by created_at`;
  return json({ fonts: await Promise.all(rows.map(async (r) => ({ id: r.id, name: r.name, format: r.format, url: await signedUrl(r.key, { expires: 3600 }) }))) });
});

/** 1) pede o endereço de envio */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ fileName?: string; size?: number }>(req);
  const ext = (b.fileName ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (!EXT.includes(ext)) return json({ error: "Envie uma fonte .woff2, .woff, .otf ou .ttf" }, 400);
  if ((b.size ?? 0) > 8 * 1024 * 1024) return json({ error: "A fonte pode ter no máximo 8 MB" }, 400);
  const key = `brand/fonts/${crypto.randomUUID()}.${ext}`;
  return json({ key, contentType: TYPE[ext], url: await signPut(key, TYPE[ext]) });
});

/** 2) confirma o envio e dá um nome */
export const PUT = handle(async (req: Request) => {
  await requireAdmin();
  const { key, name } = await body<{ key?: string; name?: string }>(req);
  if (!key || !/^brand\/fonts\/[0-9a-f-]{36}\.(woff2|woff|otf|ttf)$/.test(key)) return json({ error: "Arquivo inválido" }, 400);
  if (!(await size(key).catch(() => 0))) return json({ error: "O envio não terminou. Tente de novo." }, 400);
  const clean = (name ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/[^\p{L}\p{N} _-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Fonte da BE";
  const [r] = await sql()`insert into brand_fonts (name, key, format) values (${clean}, ${key}, ${key.split(".").pop()!}) returning id`;
  return json({ ok: true, id: r.id });
});

export const DELETE = handle(async (req: Request) => {
  await requireAdmin();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Fonte inválida" }, 400);
  const db = sql();
  const [r] = await db`delete from brand_fonts where id = ${id} returning key`;
  if (r) await deletePrefix(r.key).catch(() => {});
  // eventos que usavam essa fonte voltam para o padrão daquele papel
  await db`update events set fonts = (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(fonts) e(k, v) where v <> to_jsonb(${"custom:" + id}::text))
           where fonts::text like ${"%custom:" + id + "%"}`;
  return json({ ok: true });
});
