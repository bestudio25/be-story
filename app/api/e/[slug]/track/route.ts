import { accessibleEvent } from "@/lib/client-access";
import { handle, json, body } from "@/lib/api";
import { track } from "@/lib/db";

const KINDS = new Set(["open", "reveal", "view", "watch", "share", "film"]);

export const POST = handle(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const { ev, visitor, admin } = await accessibleEvent(slug);
  const b = await body<{ kind?: string; fileId?: string; value?: number; meta?: Record<string, unknown> }>(req);
  if (!admin && b.kind && KINDS.has(b.kind)) {
    await track(ev.id, b.kind, { fileId: b.fileId && /^[0-9a-f-]{36}$/.test(b.fileId) ? b.fileId : null, visitorId: visitor, value: typeof b.value === "number" ? b.value : undefined, meta: b.meta });
  }
  return json({ ok: true });
});
