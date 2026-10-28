/* Backfill sessions from messages that may not have been captured */
/* Ensures sessions exist for any orphaned messages */

INSERT INTO public.sessions (client_id, bot_id, session_id, channel, last_message_at, created_at)
SELECT DISTINCT
    b.client_id,
    m.bot_id,
    m.session_id,
    COALESCE(MAX(m.channel) OVER (PARTITION BY m.session_id), 'web'),
    MAX(m.created_at) OVER (PARTITION BY m.session_id),
    MIN(m.created_at) OVER (PARTITION BY m.session_id)
FROM public.messages m
JOIN public.bots b ON b.id = m.bot_id
WHERE m.bot_id IS NOT NULL
  AND m.session_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.sessions s WHERE s.session_id = m.session_id
  )
ON CONFLICT (session_id) DO UPDATE SET
    last_message_at = EXCLUDED.last_message_at;

/* Delete any remaining orphaned messages that could not be backfilled */
DELETE FROM public.messages m
WHERE NOT EXISTS (
    SELECT 1 FROM public.sessions s WHERE s.session_id = m.session_id
);
