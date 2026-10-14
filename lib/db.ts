import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

export const hasDb = () => !!process.env.DATABASE_URL;

export function sql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada");
  if (!global.__sql) {
    global.__sql = postgres(process.env.DATABASE_URL, {
      max: Number(process.env.DB_POOL || 5),
      idle_timeout: 20,
      prepare: false, // compatível com pooler do Neon/Supabase
      onnotice: () => {},
    });
  }
  return global.__sql;
}

export async function enqueueJob(kind: string, payload: Record<string, unknown>, opts: { dedupe?: boolean } = {}) {
  const db = sql();
  if (opts.dedupe) {
    const [dup] = await db`select id from jobs where kind = ${kind} and payload = ${db.json(payload as never)} and status in ('pendente','processando') limit 1`;
    if (dup) return;
  }
  await db`insert into jobs (kind, payload) values (${kind}, ${db.json(payload as never)})`;
}

/** Acorda o worker no GitHub Actions (se configurado). Sem token, o agendamento a cada 10 min cobre. */
export async function wakeWorker(reason: string) {
  const repo = process.env.GITHUB_REPO; // "usuario/be-story"
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return false;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "be-story" },
      body: JSON.stringify({ event_type: "be-story-jobs", client_payload: { reason } }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function track(
  eventId: string,
  kind: string,
  opts: { fileId?: string | null; visitorId?: string | null; value?: number; meta?: Record<string, unknown> } = {},
) {
  if (!hasDb()) return;
  const db = sql();
  await db`insert into analytics (event_id, file_id, visitor_id, kind, value, meta)
           values (${eventId}, ${opts.fileId ?? null}, ${opts.visitorId ?? null}, ${kind},
                   ${opts.value ?? null}, ${opts.meta ? db.json(opts.meta as never) : null})`;
}
