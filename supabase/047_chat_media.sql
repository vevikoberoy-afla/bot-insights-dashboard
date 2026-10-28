-- Migration: 047_chat_media.sql
-- Adds photo/media columns to messages table
-- Adds photo upload and vision AI toggles to bots table

-- messages table: media columns
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url    TEXT,
  ADD COLUMN IF NOT EXISTS media_type   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS media_size_bytes INT;

-- bots table: feature flags
ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS photo_upload_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vision_ai_enabled    BOOLEAN NOT NULL DEFAULT FALSE;

-- Supabase Storage bucket for chat media (run via Supabase dashboard or CLI):
-- 1. Create bucket "chat-media" (public: false, allowed MIME: image/jpeg, image/png, image/webp, image/gif)
-- 2. Set file size limit to 5 MB (5242880 bytes)
-- 3. Apply RLS policies to allow authenticated reads (dashboard agents) and anon writes (widget uploads)
--
-- Example RLS (paste in Supabase Storage Policies UI):
--   INSERT policy (anon): bucket_id = 'chat-media'
--   SELECT policy (authenticated): bucket_id = 'chat-media'
