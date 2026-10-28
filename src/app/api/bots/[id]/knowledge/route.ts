import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await getAuthenticatedWorkspaceResource(req, 'bots', params.id, 'knowledge')
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('bot_datasets')
    .select('dataset_id, datasets(id, name, type, chunk_count, source_url, crawl_status, created_from)')
    .eq('bot_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data || []).map((d: any) => d.datasets).filter(Boolean))
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await getAuthenticatedWorkspaceResource(req, 'bots', params.id, 'knowledge', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const { type, url, content, name, dataset_id } = body
    const client_id = actor.workspaceId

    if (dataset_id) {
      const { data: ownedDataset } = await supabase.from('datasets').select('id').eq('id', dataset_id).eq('client_id', client_id).maybeSingle()
      if (!ownedDataset) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      await supabase.from('bot_datasets').upsert({ bot_id: params.id, dataset_id }, { onConflict: 'bot_id,dataset_id' })
    } else {
      const { data: dataset, error } = await supabase
        .from('datasets')
        .insert({
          client_id,
          name: name || url || 'Knowledge Source',
          type: type || 'text',
          created_from: type || 'text',
          source_url: url || null,
          crawl_status: type === 'url' ? 'pending' : 'done',
        })
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await supabase.from('bot_datasets').insert({ bot_id: params.id, dataset_id: dataset.id })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await getAuthenticatedWorkspaceResource(req, 'bots', params.id, 'knowledge', true)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dataset_id = req.nextUrl.searchParams.get('dataset_id')
  if (!dataset_id) return NextResponse.json({ error: 'dataset_id required' }, { status: 400 })
  const { data: ownedDataset } = await supabase.from('datasets').select('id').eq('id', dataset_id).eq('client_id', actor.workspaceId).maybeSingle()
  if (!ownedDataset) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase
    .from('bot_datasets')
    .delete()
    .eq('bot_id', params.id)
    .eq('dataset_id', dataset_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
