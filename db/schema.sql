-- BE STORY — Memórias · esquema Postgres (Neon ou Supabase)
-- Aplicar com: npm run db:migrate   (idempotente)

create extension if not exists "pgcrypto";

do $$ begin create type event_status as enum ('rascunho','ativo','expirado','arquivado'); exception when duplicate_object then null; end $$;
do $$ begin create type event_type as enum ('casamento','aniversario','formatura','corporativo','saude','inauguracao','outro'); exception when duplicate_object then null; end $$;
do $$ begin create type event_theme as enum ('classico-escuro','editorial-claro','sepia','minimal'); exception when duplicate_object then null; end $$;
do $$ begin create type media_kind as enum ('video','foto'); exception when duplicate_object then null; end $$;
do $$ begin create type processing_status as enum ('pendente','processando','pronto','erro'); exception when duplicate_object then null; end $$;

-- ── Administradores do painel ────────────────────────────────────
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- ── Eventos ──────────────────────────────────────────────────────
create table if not exists events (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,              -- memorias.bestudiomkt.com.br/<slug>
  title            text not null,
  client_names     text not null,                     -- "Aline & Hélio"
  event_type       event_type not null default 'casamento',
  event_date       date not null,
  location         text,
  theme            event_theme not null default 'classico-escuro',
  accent_color     text not null default '#c9a77c',
  status           event_status not null default 'rascunho',
  password_hash    text,                               -- palavra-chave opcional
  expires_at       timestamptz,
  cover_file_id    uuid,                               -- fundo inicial do hero
  polaroid_file_id uuid,                               -- foto da Polaroid (opcional, diferente da capa)
  final_file_id    uuid,                               -- Polaroid do encerramento
  hero_file_ids    uuid[] not null default '{}',       -- fotos que passam no fundo do hero
  reels_file_id    uuid,                               -- Reels_* da raiz: clipe 9:16 + filme
  film_file_id     uuid,                               -- opcional: filme diferente do Reels
  soundtrack_key   text,
  letter           text,                               -- carta (vazia = texto padrão BE)
  testimonial      text,
  share_caption    text,
  drive_folder_id  text,
  drive_synced_at  timestamptz,
  manual_order     boolean not null default false,     -- admin reordenou à mão
  storage_bytes    bigint not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  published_at     timestamptz
);

-- ── Capítulos (pastas e subpastas) ───────────────────────────────
create table if not exists chapters (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  parent_id       uuid references chapters(id) on delete cascade,
  name            text not null,
  icon            text not null default 'film',
  color           text,
  position        int not null default 0,
  cover_file_id   uuid,
  description     text,
  is_internal     boolean not null default false,       -- não aparece para o cliente
  drive_folder_id text,
  drive_path      text,                                 -- "02. Cerimônia/Votos"
  created_at      timestamptz not null default now(),
  unique (event_id, drive_folder_id)
);
create index if not exists chapters_event_idx on chapters(event_id, parent_id, position);

-- ── Arquivos ─────────────────────────────────────────────────────
create table if not exists files (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references events(id) on delete cascade,
  chapter_id         uuid references chapters(id) on delete set null,
  kind               media_kind not null,
  original_name      text not null,
  display_name       text not null,                     -- nome amigável editável
  position           int not null default 0,
  drive_file_id      text,
  mime_type          text,
  size_bytes         bigint not null default 0,
  -- chaves no armazenamento (R2)
  master_key         text,                              -- cópia do original
  thumb_key          text,                              -- jpg 640px (grade, nunca card preto)
  poster_key         text,                              -- jpg grande (foto em tela cheia / poster do vídeo)
  web_key            text,                              -- vídeo mp4 1080p
  lite_key           text,                              -- vídeo mp4 720p ("versão leve")
  width              int,
  height             int,
  duration_sec       numeric(10,2),
  poster_time_sec    numeric(10,2),
  recorded_at        timestamptz,
  recorded_at_known  boolean not null default false,    -- veio dos metadados da câmera
  is_highlight       boolean not null default false,
  is_reels           boolean not null default false,
  tags               text[] not null default '{}',
  processing         processing_status not null default 'pendente',
  processing_error   text,
  web_bytes          bigint not null default 0,         -- espaço ocupado no R2 (derivados + master)
  created_at         timestamptz not null default now(),
  unique (event_id, drive_file_id)
);
create index if not exists files_event_idx on files(event_id, chapter_id, position);
create index if not exists files_tags_idx on files using gin(tags);

-- ── Interações do cliente ────────────────────────────────────────
create table if not exists favorites (
  file_id uuid not null references files(id) on delete cascade,
  visitor_id text not null,
  created_at timestamptz not null default now(),
  primary key (file_id, visitor_id)
);
create table if not exists reactions (
  file_id uuid not null references files(id) on delete cascade,
  visitor_id text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (file_id, visitor_id, emoji)
);
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references files(id) on delete cascade,
  visitor_id text not null,
  author_name text,
  body text not null check (char_length(body) <= 1000),
  created_at timestamptz not null default now()
);
-- open, reveal, view, watch, download, share, film, zip, referral_click
create table if not exists analytics (
  id bigserial primary key,
  event_id uuid not null references events(id) on delete cascade,
  file_id uuid references files(id) on delete cascade,
  visitor_id text,
  kind text not null,
  value numeric,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_event_idx on analytics(event_id, kind, created_at);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  author_name text not null,
  body text not null check (char_length(body) <= 3000),
  rating int check (rating between 1 and 5),
  allow_public_use boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists referrals (
  code text primary key,
  event_id uuid not null references events(id) on delete cascade,
  visitor_id text,
  clicks int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists zip_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  scope text not null,                 -- all | chapter:<id> | favorites
  label text not null,
  file_ids uuid[] not null,
  visitor_id text,
  notify_email text,
  notify_phone text,
  status processing_status not null default 'pendente',
  progress int not null default 0,
  zip_key text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  notified_at timestamptz
);

-- ── Fila do worker (consumida com FOR UPDATE SKIP LOCKED) ────────
-- kinds: process_file | build_zip | purge_event | sort_event
create table if not exists jobs (
  id bigserial primary key,
  kind text not null,
  payload jsonb not null,
  status processing_status not null default 'pendente',
  attempts int not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_pending_idx on jobs(status, run_after);

-- ── Uploads diretos em andamento (multipart retomável) ───────────
create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  relative_path text not null,          -- "Cerimônia/Votos/IMG_0001.MOV"
  key text not null,
  upload_id text not null,
  size_bytes bigint not null,
  last_modified bigint,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
