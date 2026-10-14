"use client";
import { useEffect, useRef, useState } from "react";
import { api, fmtBytes } from "../api";

type Item = { file: File; path: string; progress: number; status: "fila" | "enviando" | "pronto" | "erro" | "pausado"; error?: string };
const MEDIA = /\.(mov|mp4|m4v|avi|mts|mkv|webm|3gp|jpe?g|png|heic|heif|webp|tiff?|dng)$/i;

/** Envio direto em massa: arraste pastas inteiras (mantém as subpastas), com retomada após queda de conexão. */
export default function Uploader({ eventId, chapterId, chapterName, onDone }: { eventId: string; chapterId: string | null; chapterName?: string; onDone: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const running = useRef(false);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const update = (i: number, p: Partial<Item>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));

  useEffect(() => {
    const on = () => { setItems((l) => l.map((x) => (x.status === "pausado" ? { ...x, status: "fila" } : x))); setTimeout(pump, 300); };
    window.addEventListener("online", on);
    const warn = (e: BeforeUnloadEvent) => { if (running.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("online", on); window.removeEventListener("beforeunload", warn); };
  });

  async function add(files: { file: File; path: string }[]) {
    const ok = files.filter((f) => MEDIA.test(f.file.name) && !f.file.name.startsWith("."));
    setItems((l) => [...l, ...ok.map((f) => ({ ...f, progress: 0, status: "fila" as const }))]);
    setTimeout(pump, 50);
  }

  async function pump() {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const i = itemsRef.current.findIndex((x) => x.status === "fila");
        if (i < 0) break;
        if (!navigator.onLine) { update(i, { status: "pausado" }); break; }
        await send(i);
      }
    } finally { running.current = false; onDone(); }
  }

  async function send(i: number) {
    const it = itemsRef.current[i];
    update(i, { status: "enviando", error: undefined });
    try {
      const st = await api<{ id: string; partSize: number; done: { PartNumber: number; ETag: string }[] }>("/api/admin/upload/start",
        { body: { eventId, relativePath: it.path, size: it.file.size, lastModified: it.file.lastModified, type: it.file.type } });
      const total = Math.ceil(it.file.size / st.partSize) || 1;
      const done = new Map(st.done.map((p) => [p.PartNumber, p.ETag]));
      const todo = Array.from({ length: total }, (_, k) => k + 1).filter((n) => !done.has(n));
      let sent = [...done.keys()].reduce((s, n) => s + Math.min(st.partSize, it.file.size - (n - 1) * st.partSize), 0);
      update(i, { progress: sent / it.file.size });
      for (let k = 0; k < todo.length; k += 4) {
        const batch = todo.slice(k, k + 4);
        const { urls } = await api<{ urls: { n: number; url: string }[] }>("/api/admin/upload/sign", { body: { id: st.id, parts: batch } });
        await Promise.all(urls.map(async ({ n, url }) => {
          const blob = it.file.slice((n - 1) * st.partSize, Math.min(n * st.partSize, it.file.size));
          for (let attempt = 0; ; attempt++) {
            try {
              const r = await fetch(url, { method: "PUT", body: blob });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              done.set(n, r.headers.get("ETag") ?? `"${n}"`);
              sent += blob.size; update(i, { progress: sent / it.file.size });
              return;
            } catch (e) {
              if (attempt >= 5) throw e;
              await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
            }
          }
        }));
      }
      await api("/api/admin/upload/complete", { body: { id: st.id, chapterId, parts: [...done].map(([PartNumber, ETag]) => ({ PartNumber, ETag })) } });
      update(i, { status: "pronto", progress: 1 });
    } catch (e) {
      update(i, { status: navigator.onLine ? "erro" : "pausado", error: (e as Error).message });
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault(); setOver(false);
    const out: { file: File; path: string }[] = [];
    const walk = async (entry: any, prefix: string): Promise<void> => {
      if (entry.isFile) await new Promise<void>((ok) => entry.file((f: File) => { out.push({ file: f, path: prefix + f.name }); ok(); }, () => ok()));
      else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
          const batch: any[] = await new Promise((ok) => reader.readEntries(ok, () => ok([])));
          if (!batch.length) break;
          for (const b of batch) await walk(b, prefix + entry.name + "/");
        }
      }
    };
    const entries = [...e.dataTransfer.items].map((x) => x.webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) for (const en of entries) await walk(en, "");
    else [...e.dataTransfer.files].forEach((f) => out.push({ file: f, path: f.name }));
    add(out);
  }

  const total = items.reduce((s, x) => s + x.file.size, 0);
  const sentBytes = items.reduce((s, x) => s + x.file.size * x.progress, 0);
  return (
    <div className="space-y-3">
      <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center text-sm transition ${over ? "border-sand bg-sand/5" : "border-white/15 hover:border-white/30"}`}>
        <span className="text-2xl">⇪</span>
        <span>Arraste pastas ou arquivos aqui</span>
        <span className="text-xs text-white/50">{chapterName ? `Vão para “${chapterName}”` : "As subpastas viram capítulos"} · arquivos grandes são enviados em partes e retomam se a internet cair</span>
        <input type="file" multiple className="hidden" onChange={(e) => add([...(e.target.files ?? [])].map((f) => ({ file: f, path: f.name })))} />
      </label>
      {items.length > 0 && (
        <div className="card max-h-72 space-y-2 overflow-auto p-3 text-xs">
          <div className="flex justify-between text-white/60"><span>{items.filter((x) => x.status === "pronto").length}/{items.length} enviados</span><span>{fmtBytes(sentBytes)} de {fmtBytes(total)}</span></div>
          {items.map((x, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between gap-2"><span className="truncate">{x.path}</span>
                <span className={x.status === "erro" ? "text-red-300" : x.status === "pronto" ? "text-emerald-300" : "text-white/50"}>
                  {x.status === "enviando" ? `${Math.round(x.progress * 100)}%` : x.status}
                  {x.status === "erro" && <button className="ml-2 underline" onClick={() => { update(i, { status: "fila" }); setTimeout(pump, 50); }}>tentar de novo</button>}
                </span></div>
              <div className="h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-sand" style={{ width: `${x.progress * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
