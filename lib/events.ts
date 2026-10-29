import { sql, hasDb } from "./db";
import { signedUrl } from "./storage";

export const BE_WHATSAPP = () => (process.env.NEXT_PUBLIC_BE_WHATSAPP || "5588994547613").replace(/\D/g, "");
export const BE_INSTAGRAM = () => process.env.NEXT_PUBLIC_BE_INSTAGRAM || "bestudioaudiovisual";
export const SITE_URL = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://memorias.bestudiomkt.com.br").replace(/\/$/, "");

export const DEFAULT_CAPTION = (names: string) =>
  `Nosso dia, guardado para sempre. 🤎\n${names} · cada detalhe registrado com carinho pela @${BE_INSTAGRAM()}.`;

/** Slugs que não podem ser usados por eventos (são rotas do sistema). */
export const RESERVED_SLUGS = new Set(["admin", "api", "r", "demo", "_next", "fonts", "brand", "favicon.ico", "manifest.webmanifest", "sw.js", "robots.txt", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]);

export type EventRow = {
  id: string; slug: string; title: string; client_names: string; event_type: string; event_date: Date; location: string | null;
  theme: string; accent_color: string; status: string; password_hash: string | null; expires_at: Date | null;
  cover_file_id: string | null; polaroid_file_id: string | null; final_file_id: string | null; hero_file_ids: string[];
  reels_file_id: string | null; film_file_id: string | null; soundtrack_key: string | null; letter: string | null;
  testimonial: string | null; share_caption: string | null; drive_folder_id: string | null; drive_synced_at: Date | null;
  manual_order: boolean; storage_bytes: string; created_at: Date; updated_at: Date; published_at: Date | null;
};

export async function getEventBySlug(slug: string) {
  if (!hasDb()) return null;
  const rows = await sql()<EventRow[]>`select * from events where slug = ${slug} limit 1`;
  return rows[0] ?? null;
}

export function isExpired(ev: Pick<EventRow, "status" | "expires_at">) {
  return ev.status === "expirado" || ev.status === "arquivado" || (!!ev.expires_at && ev.expires_at < new Date());
}

