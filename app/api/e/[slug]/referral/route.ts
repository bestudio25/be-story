import { accessibleEvent } from "@/lib/client-access";
import { handle, json } from "@/lib/api";
import { sql } from "@/lib/db";
import { SITE_URL } from "@/lib/events";
import { randomBytes } from "node:crypto";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const { ev, visitor } = await accessibleEvent(slug);
  const db = sql();
  let [r] = visitor ? await db`select code from referrals where event_id = ${ev.id} and visitor_id = ${visitor} limit 1` : [];
  if (!r) {
    const code = randomBytes(4).toString("base64url").replace(/[-_]/g, "x").slice(0, 6).toLowerCase();
    [r] = await db`insert into referrals (code, event_id, visitor_id) values (${code}, ${ev.id}, ${visitor}) returning code`;
  }
  return json({ code: r.code, url: `${SITE_URL()}/r/${r.code}` });
});
