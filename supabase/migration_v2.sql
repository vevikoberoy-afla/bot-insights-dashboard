-- ============================================================
-- QA PAIRS TABLE + DATA SOURCES TABLE
-- Run this in Supabase SQL Editor
-- ============================================================

-- QA Pairs — manual question/answer overrides (checked before RAG)
create table if not exists qa_pairs (
  id                  uuid primary key default gen_random_uuid(),
  context_id          text not null references contexts(id) on delete cascade,
  question            text not null,
  answer              text not null,
  source_url          text,
  question_embedding  vector(768),
  created_at          timestamptz default now()
);

create index if not exists qa_pairs_context_idx on qa_pairs (context_id);
create index if not exists qa_pairs_embedding_idx
  on qa_pairs using ivfflat (question_embedding vector_cosine_ops)
  with (lists = 100);

-- Match QA pairs by cosine similarity
create or replace function match_qa_pairs(
  p_context_id  text,
  p_embedding   vector(768),
  p_threshold   float default 0.95
)
returns table (
  id          uuid,
  question    text,
  answer      text,
  source_url  text,
  similarity  float
)
language sql stable
as $$
  select
    q.id,
    q.question,
    q.answer,
    q.source_url,
    1 - (q.question_embedding <=> p_embedding) as similarity
  from qa_pairs q
  where
    q.context_id = p_context_id
    and q.question_embedding is not null
    and (1 - (q.question_embedding <=> p_embedding)) > p_threshold
  order by q.question_embedding <=> p_embedding
  limit 1;
$$;

-- Data Sources — external databases (Google Sheets, REST API, CSV)
create table if not exists data_sources (
  id              uuid primary key default gen_random_uuid(),
  context_id      text not null references contexts(id) on delete cascade,
  name            text default 'Order Database',
  source_type     text not null default 'google_sheets',
  endpoint_url    text not null,
  auth_header     text,
  lookup_param    text default 'id',
  field_mapping   jsonb default '{}',
  enabled         boolean default true,
  created_at      timestamptz default now()
);

create index if not exists data_sources_context_idx on data_sources (context_id);

-- Clients table — tracks each client/website you manage
create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  email           text,
  website_url     text,
  context_id      text references contexts(id) on delete set null,
  notes           text,
  created_at      timestamptz default now()
);
