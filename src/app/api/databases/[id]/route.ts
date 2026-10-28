import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceResource, getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = params.id
    const actor = await getAuthenticatedWorkspaceResource(req, 'data_sources', id, 'sources', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { name, purpose, data_type, lookup_field } = await req.json()

    const { data, error } = await supabase
      .from('data_sources')
      .update({
        name,
        purpose,
        data_type,
        lookup_field,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('client_id', actor.workspaceId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = params.id

    const workspaceActor = await getAuthenticatedWorkspaceUser(req, 'sources', true)
    if (!workspaceActor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (id.startsWith('mock-db-')) {
      return NextResponse.json({ success: true })
    }
    const { data: ownedDatabase } = await supabase.from('data_sources').select('id').eq('id', id).eq('client_id', workspaceActor.workspaceId).maybeSingle()
    if (!ownedDatabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Check if it's linked to any bots
    const { data: botsLinked, error: botsError } = await supabase
      .from('bot_databases')
      .select('bot_id')
      .eq('database_id', id)

    // Ignore missing table errors for bot_databases
    if (botsError && botsError.code !== '42P01') {
      console.error(botsError)
    }

    const url = new URL(req.url)
    const force = url.searchParams.get('force') === 'true'

    if (botsLinked && botsLinked.length > 0 && !force) {
      return NextResponse.json({
        warning: true,
        message: `This database is linked to ${botsLinked.length} bot(s). Deleting it will remove their access to this data. Continue?`
      })
    }

    const { error } = await supabase.from('data_sources').delete().eq('id', id).eq('client_id', workspaceActor.workspaceId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
