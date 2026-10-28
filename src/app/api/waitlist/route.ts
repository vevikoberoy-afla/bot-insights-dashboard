import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getIP, waitlistRateLimit } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
  try {
    const limit = await waitlistRateLimit.limit(getIP(req)).catch(() => null)
    if (!limit) return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
    if (!limit.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    const { email } = await req.json()
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : ''
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Insert into waitlist table
    const { error } = await supabase.from('waitlist').insert({ email: normalizedEmail })

    if (error) {
      // 23505 is PostgreSQL unique violation error code
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Email is already on the waitlist' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ success: true, message: 'Joined waitlist' }, { status: 201 })
  } catch (error: any) {
    console.error('Waitlist error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
