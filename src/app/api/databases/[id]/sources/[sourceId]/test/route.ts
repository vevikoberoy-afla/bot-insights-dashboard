import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { previewDatabaseSource } from '@/lib/orderResolver'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string; sourceId: string }> }
) {
  const params = await props.params;
  try {
    const actor = await getAuthenticatedWorkspaceResource(req, 'data_sources', params.id, 'sources', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const lookupValue = String(body.lookup_value || '').trim().slice(0, 100) || undefined
    await supabase.from('database_sources').update({ status: 'testing', error_msg: null }).eq('id', params.sourceId).eq('database_id', params.id)
    const preview = await previewDatabaseSource(params.id, params.sourceId, lookupValue)
    const now = new Date().toISOString()
    await Promise.all([
      supabase.from('database_sources').update({ status: 'connected', last_tested_at: now,
        row_count: preview.rowCount, error_msg: null }).eq('id', params.sourceId).eq('database_id', params.id),
      supabase.from('data_sources').update({ status: 'connected', updated_at: now }).eq('id', params.id),
    ])
    return NextResponse.json({ success: true, preview_rows: preview.rows, row_count: preview.rowCount,
      detected_fields: preview.rows[0] ? Object.keys(preview.rows[0]) : [] })
  } catch (error: any) {
    const message = String(error.message || 'Connection failed').slice(0, 500)
    await supabase.from('database_sources').update({ status: 'error', error_msg: message,
      last_tested_at: new Date().toISOString() }).eq('id', params.sourceId).eq('database_id', params.id)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
