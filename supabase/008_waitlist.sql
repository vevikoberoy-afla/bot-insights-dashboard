-- 008_waitlist.sql
-- Creates a waitlist table to capture emails on the marketing landing page.

CREATE TABLE IF NOT EXISTS public.waitlist (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Allow insert from anywhere (public)
DROP POLICY IF EXISTS "Allow public insert to waitlist" ON public.waitlist;
CREATE POLICY "Allow public insert to waitlist"
ON public.waitlist
FOR INSERT
TO public
WITH CHECK (true);

-- Only service role or admins can read
DROP POLICY IF EXISTS "Allow service role read" ON public.waitlist;
CREATE POLICY "Allow service role read"
ON public.waitlist
FOR SELECT
TO service_role
USING (true);
