import { appSecret } from "./secret";
/**
 * Armazenamento de mídia: Cloudflare R2 (produção) ou pasta local (desenvolvimento/testes).
 * Tudo é privado; o cliente só recebe URLs assinadas que expiram.
 */
import {
  S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand, ListPartsCommand, ListObjectsV2Command, DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const driver = () => (process.env.STORAGE_DRIVER || (process.env.R2_ACCOUNT_ID ? "r2" : "local")) as "r2" | "local";
const bucket = () => process.env.R2_BUCKET || "be-story-media";
const ttl = () => Number(process.env.SIGNED_URL_TTL || 6 * 3600);
const localRoot = () => path.resolve(process.env.STORAGE_LOCAL_DIR || ".media");
const secret = () => appSecret();

let s3: S3Client | null = null;
export function r2() {
  if (!s3)
    s3 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    });
  return s3;
}

/** Convenção de chaves */
export const keys = {
  master: (ev: string, f: string, ext: string) => `events/${ev}/master/${f}${ext}`,
  derived: (ev: string, f: string, name: string) => `events/${ev}/web/${f}/${name}`,
  zip: (ev: string, id: string) => `events/${ev}/zips/${id}.zip`,
  upload: (ev: string, id: string, ext: string) => `events/${ev}/master/${id}${ext}`,
};

// ── URLs assinadas ────────────────────────────────────────────────
const localSig = (key: string, exp: number, dl: string) =>
  createHmac("sha256", secret()).update(`${key}|${exp}|${dl}`).digest("base64url").slice(0, 32);

export async function signedUrl(key: string | null | undefined, opts: { download?: string; expires?: number } = {}) {
  if (!key) return undefined;
  const expires = opts.expires ?? ttl();
  if (driver() === "local") {
    const exp = Math.floor(Date.now() / 1000) + expires;
    const dl = opts.download || "";
    const q = new URLSearchParams({ e: String(exp), s: localSig(key, exp, dl) });
    if (dl) q.set("dl", dl);
    return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}?${q}`;
  }
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: opts.download ? `attachment; filename*=UTF-8''${encodeURIComponent(opts.download)}` : undefined,
    }),
    { expiresIn: expires },
  );
}

export function verifyLocalSig(key: string, exp: string | null, sig: string | null, dl: string) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const a = Buffer.from(localSig(key, Number(exp), dl));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function localPath(key: string) {
  const p = path.resolve(localRoot(), key);
  if (!p.startsWith(localRoot() + path.sep)) throw new Error("chave inválida");
  return p;
}

// ── Escrita / leitura ─────────────────────────────────────────────
export async function putFile(key: string, filePath: string, contentType: string) {
  if (driver() === "local") {
    const dst = localPath(key);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.copyFile(filePath, dst);
    return (await fsp.stat(dst)).size;
  }
  const size = (await fsp.stat(filePath)).size;
  await new Upload({
    client: r2(),
    params: { Bucket: bucket(), Key: key, Body: fs.createReadStream(filePath), ContentType: contentType },
    partSize: 32 * 1024 * 1024,
    queueSize: 4,
  }).done();
  return size;
}

export async function putBuffer(key: string, body: Buffer | string, contentType: string) {
  if (driver() === "local") {
    const dst = localPath(key);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.writeFile(dst, body);
    return;
  }
  await r2().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function downloadTo(key: string, filePath: string) {
  if (driver() === "local") return fsp.copyFile(localPath(key), filePath);
  const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  await new Promise<void>((ok, fail) => {
    const w = fs.createWriteStream(filePath);
    (res.Body as Readable).pipe(w).on("finish", () => ok()).on("error", fail);
  });
}

export async function readStream(key: string): Promise<Readable> {
  if (driver() === "local") return fs.createReadStream(localPath(key));
  const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return res.Body as Readable;
}

export async function size(key: string) {
  if (driver() === "local") return (await fsp.stat(localPath(key))).size;
  return (await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))).ContentLength ?? 0;
}

/** Apaga tudo sob um prefixo. Retorna bytes liberados. */
export async function deletePrefix(prefix: string) {
  if (driver() === "local") {
    const dir = localPath(prefix.replace(/\/$/, ""));
    let freed = 0;
    const walk = async (d: string) => {
      for (const e of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else freed += (await fsp.stat(p)).size;
      }
    };
    await walk(dir);
    await fsp.rm(dir, { recursive: true, force: true });
    return freed;
  }
  let token: string | undefined;
  let freed = 0;
  do {
    const res = await r2().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }));
    const objs = res.Contents ?? [];
    freed += objs.reduce((s, o) => s + (o.Size ?? 0), 0);
    if (objs.length)
      await r2().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: objs.map((o) => ({ Key: o.Key! })) } }));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return freed;
}

// ── Upload multipart direto do navegador (retomável) ──────────────
export const PART_SIZE = 32 * 1024 * 1024;

export async function createMultipart(key: string, contentType: string) {
  if (driver() === "local") return `local-${Date.now()}`;
  const res = await r2().send(new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }));
  return res.UploadId!;
}

export async function signPart(key: string, uploadId: string, partNumber: number) {
  if (driver() === "local") {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const q = new URLSearchParams({ key, u: uploadId, n: String(partNumber), e: String(exp), s: localSig(`${key}#${uploadId}#${partNumber}`, exp, "") });
    return `/api/admin/upload/local-part?${q}`;
  }
  return getSignedUrl(r2(), new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 3600 });
}
export const verifyLocalPart = (key: string, u: string, n: string, e: string, s: string) => verifyLocalSig(`${key}#${u}#${n}`, e, s, "");

export async function listParts(key: string, uploadId: string) {
  if (driver() === "local") {
    const dir = localPath(`.parts/${uploadId}`);
    const names = await fsp.readdir(dir).catch(() => [] as string[]);
    return Promise.all(names.map(async (n) => ({ PartNumber: Number(n), ETag: `"${n}"`, Size: (await fsp.stat(path.join(dir, n))).size })));
  }
  const parts: { PartNumber: number; ETag: string; Size: number }[] = [];
  let marker: string | undefined;
  do {
    const res = await r2().send(new ListPartsCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumberMarker: marker }));
    for (const p of res.Parts ?? []) parts.push({ PartNumber: p.PartNumber!, ETag: p.ETag!, Size: p.Size ?? 0 });
    marker = res.IsTruncated ? res.NextPartNumberMarker : undefined;
  } while (marker);
  return parts;
}

export async function writeLocalPart(uploadId: string, n: number, body: Buffer) {
  const dir = localPath(`.parts/${uploadId}`);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, String(n)), body);
}

export async function completeMultipart(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
  if (driver() === "local") {
    const dir = localPath(`.parts/${uploadId}`);
    const dst = localPath(key);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    const out = fs.createWriteStream(dst);
    for (const p of [...parts].sort((a, b) => a.PartNumber - b.PartNumber)) {
      await new Promise<void>((ok, fail) => fs.createReadStream(path.join(dir, String(p.PartNumber))).on("end", ok).on("error", fail).pipe(out, { end: false }));
    }
    await new Promise<void>((ok) => out.end(ok));
    await fsp.rm(dir, { recursive: true, force: true });
    return;
  }
  await r2().send(new CompleteMultipartUploadCommand({
    Bucket: bucket(), Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
  }));
}

export async function abortMultipart(key: string, uploadId: string) {
  if (driver() === "local") return fsp.rm(localPath(`.parts/${uploadId}`), { recursive: true, force: true });
  await r2().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
}
