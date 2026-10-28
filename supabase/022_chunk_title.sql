-- 022_chunk_title.sql
-- Add title column to chunks table to allow users to name manual chunks

ALTER TABLE public.chunks ADD COLUMN IF NOT EXISTS title text;
