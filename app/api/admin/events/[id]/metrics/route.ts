import { handle, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await params;
  const db = sql();
  const [totals, top, days, refs, favs] = await Promise.all([
    db`select kind, count(*)::int as n, count(distinct visitor_id)::int as u, coalesce(sum(value),0)::float as v from analytics where event_id = ${id} group by kind`,
    db`select f.id, f.display_name, f.kind,
              count(*) filter (where a.kind = 'view')::int as views,
              count(*) filter (where a.kind = 'download')::int as downloads
       from analytics a join files f on f.id = a.file_id where a.event_id = ${id}
       group by f.id order by views desc, downloads desc limit 12`,
    db`select to_char(date_trunc('day', created_at at time zone 'America/Fortaleza'), 'DD/MM') as d, count(distinct visitor_id)::int as u
       from analytics where event_id = ${id} and kind = 'open' and created_at > now() - interval '30 days' group by 1, date_trunc('day', created_at at time zone 'America/Fortaleza') order by date_trunc('day', created_at at time zone 'America/Fortaleza')`,
    db`select count(*)::int as links, coalesce(sum(clicks),0)::int as clicks from referrals where event_id = ${id}`,
    db`select count(*)::int as n from favorites fv join files f on f.id = fv.file_id where f.event_id = ${id}`,
  ]);
  const t = Object.fromEntries(totals.map((r) => [r.kind, { n: r.n, u: r.u, v: r.v }]));
  return json({ totals: t, top, days, referrals: refs[0], favorites: favs[0].n });
});