export interface ClientFile {
  id: string; kind: "video" | "foto"; chapterId: string | null; name: string;
  thumb: string; poster: string; web?: string; lite?: string;
  size: number; duration?: number; recordedAt?: string; timeKnown: boolean; order: number;
  highlight: boolean; tags: string[]; w?: number; h?: number; ready: boolean;
}
export interface ClientChapter {
  id: string; parentId: string | null; name: string; position: number; description?: string; cover?: string; preview?: string;
}
export interface RawFolder { name: string; folder?: string; size: number; files: { name: string; size: number; kind: string; sub?: string; url: string }[] }
/** Link de download direto do Drive (o arquivo precisa estar compartilhado como "qualquer pessoa com o link"). */
export const driveDownloadUrl = (id: string) => `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;

export interface StoryData {
  event: { id: string; slug: string; title: string; clientNames: string; eventDate: string; location?: string; shareCaption: string; letter?: string; accent: string; theme: string; expiresAt?: string };
  files: ClientFile[];
  chapters: ClientChapter[];
  heroSlides: string[];
  raw: RawFolder[];
  media: Record<string, string | undefined>;
  links: { whatsapp: string; instagram: string; site: string };
  favorites: string[];
  reactions: Record<string, string[]>;
  preview?: boolean;
}

/** Monta os dados da página do cliente, com URLs assinadas que expiram. */
export async function buildStoryData(ev: EventRow, visitorId: string | null, opts: { preview?: boolean } = {}): Promise<StoryData> {
  const db = sql();
  const [chRows, fileRows] = await Promise.all([
    db`select * from chapters where event_id = ${ev.id} order by position, name`,
    db`select f.* from files f left join chapters c on c.id = f.chapter_id
       where f.event_id = ${ev.id} and coalesce(c.is_internal, false) = false and coalesce(c.is_raw, false) = false
       order by f.position, f.recorded_at nulls last, f.original_name`,
  ]);
  // capítulos internos (e seus filhos) ficam de fora
  const hidden = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of chRows) if (!hidden.has(c.id) && (c.is_internal || c.is_raw || (c.parent_id && hidden.has(c.parent_id)))) { hidden.add(c.id); changed = true; }
  }

  const sign = (k: string | null) => signedUrl(k);
  const all = await Promise.all(
    fileRows.filter((f) => !f.chapter_id || !hidden.has(f.chapter_id)).map(async (f, i) => {
      const thumb = (await sign(f.thumb_key)) ?? "";
      return {
        row: f,
        client: {
          id: f.id, kind: f.kind, chapterId: f.chapter_id, name: f.display_name,
          thumb, poster: (await sign(f.poster_key)) ?? thumb,
          web: await sign(f.web_key), lite: (await sign(f.lite_key)) ?? (await sign(f.web_key)),
          size: Number(f.size_bytes), duration: f.duration_sec ? Number(f.duration_sec) : undefined,
          recordedAt: f.recorded_at_known ? f.recorded_at?.toISOString() : undefined, timeKnown: !!f.recorded_at_known, order: i,
          highlight: f.is_highlight, tags: f.tags ?? [], w: f.width ?? undefined, h: f.height ?? undefined,
          ready: f.processing === "pronto",
        } as ClientFile,
      };
    }),
  );
  const byId = new Map(all.map((x) => [x.row.id, x]));
  // Galeria: só arquivos prontos e que não são o Reels
  const files = all.filter((x) => x.client.ready && !x.row.is_reels).map((x) => x.client);

  const visibleChapters = chRows.filter((c) => !hidden.has(c.id));
  const chapters: ClientChapter[] = visibleChapters.map((c) => {
    const ids = descendants(c.id, visibleChapters);
    const own = files.filter((f) => f.chapterId && ids.has(f.chapterId));
    return {
      id: c.id, parentId: c.parent_id, name: c.name, position: c.position, description: c.description ?? undefined,
      cover: (c.cover_file_id && byId.get(c.cover_file_id)?.client.thumb) || own.find((f) => f.kind === "foto")?.thumb || own[0]?.thumb,
      preview: own.find((f) => f.kind === "video")?.lite,
    };
  }).filter((c) => files.some((f) => f.chapterId && descendants(c.id, visibleChapters).has(f.chapterId)));

  const photo = (id: string | null) => (id ? byId.get(id)?.client.poster : undefined);
  const firstPhoto = files.find((f) => f.kind === "foto")?.poster;
  const cover = photo(ev.cover_file_id) ?? files.find((f) => f.highlight && f.kind === "foto")?.poster ?? firstPhoto ?? "";
  const reels = ev.reels_file_id ? byId.get(ev.reels_file_id)?.client : undefined;
  const film = ev.film_file_id ? byId.get(ev.film_file_id)?.client : reels;
  const heroIds = (ev.hero_file_ids ?? []).length
    ? ev.hero_file_ids
    : files.filter((f) => f.highlight && f.kind === "foto").slice(0, 9).map((f) => f.id);
  const heroSlides = [cover, ...heroIds.map((id) => photo(id)).filter((u): u is string => !!u && u !== cover)];

  // ── Arquivos brutos: ficam no Drive; o cliente baixa direto de lá (sem abrir o Drive) ──
  const rawRoots = chRows.filter((c) => c.is_raw && !c.is_internal && !(c.parent_id && hidden.has(c.parent_id)));
  const raw: RawFolder[] = [];
  for (const root of rawRoots) {
    const ids = [...descendants(root.id, chRows)].filter((id) => !chRows.find((c) => c.id === id)?.is_internal);
    const rows = await db`select f.original_name, f.size_bytes, f.kind, f.drive_file_id, f.chapter_id from files f
                          where f.chapter_id = any(${ids}::uuid[]) and f.drive_file_id is not null order by f.original_name`;
    const files = rows.filter((r) => !String(r.drive_file_id).includes(":")).map((r) => ({
      name: r.original_name as string, size: Number(r.size_bytes), kind: r.kind as string,
      sub: r.chapter_id !== root.id ? (chRows.find((c) => c.id === r.chapter_id)?.name as string | undefined) : undefined,
      url: driveDownloadUrl(r.drive_file_id as string),
    }));
    if (files.length) raw.push({ name: root.name, folder: root.drive_folder_id && !String(root.drive_folder_id).includes(":") ? `https://drive.google.com/drive/folders/${root.drive_folder_id}` : undefined, size: files.reduce((a, f) => a + f.size, 0), files });
  }

  let favorites: string[] = [];
  const reactions: Record<string, string[]> = {};
  if (visitorId) {
    favorites = (await db`select fv.file_id from favorites fv join files f on f.id = fv.file_id where f.event_id = ${ev.id} and fv.visitor_id = ${visitorId}`).map((r) => r.file_id);
    for (const r of await db`select r.file_id, r.emoji from reactions r join files f on f.id = r.file_id where f.event_id = ${ev.id} and r.visitor_id = ${visitorId}`)
      (reactions[r.file_id] ||= []).push(r.emoji);
  }

  return {
    event: {
      id: ev.id, slug: ev.slug, title: ev.title, clientNames: ev.client_names,
      eventDate: ev.event_date.toISOString().slice(0, 10), location: ev.location ?? undefined,
      shareCaption: ev.share_caption || DEFAULT_CAPTION(ev.client_names), letter: ev.letter ?? undefined,
      accent: ev.accent_color, theme: ev.theme, expiresAt: ev.expires_at ? new Date(ev.expires_at).toISOString() : undefined,
    },
    files, chapters, heroSlides, raw,
    media: {
      logo: "/brand/be-logo-cream.png",
      cover,
      polaroid: photo(ev.polaroid_file_id) ?? cover,
      final: photo(ev.final_file_id) ?? files.filter((f) => f.kind === "foto" && f.highlight).at(-1)?.poster ?? files.filter((f) => f.kind === "foto").at(-1)?.poster ?? cover,
      film: film?.web ?? film?.lite,
      story: reels?.lite ?? reels?.web,
      "story-poster": reels?.poster,
      soundtrack: (await signedUrl(ev.soundtrack_key, { expires: 86400 })) ?? undefined,
      "soundtrack-start": ev.soundtrack_key ? String(Number((ev as unknown as { soundtrack_start_sec?: string }).soundtrack_start_sec ?? 0)) : undefined,
    },
    links: { whatsapp: BE_WHATSAPP(), instagram: BE_INSTAGRAM(), site: SITE_URL() },
    favorites, reactions, preview: opts.preview,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function descendants(id: string, chapters: readonly any[]) {
  const s = new Set([id]);
  let added = true;
  while (added) {
    added = false;
    for (const c of chapters) if (c.parent_id && s.has(c.parent_id) && !s.has(c.id)) { s.add(c.id); added = true; }
  }
  return s;
}
