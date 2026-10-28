-- 030_bot_data_sources.sql
-- Enables individual bots to link to specific external data sources

CREATE TABLE IF NOT EXISTS public.bot_data_sources (
    bot_id UUID REFERENCES public.bots(id) ON DELETE CASCADE,
    data_source_id UUID REFERENCES public.data_sources(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (bot_id, data_source_id)
);

-- Note: We retain context_id on data_sources so we know which client owns it, 
-- but bot_data_sources determines which specific bots can query it.
