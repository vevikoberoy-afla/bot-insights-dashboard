import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
    const actor = await getAuthenticatedWorkspaceUser(req, 'settings')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // TODO: Wire up to Tiledesk VM / Supabase for Business Hours
    const DEFAULT_HOURS = {
      Monday:    { open: true,  start: '09:00', end: '18:00' },
      Tuesday:   { open: true,  start: '09:00', end: '18:00' },
      Wednesday: { open: true,  start: '09:00', end: '18:00' },
      Thursday:  { open: true,  start: '09:00', end: '18:00' },
      Friday:    { open: true,  start: '09:00', end: '18:00' },
      Saturday:  { open: false, start: '10:00', end: '14:00' },
      Sunday:    { open: false, start: '10:00', end: '14:00' },
    }
    
    return NextResponse.json({
        enabled: true,
        timezone: 'Asia/Kolkata',
        hours: DEFAULT_HOURS,
        awayMsg: "We're currently closed. Leave a message and we'll get back to you during business hours.",
        botOutside: true
    })
}

export async function PUT(req: NextRequest) {
    try {
        const actor = await getAuthenticatedWorkspaceUser(req, 'settings', true)
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await req.json()
        // TODO: Save to Supabase
        return NextResponse.json({ success: true, settings: body })
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
