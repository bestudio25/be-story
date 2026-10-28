/**
 * BE STORY — worker de processamento.
 * Roda no GitHub Actions (ou em qualquer máquina com ffmpeg): consome a fila "jobs" do Postgres.
 *
 *   process_file   → baixa o original (Drive/upload), gera miniatura, poster, MP4 1080p e 720p e guarda uma cópia do original no R2
 *   poster_frame   → regera o poster de um vídeo no segundo escolhido pelo admin
 *   build_zip      → monta o ZIP com os originais direto no R2 (sem disco) e avisa por e-mail
 *   purge_event    → apaga tudo do evento no R2 (originais continuam no Drive)
 *   reprocess_event→ recoloca todos os arquivos do evento na fila
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import sharp from "sharp";
import exifReader from "exif-reader";
import archiver from "archiver";
import { Upload } from "@aws-sdk/lib-storage";
import { sql, enqueueJob } from "../lib/db";
import * as storage from "../lib/storage";
import { driveDownload } from "../lib/drive";
import { sendEmail } from "../lib/notify";

const run = promisify(execFile);
const TMP = process.env.WORKER_TMP || path.join(os.tmpdir(), "be-story-worker");
const MAX_MINUTES = Number(process.env.WORKER_MAX_MINUTES || 330);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 2);
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://memorias.bestudiomkt.com.br").replace(/\/$/, "");
const started = Date.now();
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

let HAS_ZSCALE = false;
let HAS_EXIFTOOL = false;
let HAS_HEIF = false;

async function main() {
  await fsp.mkdir(TMP, { recursive: true });
  HAS_ZSCALE = (await run("ffmpeg", ["-hide_banner", "-filters"]).then((r) => r.stdout).catch(() => "")).includes("zscale");
  HAS_EXIFTOOL = await run("exiftool", ["-ver"]).then(() => true).catch(() => false);
  HAS_HEIF = await run("heif-convert", ["--version"]).then(() => true).catch((e) => !!e?.stdout || !!e?.stderr);
  log(`worker iniciado · zscale=${HAS_ZSCALE} exiftool=${HAS_EXIFTOOL} heif=${HAS_HEIF} · storage=${storage.driver()}`);

  const db = sql();
  // devolve à fila jobs que ficaram presos (worker anterior caiu)
  await db`update jobs set status = 'pendente' where status = 'processando' and updated_at < now() - interval '90 minutes'`;
  // eventos vencidos → expirado + limpeza do R2
  const expired = await db`update events set status = 'expirado', updated_at = now()
                           where status = 'ativo' and expires_at is not null and expires_at < now() returning id`;
  for (const e of expired) await enqueueJob("purge_event", { eventId: e.id }, { dedupe: true });

  const touched = new Set<string>();
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while ((Date.now() - started) / 60000 < MAX_MINUTES) {
      const job = await claim();
      if (!job) return;
      const t0 = Date.now();
      try {
        const ev = await handle(job.kind, job.payload);
        if (ev) touched.add(ev);
        await db`update jobs set status = 'pronto', updated_at = now(), last_error = null where id = ${job.id}`;
        log(`✓ ${job.kind} #${job.id} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      } catch (e) {
        const msg = (e as Error)?.stack ?? String(e);
        log(`✗ ${job.kind} #${job.id}: ${msg}`);
        const retry = job.attempts < 3;
        await db`update jobs set status = ${retry ? "pendente" : "erro"}, last_error = ${msg.slice(0, 4000)}, updated_at = now(),
                 run_after = now() + ${`${job.attempts * 2} minutes`}::interval where id = ${job.id}`;
        if (!retry && job.kind === "process_file")
          await db`update files set processing = 'erro', processing_error = ${(e as Error)?.message?.slice(0, 500) ?? "erro"} where id = ${job.payload.fileId}`;
        if (!retry && job.kind === "build_zip") await db`update zip_requests set status = 'erro' where id = ${job.payload.zipId}`;
      }
    }
  });
  await Promise.all(workers);
  for (const id of touched) await finalizeEvent(id);
  const [left] = await db`select count(*)::int n from jobs where status = 'pendente'`;
  log(`fim · pendentes: ${left.n}`);
  await db.end();
}

async function claim() {
  const [j] = await sql()`
    update jobs set status = 'processando', attempts = attempts + 1, updated_at = now()
    where id = (select id from jobs where status = 'pendente' and run_after <= now()
                order by case kind when 'build_zip' then 0 when 'poster_frame' then 1 when 'purge_event' then 2 else 3 end, id
                for update skip locked limit 1)
    returning *`;
  return j as { id: number; kind: string; payload: Record<string, string>; attempts: number } | undefined;
}

async function handle(kind: string, p: Record<string, string>): Promise<string | void> {
  switch (kind) {
    case "process_file": return processFile(p.fileId);
    case "poster_frame": return posterFrame(p.fileId);
    case "build_zip": return buildZip(p.zipId);
    case "purge_event": return purgeEvent(p.eventId, !!p.deleteRow);
    case "reprocess_event": {
      for (const f of await sql()`select id from files where event_id = ${p.eventId}`) await enqueueJob("process_file", { fileId: f.id }, { dedupe: true });
      return;
    }
    default: throw new Error(`job desconhecido: ${kind}`);
  }
}

// ── Processamento de arquivos ─────────────────────────────────────
type FileRow = {
  id: string; event_id: string; kind: "video" | "foto"; original_name: string; drive_file_id: string | null; master_key: string | null;
  poster_time_sec: string | null; recorded_at: Date | null; is_reels: boolean;
};

async function fetchSource(f: FileRow, dir: string) {
  const ext = (f.original_name.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  const src = path.join(dir, "source" + ext);
  if (f.master_key) await storage.downloadTo(f.master_key, src);
  else if (f.drive_file_id?.startsWith("local:")) await fsp.copyFile(path.resolve(process.env.LOCAL_SOURCE_DIR || ".", f.drive_file_id.slice(6)), src);
  else if (f.drive_file_id) await driveDownload(f.drive_file_id, src);
  else throw new Error("Arquivo sem origem");
  return { src, ext };
}

async function inInternalChapter(fileId: string) {
  const [r] = await sql()`
    with recursive up as (
      select c.id, c.parent_id, (c.is_internal or c.is_raw) as is_internal from chapters c join files f on f.chapter_id = c.id where f.id = ${fileId}
      union all
      select c.id, c.parent_id, (c.is_internal or c.is_raw) as is_internal from chapters c join up on c.id = up.parent_id
    ) select coalesce(bool_or(is_internal), false) as hidden from up`;
  return !!r?.hidden;
}

async function processFile(fileId: string) {
  const db = sql();
  const [f] = (await db`select * from files where id = ${fileId}`) as unknown as FileRow[];
  if (!f) return;
  // Capítulos internos (ex.: "Arquivos brutos") não são processados; se o capítulo voltar a ficar visível, o painel coloca na fila de novo.
  if (await inInternalChapter(fileId)) return;
  await db`update files set processing = 'processando' where id = ${fileId}`;
  const dir = await fsp.mkdtemp(path.join(TMP, "f-"));
  try {
    const { src, ext } = await fetchSource(f, dir);
    const meta = await readMeta(src);
    const k = (name: string) => storage.keys.derived(f.event_id, f.id, name);
    let bytes = 0;
    const put = async (key: string, file: string, type: string) => { bytes += await storage.putFile(key, file, type); return key; };
    const update: Record<string, unknown> = {};

    if (f.kind === "foto") {
      let input = src;
      if (/\.(heic|heif)$/i.test(ext)) {
        input = path.join(dir, "conv.jpg");
        if (HAS_HEIF) await run("heif-convert", ["-q", "95", src, input]);
        else await sharp(src).jpeg({ quality: 95 }).toFile(input); // pode falhar sem libheif
      }
      const img = sharp(input, { failOn: "none" }).rotate();
      const m = await img.metadata();
      const w = m.autoOrient?.width ?? m.width ?? 0, h = m.autoOrient?.height ?? m.height ?? 0;
      await img.clone().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 74, progressive: true, mozjpeg: true }).toFile(path.join(dir, "thumb.jpg"));
      await img.clone().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, progressive: true, mozjpeg: true }).toFile(path.join(dir, "poster.jpg"));
      Object.assign(update, {
        thumb_key: await put(k("thumb.jpg"), path.join(dir, "thumb.jpg"), "image/jpeg"),
        poster_key: await put(k("poster.jpg"), path.join(dir, "poster.jpg"), "image/jpeg"),
        width: w || null, height: h || null,
      });
    } else {
      const v = await probe(src);
      const posterAt = f.poster_time_sec != null ? Number(f.poster_time_sec) : Math.min(1.5, (v.duration || 2) * 0.15);
      await makePoster(src, v, posterAt, dir);
      const short = Math.min(v.width, v.height) || 1080;
      const web = path.join(dir, "web.mp4"), lite = path.join(dir, "lite.mp4");
      await transcode(src, v, web, Math.min(1080, short), 21, "8M");
      await transcode(src, v, lite, Math.min(720, short), 24, "3.5M");
      Object.assign(update, {
        thumb_key: await put(k("thumb.jpg"), path.join(dir, "thumb.jpg"), "image/jpeg"),
        poster_key: await put(k("poster.jpg"), path.join(dir, "poster.jpg"), "image/jpeg"),
        web_key: await put(k("web.mp4"), web, "video/mp4"),
        lite_key: await put(k("lite.mp4"), lite, "video/mp4"),
        width: v.dispW || null, height: v.dispH || null, duration_sec: v.duration || null, poster_time_sec: posterAt,
      });
    }
    // cópia do original para "Baixar original" e ZIP (se veio do Drive)
    if (!f.master_key) {
      update.master_key = await put(storage.keys.master(f.event_id, f.id, ext), src, mimeOf(ext));
    } else {
      bytes += (await fsp.stat(src)).size;
    }
    if (meta.date) Object.assign(update, { recorded_at: meta.date, recorded_at_known: true });
    Object.assign(update, { processing: "pronto", processing_error: null, web_bytes: bytes, size_bytes: (await fsp.stat(src)).size });
    await db`update files set ${db(update as never)} where id = ${fileId}`;
    return f.event_id;
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function posterFrame(fileId: string) {
  const db = sql();
  const [f] = (await db`select * from files where id = ${fileId}`) as unknown as (FileRow & { lite_key: string; web_key: string })[];
  if (!f || f.kind !== "video") return;
  const dir = await fsp.mkdtemp(path.join(TMP, "p-"));
  try {
    const src = path.join(dir, "src.mp4");
    await storage.downloadTo(f.web_key ?? f.lite_key, src); // usa a versão web (menor que o original)
    const v = await probe(src);
    await makePoster(src, v, Number(f.poster_time_sec ?? 1), dir);
    const k = (n: string) => storage.keys.derived(f.event_id, f.id, n);
    await storage.putFile(k("thumb.jpg"), path.join(dir, "thumb.jpg"), "image/jpeg");
    await storage.putFile(k("poster.jpg"), path.join(dir, "poster.jpg"), "image/jpeg");
    return f.event_id;
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

type Probe = { width: number; height: number; dispW: number; dispH: number; duration: number; rotation: number; hdr: boolean; hasAudio: boolean };

async function probe(file: string): Promise<Probe> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { maxBuffer: 20 * 1024 * 1024 });
  const j = JSON.parse(stdout);
  const vs = j.streams.find((s: { codec_type: string }) => s.codec_type === "video") ?? {};
  const rot = Number(vs.tags?.rotate ?? vs.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0);
  const w = Number(vs.width || 0), h = Number(vs.height || 0);
  const swap = Math.abs(rot) % 180 === 90;
  return {
    width: w, height: h, dispW: swap ? h : w, dispH: swap ? w : h,
    duration: Number(j.format?.duration || vs.duration || 0), rotation: rot,
    hdr: ["arib-std-b67", "smpte2084"].includes(vs.color_transfer),
    hasAudio: j.streams.some((s: { codec_type: string }) => s.codec_type === "audio"),
  };
}

function toneMap(v: Probe) {
  return v.hdr && HAS_ZSCALE
    ? "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,"
    : "";
}

async function makePoster(src: string, v: Probe, at: number, dir: string) {
  const t = Math.max(0, Math.min(at, Math.max(0, v.duration - 0.1)));
  const vf = `${toneMap(v)}scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))',format=yuvj420p`;
  await run("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", src, "-frames:v", "1", "-vf", vf, "-q:v", "3", path.join(dir, "poster.jpg")]);
  await sharp(path.join(dir, "poster.jpg")).resize({ width: 640, height: 640, fit: "inside" }).jpeg({ quality: 74, progressive: true, mozjpeg: true }).toFile(path.join(dir, "thumb.jpg"));
}

/** H.264 + AAC, faststart (toca enquanto baixa), lado menor = `short` px, sem aumentar vídeos pequenos. */
async function transcode(src: string, v: Probe, out: string, short: number, crf: number, maxrate: string) {
  const portrait = v.dispH > v.dispW;
  const scale = portrait ? `scale=${short}:-2` : `scale=-2:${short}`;
  const args = ["-y", "-v", "error", "-i", src, "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", `${toneMap(v)}${scale},format=yuv420p`,
    "-c:v", "libx264", "-preset", process.env.X264_PRESET || "veryfast", "-crf", String(crf), "-maxrate", maxrate, "-bufsize", maxrate.replace(/M$/, "") + "M",
    "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    ...(v.hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : ["-an"]), out];
  await run("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });
}

/** Data/hora de gravação dos metadados (EXIF / QuickTime), em horário de Fortaleza quando não há fuso. */
async function readMeta(file: string): Promise<{ date: Date | null }> {
  const parse = (s?: string) => {
    if (!s) return null;
    const m = s.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(Z|[+\-]\d{2}:?\d{2})?/);
    if (!m || m[1] === "0000") return null;
    const tz = m[7] ? (m[7] === "Z" ? "Z" : m[7].replace(/^([+\-]\d{2})(\d{2})$/, "$1:$2")) : "-03:00";
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tz}`);
    return isNaN(+d) || d.getFullYear() < 2000 ? null : d;
  };
  if (HAS_EXIFTOOL) {
    try {
      const { stdout } = await run("exiftool", ["-json", "-api", "QuickTimeUTC=1", "-CreationDate", "-DateTimeOriginal", "-SubSecDateTimeOriginal", "-CreateDate", "-MediaCreateDate", file]);
      const j = JSON.parse(stdout)[0] ?? {};
      for (const k of ["CreationDate", "SubSecDateTimeOriginal", "DateTimeOriginal", "CreateDate", "MediaCreateDate"]) {
        const d = parse(String(j[k] ?? ""));
        if (d) return { date: d };
      }
    } catch { /* segue para o ffprobe */ }
  }
  // fotos: EXIF lido pelo sharp (não depende do exiftool)
  try {
    const m = await sharp(file, { failOn: "none" }).metadata();
    if (m.exif) {
      const ex = exifReader(m.exif) as { Photo?: { DateTimeOriginal?: Date; OffsetTimeOriginal?: string }; Image?: { DateTime?: Date } };
      const raw = ex.Photo?.DateTimeOriginal ?? ex.Image?.DateTime;
      if (raw instanceof Date && !isNaN(+raw)) {
        const iso = raw.toISOString().slice(0, 19);
        const tz = ex.Photo?.OffsetTimeOriginal?.match(/^[+\-]\d{2}:\d{2}$/) ? ex.Photo.OffsetTimeOriginal : "-03:00";
        const d = new Date(iso + tz);
        if (d.getFullYear() > 2000) return { date: d };
      }
    }
  } catch { /* não é imagem ou sem EXIF */ }
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
    const j = JSON.parse(stdout);
    const tags = { ...(j.format?.tags ?? {}), ...(j.streams?.[0]?.tags ?? {}) };
    const s = tags["com.apple.quicktime.creationdate"] ?? tags.creation_time;
    if (s) {
      const d = s.includes("T") && /Z|[+\-]\d{2}:?\d{2}$/.test(s) ? new Date(s) : parse(s);
      if (d && !isNaN(+d) && d.getFullYear() > 2000) return { date: d };
    }
  } catch { /* sem metadados */ }
  return { date: null };
}

const mimeOf = (ext: string) =>
  ({ ".mov": "video/quicktime", ".mp4": "video/mp4", ".m4v": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".heic": "image/heic", ".heif": "image/heif", ".webp": "image/webp" } as Record<string, string>)[ext] ?? "application/octet-stream";

// ── ZIP ───────────────────────────────────────────────────────────
async function buildZip(zipId: string) {
  const db = sql();
  const [z] = await db`select z.*, e.client_names, e.slug, e.id as ev from zip_requests z join events e on e.id = z.event_id where z.id = ${zipId}`;
  if (!z || z.status === "pronto") return;
  await db`update zip_requests set status = 'processando', progress = 1 where id = ${zipId}`;
  const files = await db`
    select f.id, f.display_name, f.original_name, f.master_key, f.size_bytes, c.name as chapter, p.name as parent
    from files f left join chapters c on c.id = f.chapter_id left join chapters p on p.id = c.parent_id
    where f.id = any(${z.file_ids}::uuid[]) and f.master_key is not null order by f.position`;
  const total = files.reduce((s, f) => s + Number(f.size_bytes), 0) || 1;
  const key = storage.keys.zip(z.ev, zipId);
  const archive = archiver("zip", { store: true, forceZip64: total > 3.5e9 });
  const pass = new PassThrough({ highWaterMark: 8 * 1024 * 1024 });
  archive.pipe(pass);

  let done = 0, lastPct = 0;
  archive.on("progress", async (p) => {
    const pct = Math.min(98, Math.floor((p.fs.processedBytes / total) * 100));
    if (pct >= lastPct + 3) { lastPct = pct; await db`update zip_requests set progress = ${pct} where id = ${zipId}`.catch(() => {}); }
  });

  let uploadDone: Promise<unknown>;
  let localFile: string | null = null;
  if (storage.driver() === "r2") {
    uploadDone = new Upload({ client: storage.r2(), params: { Bucket: process.env.R2_BUCKET || "be-story-media", Key: key, Body: pass, ContentType: "application/zip" }, partSize: 64 * 1024 * 1024, queueSize: 3 }).done();
  } else {
    localFile = path.join(TMP, `${zipId}.zip`);
    uploadDone = new Promise<void>((ok, fail) => { pass.pipe(fs.createWriteStream(localFile!)).on("finish", () => ok()).on("error", fail); });
  }

  const used = new Set<string>();
  for (const f of files) {
    const ext = (f.original_name.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
    const folder = [f.parent, f.chapter].filter(Boolean).map((s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").trim()).join("/");
    const base = String(f.display_name).replace(/[\\/:*?"<>|]+/g, " ").trim() || "arquivo";
    let name = `${folder ? folder + "/" : ""}${base}${ext}`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${folder ? folder + "/" : ""}${base} (${i})${ext}`;
    used.add(name.toLowerCase());
    const stream = await storage.readStream(f.master_key);
    archive.append(stream, { name, store: true });
    await new Promise<void>((ok) => archive.once("entry", () => ok()));
    done++;
  }
  await archive.finalize();
  await uploadDone;
  if (localFile) { await storage.putFile(key, localFile, "application/zip"); await fsp.rm(localFile, { force: true }); }
  const size = await storage.size(key);
  const [upd] = await db`update zip_requests set status = 'pronto', progress = 100, zip_key = ${key}, size_bytes = ${size}, ready_at = now()
                         where id = ${zipId} returning notify_email`;
  log(`ZIP ${zipId}: ${done} arquivos, ${(size / 1e9).toFixed(2)} GB`);
  if (upd?.notify_email) {
    const link = `${SITE}/${z.slug}`;
    const ok = await sendEmail(upd.notify_email, `Seu download de ${z.client_names} está pronto 🤎`,
      `Oi! O ZIP "${z.label}" (${done} arquivos) já está pronto.\n\nAbra ${link}, vá em "Baixar tudo" e toque em "Baixar ZIP".\nO arquivo fica disponível por 7 dias.\n\nCom carinho,\nBE Studio`).catch(() => false);
    if (ok) await db`update zip_requests set notified_at = now() where id = ${zipId}`;
  }
  return z.ev;
}

