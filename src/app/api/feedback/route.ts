import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { eventRateLimit, getIP } from '@/lib/ratelimit'

// POST /api/feedback — Save thumbs up/down rating from widget
export async function POST(req: NextRequest) {
    try {
        const limit = await eventRateLimit.limit(getIP(req)).catch(() => null)
        if (limit && !limit.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
        const body = await req.json()
        const { bot_id, session_id, message_id, rating, comment } = body

        if (!bot_id || !session_id || !rating) {
            return NextResponse.json({ error: 'bot_id, session_id, and rating are required' }, { status: 400 })
        }
        if (!['positive', 'negative'].includes(rating)) {
            return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
        }
        const { data: session } = await supabase
            .from('sessions')
            .select('session_id, bot_id')
            .eq('session_id', session_id)
            .eq('bot_id', bot_id)
            .maybeSingle()
        if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

        const { data, error } = await supabase
            .from('feedback')
            .insert({
                bot_id,
                session_id,
                message_id: message_id || null,
                rating,
                comment: typeof comment === 'string' ? comment.slice(0, 1000) : null
            })
            .select()
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data, { status: 201 })
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
