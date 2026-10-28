import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
    const actor = await getAuthenticatedWorkspaceUser(req, 'settings')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // TODO: Wire up to Dittofeed VM / Supabase for Subscription Groups
    const MOCK_GROUPS = [
      { id: 'g1', name: 'Marketing & Promotions', type: 'marketing',  contacts: 4201, desc: 'Weekly newsletter, seasonal sales, and special offers.' },
      { id: 'g2', name: 'Product Updates',        type: 'utility',    contacts: 8932, desc: 'New feature announcements and platform updates.' },
      { id: 'g3', name: 'Order Updates',          type: 'utility',    contacts: 12450, desc: 'Shipping confirmations and delivery notifications.' },
    ]
    return NextResponse.json(MOCK_GROUPS)
}

export async function POST(req: NextRequest) {
    try {
        const actor = await getAuthenticatedWorkspaceUser(req, 'settings', true)
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await req.json()
        // TODO: Save to Supabase
        return NextResponse.json({ success: true, group: body })
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
