import { accessibleEvent } from "@/lib/client-access";
import { handle, json } from "@/lib/api";
import { sql } from "@/lib/db";
import { signedUrl } from "@/lib/storage";
import { slugify } from "@/lib/importer";

export const GET = handle(async (req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) => {
  const { slug, id } = await params;
  const { ev } = await accessibleEvent(slug);
  const [z] = await sql()`select zip_key, label, status from zip_requests where id = ${id} and event_id = ${ev.id}`;
  if (!z || z.status !== "pronto" || !z.zip_key) return json({ error: "O ZIP ainda não está pronto" }, 409);
  const url = await signedUrl(z.zip_key, { download: `${slugify(ev.client_names)}-${slugify(z.label) || "memorias"}.zip`, expires: 3600 });
  return Response.redirect(new URL(url!, req.url), 302);
});
