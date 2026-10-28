-- ============================================================
-- RAG CHATBOT WIDGET — SUPABASE SCHEMA
-- Paste this entire file into Supabase SQL Editor and run
-- ============================================================

-- 1. ENABLE PGVECTOR EXTENSION
create extension if not exists vector;

-- ============================================================
-- 2. CONTEXTS TABLE
-- One row per client website / chatbot instance
-- ============================================================
create table if not exists contexts (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  site_url      text not null,
  crawl_status  text not null default 'pending',
  -- pending | crawling | embedding | complete | failed
  firecrawl_job_id text,              -- Firecrawl async crawl job ID for polling
  page_count    integer default 0,
  chunk_count   integer default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- 3. CHUNKS TABLE
-- Each row = one chunk of text from a crawled page or uploaded file
-- embedding uses 768 dims (Google Gemini text-embedding-004)
-- ============================================================
create table if not exists chunks (
  id            uuid primary key default gen_random_uuid(),
  context_id    text not null references contexts(id) on delete cascade,
  text          text not null,
  chunk_hash    text not null,          -- MD5 of text, skip re-embedding if unchanged
  embedding     vector(768),            -- Gemini text-embedding-004
  source_url    text,                   -- original page URL or filename
  source_type   text default 'crawl',  -- crawl | manual | pdf | docx
  active        boolean default true,
  created_at    timestamptz default now()
);

-- Fast cosine similarity search
create index if not exists chunks_embedding_idx
  on chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Fast lookup by context
create index if not exists chunks_context_active_idx
  on chunks (context_id, active);

-- Hash lookup to skip duplicate embeddings
create index if not exists chunks_hash_idx
  on chunks (chunk_hash);

-- ============================================================
-- 4. QUERY CACHE TABLE
-- Cache answers for near-identical questions (>98% similarity)
-- Saves Groq + Gemini API calls
-- ============================================================
create table if not exists query_cache (
  id                uuid primary key default gen_random_uuid(),
  context_id        text not null references contexts(id) on delete cascade,
  question_text     text not null,
  question_embedding vector(768),
  response_text     text not null,
  source_url        text,
  hit_count         integer default 1,
  created_at        timestamptz default now()
);

create index if not exists query_cache_embedding_idx
  on query_cache using ivfflat (question_embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists query_cache_context_idx
  on query_cache (context_id);

-- ============================================================
-- 5. MESSAGES TABLE
-- Logs every chat message — powers "Recent Chats" in client dashboard
-- ============================================================
create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  context_id    text not null references contexts(id) on delete cascade,
  session_id    text not null,          -- random ID from sessionStorage in widget
  role          text not null,          -- 'user' | 'assistant'
  content       text not null,
  source_url    text,                   -- populated for assistant messages
  created_at    timestamptz default now()
);

create index if not exists messages_context_created_idx
  on messages (context_id, created_at desc);

create index if not exists messages_session_idx
  on messages (session_id);

-- ============================================================
-- 6. HELPER FUNCTION — update updated_at automatically
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger contexts_updated_at
  before update on contexts
  for each row execute function update_updated_at();

-- ============================================================
-- 7. HELPER FUNCTION — cosine similarity search on chunks
-- Call this from your API instead of raw SQL
-- Usage: select * from match_chunks('context_id', [0.1,0.2,...], 5);
-- ============================================================
create or replace function match_chunks(
  p_context_id  text,
  p_embedding   vector(768),
  p_match_count int default 5
)
returns table (
  id          uuid,
  text        text,
  source_url  text,
  similarity  float
)
language sql stable
as $$
  select
    c.id,
    c.text,
    c.source_url,
    1 - (c.embedding <=> p_embedding) as similarity
  from chunks c
  where
    c.context_id = p_context_id
    and c.active = true
    and c.embedding is not null
  order by c.embedding <=> p_embedding
  limit p_match_count;
$$;

-- ============================================================
-- 8. HELPER FUNCTION — cosine similarity search on query cache
-- Returns cached answer if similarity > 0.98
-- ============================================================
create or replace function match_query_cache(
  p_context_id  text,
  p_embedding   vector(768),
  p_threshold   float default 0.98
)
returns table (
  id            uuid,
  response_text text,
  source_url    text,
  similarity    float
)
language sql stable
as $$
  select
    qc.id,
    qc.response_text,
    qc.source_url,
    1 - (qc.question_embedding <=> p_embedding) as similarity
  from query_cache qc
  where
    qc.context_id = p_context_id
    and (1 - (qc.question_embedding <=> p_embedding)) > p_threshold
  order by qc.question_embedding <=> p_embedding
  limit 1;
$$;

-- ============================================================
-- DONE — 4 tables, 2 functions, indexes all set
-- ============================================================
