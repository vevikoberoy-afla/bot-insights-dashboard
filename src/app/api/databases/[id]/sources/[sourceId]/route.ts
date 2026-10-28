import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ id: string, sourceId: string }> }
) {
  const params = await props.params;
  try {
    const { id, sourceId } = params
    const actor = await getAuthenticatedWorkspaceResource(req, 'data_sources', id, 'sources', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    
    // We update fields that were passed
    const updateData: any = { updated_at: new Date().toISOString() }
    
    if (body.source_name !== undefined) updateData.source_name = body.source_name
    if (body.endpoint_url !== undefined) updateData.endpoint_url = body.endpoint_url
    if (body.auth_header !== undefined) updateData.auth_header = body.auth_header
    if (body.http_method !== undefined) updateData.http_method = body.http_method
    if (body.request_body !== undefined) updateData.request_body = body.request_body
    if (body.curl_command !== undefined) updateData.curl_command = body.curl_command
    if (body.sheet_url !== undefined) updateData.sheet_url = body.sheet_url
    if (body.sheet_tab !== undefined) updateData.sheet_tab = body.sheet_tab
    if (body.field_mapping !== undefined) updateData.field_mapping = body.field_mapping
    if (body.status !== undefined) updateData.status = body.status

    const { data, error } = await supabase
      .from('database_sources')
      .update(updateData)
      .eq('id', sourceId)
      .eq('database_id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string, sourceId: string }> }
) {
  const params = await props.params;
  try {
    const { id, sourceId } = params
    const actor = await getAuthenticatedWorkspaceResource(req, 'data_sources', id, 'sources', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('database_sources')
      .delete()
      .eq('id', sourceId)
      .eq('database_id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Update source count on parent
    const { data: parent } = await supabase.from('data_sources').select('source_count').eq('id', id).eq('client_id', actor.workspaceId).single()
    if (parent && parent.source_count > 0) {
      await supabase.from('data_sources').update({ source_count: parent.source_count - 1 }).eq('id', id).eq('client_id', actor.workspaceId)
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
