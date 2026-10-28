export type Chapter = { id: string; parent_id: string | null; name: string; position: number; description: string | null; is_internal: boolean; is_raw: boolean; cover_file_id: string | null; icon: string; drive_path: string | null };
export type FileItem = {
  id: string; chapter_id: string | null; kind: "video" | "foto"; original_name: string; display_name: string; position: number; size_bytes: number;
  width: number | null; height: number | null; duration_sec: number | null; poster_time_sec: number | null; recorded_at: string | null; recorded_at_known: boolean;
  is_highlight: boolean; is_reels: boolean; tags: string[]; processing: "pendente" | "processando" | "pronto" | "erro"; processing_error: string | null;
  thumb?: string; poster?: string; lite?: string;
};
export type Detail = {
  event: Record<string, any> & { id: string; slug: string; client_names: string; status: string; has_password: boolean; hero_file_ids: string[] };
  chapters: Chapter[]; files: FileItem[];
  notes: { id: string; author_name: string; body: string; rating: number | null; allow_public_use: boolean; created_at: string }[];
  zips: { id: string; label: string; status: string; progress: number; size_bytes: number | null; notify_email: string | null; notify_phone: string | null; notified_at: string | null; created_at: string; has_zip: boolean }[];
  processing: Record<string, number>;
};
export type Ctx = { d: Detail; reload: () => Promise<void>; patchEvent: (b: Record<string, unknown>) => Promise<void>; toast: (m: string) => void };
