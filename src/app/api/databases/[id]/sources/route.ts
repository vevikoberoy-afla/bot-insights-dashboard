import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const database_id = params.id
    const actor = await getAuthenticatedWorkspaceResource(req, 'data_sources', database_id, 'sources', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    
    // basic validation
    if (!body.source_type || !body.source_name) {
      return NextResponse.json({ error: 'source_type and source_name are required' }, { status: 400 })
    }

    if (database_id.startsWith('mock-db-')) {
      return NextResponse.json({
        id: 'mock-source-' + Date.now(),
        database_id,
        source_type: body.source_type,
        source_name: body.source_name,
        status: 'pending',
        row_count: 0
      })
    }

    const { data, error } = await supabase
      .from('database_sources')
      .insert({
        database_id,
        source_type: body.source_type,
        source_name: body.source_name,
        endpoint_url: body.endpoint_url || null,
        auth_header: body.auth_header || null,
        http_method: body.http_method || 'GET',
        request_body: body.request_body || null,
        curl_command: body.curl_command || null,
        sheet_url: body.sheet_url || null,
        sheet_tab: body.sheet_tab || null,
        file_path: body.file_path || null,
        file_name: body.file_name || null,
        status: 'pending',
        row_count: 0
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Update source count on parent
    const { data: parent } = await supabase.from('data_sources').select('source_count').eq('id', database_id).eq('client_id', actor.workspaceId).single()
    if (parent) {
      await supabase.from('data_sources').update({ source_count: (parent.source_count || 0) + 1 }).eq('id', database_id).eq('client_id', actor.workspaceId)
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
