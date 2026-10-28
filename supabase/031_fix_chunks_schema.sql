-- 031_fix_chunks_schema.sql
-- Removes the NOT NULL constraint from chunks.context_id 
-- This allows chunks to be inserted based purely on dataset_id without violating foreign keys

ALTER TABLE public.chunks 
ALTER COLUMN context_id DROP NOT NULL;