// ── Limpeza ───────────────────────────────────────────────────────
async function purgeEvent(eventId: string, deleteRow: boolean) {
  const db = sql();
  let freed = 0;
  if (deleteRow) {
    freed = await storage.deletePrefix(`events/${eventId}/`);
    await db`delete from events where id = ${eventId}`;
  } else {
    // versões web e ZIPs saem; cópias de originais do Drive saem; originais enviados direto ao painel FICAM (são a única cópia)
    freed += await storage.deletePrefix(`events/${eventId}/web/`);
    freed += await storage.deletePrefix(`events/${eventId}/zips/`);
    for (const f of await db`select master_key from files where event_id = ${eventId} and master_key is not null and drive_file_id not like 'upload:%'`)
      freed += await storage.deletePrefix(f.master_key);
    await db`update files set thumb_key = null, poster_key = null, web_key = null, lite_key = null,
             master_key = case when drive_file_id like 'upload:%' then master_key else null end,
             web_bytes = case when drive_file_id like 'upload:%' then size_bytes else 0 end, processing = 'pendente'
             where event_id = ${eventId}`;
    await db`update zip_requests set status = 'erro', zip_key = null where event_id = ${eventId}`;
    await db`update events set storage_bytes = (select coalesce(sum(web_bytes),0) from files where event_id = ${eventId}) where id = ${eventId}`;
  }
  log(`evento ${eventId}: ${(freed / 1e9).toFixed(2)} GB liberados`);
}

/** Depois de processar: ordena pela hora de gravação (se o admin não reordenou) e atualiza o espaço usado. */
async function finalizeEvent(eventId: string) {
  const db = sql();
  const [ev] = await db`select manual_order from events where id = ${eventId}`;
  if (!ev) return;
  if (!ev.manual_order)
    await db`update files f set position = s.rn from (
               select id, row_number() over (order by recorded_at nulls last, original_name) as rn from files where event_id = ${eventId}) s
             where f.id = s.id`;
  await db`update events set storage_bytes = (select coalesce(sum(web_bytes),0) from files where event_id = ${eventId})
             + (select coalesce(sum(size_bytes),0) from zip_requests where event_id = ${eventId} and status = 'pronto') where id = ${eventId}`;
  // ZIPs com mais de 7 dias saem do R2
  for (const z of await db`select id, zip_key from zip_requests where event_id = ${eventId} and status = 'pronto' and ready_at < now() - interval '7 days'`) {
    await storage.deletePrefix(z.zip_key);
    await db`update zip_requests set status = 'erro', zip_key = null where id = ${z.id}`;
  }
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
