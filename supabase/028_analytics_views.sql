-- 028_analytics_views.sql
-- Adds Materialized Views for Dashboard Performance & Billing Tracking

-- 1. Daily Analytics Materialized View
-- Pre-aggregates message counts, handoff rates, and fallbacks per day per client.
CREATE MATERIALIZED VIEW IF NOT EXISTS client_daily_stats AS
SELECT 
    s.client_id,
    DATE_TRUNC('day', m.created_at) AS metric_date,
    COUNT(m.id) AS total_messages,
    COUNT(m.id) FILTER (WHERE m.content = '[HANDOFF]') AS total_handoffs,
    COUNT(m.id) FILTER (WHERE m.source_url IS NULL AND m.role = 'assistant' AND m.content NOT LIKE '[HANDOFF]%') AS total_fallbacks,
    COUNT(DISTINCT m.session_id) AS unique_sessions
FROM 
    public.messages m
JOIN public.sessions s ON s.session_id = m.session_id
GROUP BY 
    s.client_id, DATE_TRUNC('day', m.created_at);

-- Create unique index to allow concurrent refreshes
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_daily_stats ON client_daily_stats (client_id, metric_date);

-- 2. Function to refresh the view (Can be called by Vercel Cron or Supabase pg_cron)
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY client_daily_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Billing Usage Tracking in Clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free', -- free, pro, enterprise
ADD COLUMN IF NOT EXISTS current_period_message_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITH TIME ZONE;

-- 4. Enable automatic refresh every 2 minutes using pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'refresh-analytics-2min'
    ) THEN
        PERFORM cron.schedule('refresh-analytics-2min', '*/2 * * * *', 'SELECT refresh_analytics_views();');
    END IF;
END $$;
