import { drive as driveApi, drive_v3 } from "@googleapis/drive";
import { JWT } from "google-auth-library";
import type { Readable } from "node:stream";

let cached: drive_v3.Drive | null = null;

/** Cliente do Drive autenticado com conta de serviço (somente leitura). As pastas não precisam ser públicas:
 *  basta compartilhar a pasta-mãe dos eventos com o e-mail da conta de serviço como "Leitor". */
export function drive() {
  if (!cached) {
    // Aceita o arquivo JSON inteiro da conta de serviço (GOOGLE_SERVICE_ACCOUNT_JSON) ou e-mail + chave separados
    let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "";
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const j = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      email = j.client_email;
      key = j.private_key;
    }
    const auth = new JWT({
      email,
      key: key.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    cached = driveApi({ version: "v3", auth });
  }
  return cached;
}

/** Aceita link completo da pasta ou só o ID. */
export function parseFolderId(input: string) {
  const m = input.match(/folders\/([a-zA-Z0-9_-]{10,})/) || input.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim();
  throw new Error("Link da pasta do Drive inválido");
}

export interface DriveNode {
  id: string;
  name: string;
  path: string[]; // caminho de subpastas a partir da pasta do evento
  mimeType: string;
  size: number;
  recordedAt?: string;
  durationSec?: number;
  width?: number;
  height?: number;
}

export interface DriveTree {
  folders: { id: string; name: string; path: string[] }[];
  files: DriveNode[];
}

const FOLDER = "application/vnd.google-apps.folder";
const FIELDS =
  "nextPageToken, files(id,name,mimeType,size,createdTime,modifiedTime,imageMediaMetadata(time,width,height),videoMediaMetadata(durationMillis,width,height))";

/** Lê recursivamente a pasta do evento: subpastas viram capítulos. */
export async function readFolderTree(rootId: string): Promise<DriveTree> {
  const tree: DriveTree = { folders: [], files: [] };
  const queue: { id: string; path: string[] }[] = [{ id: rootId, path: [] }];
  while (queue.length) {
    const { id, path } = queue.shift()!;
    let pageToken: string | undefined;
    do {
      const res = await drive().files.list({
        q: `'${id}' in parents and trashed = false`,
        fields: FIELDS,
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        orderBy: "name",
      });
      for (const f of res.data.files ?? []) {
        if (f.mimeType === FOLDER) {
          const p = [...path, f.name!];
          tree.folders.push({ id: f.id!, name: f.name!, path: p });
          queue.push({ id: f.id!, path: p });
        } else if (f.mimeType?.startsWith("video/") || f.mimeType?.startsWith("image/")) {
          tree.files.push({
            id: f.id!,
            name: f.name!,
            path,
            mimeType: f.mimeType!,
            size: Number(f.size || 0),
            recordedAt: exifToIso(f.imageMediaMetadata?.time) || f.createdTime || f.modifiedTime || undefined,
            durationSec: f.videoMediaMetadata?.durationMillis ? Number(f.videoMediaMetadata.durationMillis) / 1000 : undefined,
            width: f.imageMediaMetadata?.width ?? f.videoMediaMetadata?.width ?? undefined,
            height: f.imageMediaMetadata?.height ?? f.videoMediaMetadata?.height ?? undefined,
          });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  return tree;
}

/** EXIF "2026:09:12 16:04:33" → ISO (horário local de Fortaleza, UTC-3) */
function exifToIso(t?: string | null) {
  if (!t) return undefined;
  const m = t.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-03:00` : undefined;
}

/** Baixa o original do Drive para um arquivo temporário (usado pelo worker). */
export async function driveDownload(fileId: string, filePath: string) {
  const { createWriteStream } = await import("node:fs");
  const res = await drive().files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "stream" });
  await new Promise<void>((ok, fail) => {
    (res.data as unknown as Readable).pipe(createWriteStream(filePath)).on("finish", () => ok()).on("error", fail);
  });
}

export async function folderName(folderId: string) {
  const r = await drive().files.get({ fileId: folderId, fields: "name", supportsAllDrives: true });
  return r.data.name ?? "";
}

/** Regra BE: o arquivo "Reels_<Casal>" na raiz da pasta do evento é SEMPRE o clipe 9:16 ("clipe pronto")
 *  e também o filme do botão "Assistir ao filme". Ele não entra em nenhum capítulo. */
export const REELS_PATTERN = /^reels?[\s_\-]/i;
export function findReels(tree: DriveTree) {
  return tree.files.find((f) => f.path.length === 0 && f.mimeType.startsWith("video/") && REELS_PATTERN.test(f.name));
}
