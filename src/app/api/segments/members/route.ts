import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedWorkspaceUser(req,'contacts',true)
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const body = await req.json()
    const contactIds = Array.from(new Set((Array.isArray(body.contact_ids) ? body.contact_ids : []).map(String))).slice(0, 1000) as string[]
    const mode = ['add','move','remove'].includes(body.mode) ? body.mode : 'add'
    if (!contactIds.length) return NextResponse.json({ error: 'Select at least one contact' }, { status: 400 })

    let segment: any = null
    if (mode !== 'remove' || body.segment_id) {
      const result = await supabase.from('contact_segments').select('id,name,is_system,segment_type').eq('id', body.segment_id).eq('client_id', user.workspaceId).maybeSingle()
      segment = result.data
      if (!segment) return NextResponse.json({ error: 'Segment not found' }, { status: 404 })
      if (segment.is_system || segment.segment_type === 'automatic') return NextResponse.json({ error: 'Automatic segment membership is controlled by customer behavior' }, { status: 400 })
    }

    const { data: updated, error } = await supabase.rpc('set_contact_manual_segment',{p_client:user.workspaceId,p_contact_ids:contactIds,p_segment:segment?.id || null,p_mode:mode})
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, updated: mode === 'remove' ? Number(updated || 0) : contactIds.length, segment: segment?.name || null })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid segment assignment' }, { status: 400 })
  }
}
