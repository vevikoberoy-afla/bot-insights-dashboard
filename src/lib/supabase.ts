import { createClient } from '@supabase/supabase-js'

// Server-side client (uses service role key — never expose to browser)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
    global: {
      fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' })
    }
  }
)

const MAX_BROADCAST_RETRIES = 3
const BASE_BROADCAST_DELAY_MS = 200

/**
 * Broadcast an event over Supabase Realtime using httpSend() (REST delivery),
 * which avoids WebSocket connection overhead on serverless routes and prevents
 * the "Realtime send() is automatically falling back to REST API" warning.
 *
 * Includes automatic retries with exponential backoff (200ms, 400ms, 800ms)
 * to handle transient network blips and Supabase Realtime gateway 5xx spikes.
 */
export async function broadcastRealtime(
  channelName: string,
  event: string,
  payload: any
): Promise<void> {
  for (let attempt = 0; attempt <= MAX_BROADCAST_RETRIES; attempt++) {
    try {
      const channel = supabase.channel(channelName)
      if (typeof (channel as any).httpSend === 'function') {
        const res = await (channel as any).httpSend(event, payload)
        if (res && (res as any).error) throw (res as any).error
      } else {
        const res = await channel.send({ type: 'broadcast', event, payload })
        if (res === 'error' || res === 'timed out') throw new Error(`Realtime send returned ${res}`)
      }
      return // success
    } catch (err: any) {
      if (attempt === MAX_BROADCAST_RETRIES) {
        console.error(
          `[broadcastRealtime] gave up after ${MAX_BROADCAST_RETRIES} retries for ${channelName}:${event}`,
          err
        )
        return
      }
      await new Promise((r) => setTimeout(r, BASE_BROADCAST_DELAY_MS * Math.pow(2, attempt)))
    }
  }
}
