import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
  const actor=await getAuthenticatedWorkspaceUser(req,'sources')
  if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
  try {
    const url = new URL(req.url)
    const client_id = actor.workspaceId
    let context_id: string|null = null
    const bot_id = url.searchParams.get('bot_id')

    // Collect all candidate identifiers
    const candidateIds = new Set<string>()
    if (client_id) candidateIds.add(client_id)

    // Resolve client record to get both UUID and context_id
    if (client_id) {
      const { data: clientRow } = await supabase
        .from('clients')
        .select('id, context_id')
        .eq('id',client_id)
        .maybeSingle()
      if (clientRow?.id) candidateIds.add(clientRow.id)
      if (clientRow?.context_id) candidateIds.add(clientRow.context_id)
    }

    // If bot_id is provided, also resolve bot's client_id
    if (bot_id) {
      const { data: botRow } = await supabase
        .from('bots')
        .select('client_id')
        .eq('id', bot_id)
        .eq('client_id',client_id)
        .maybeSingle()
      if (botRow?.client_id) {
        candidateIds.add(botRow.client_id)
        const { data: botClient } = await supabase
          .from('clients')
          .select('id, context_id')
          .eq('id', botRow.client_id)
          .maybeSingle()
        if (botClient?.id) candidateIds.add(botClient.id)
        if (botClient?.context_id) candidateIds.add(botClient.context_id)
      }
    }

    const idList = Array.from(candidateIds).filter(Boolean)
    const orFilters = idList.flatMap(id => [`client_id.eq.${id}`, `context_id.eq.${id}`])

    let dbs: any[] = []

    // 1. Try rich select with joined tables
    try {
      let query = supabase
        .from('data_sources')
        .select(`
          *,
          database_sources (*),
          bot_databases ( bot_id )
        `)
        .order('created_at', { ascending: false })

      if (orFilters.length > 0) {
        query = query.or(orFilters.join(','))
      }

      const { data, error } = await query

      if (!error && data && data.length > 0) {
        dbs = data.map(db => ({
          ...db,
          bots_count: db.bot_databases?.length || 0
        }))
      }
    } catch {
      // Ignore and proceed to resilient flat select fallback
    }

    // 2. Fallback: Flat select on data_sources if rich select returned empty or failed
    if (dbs.length === 0) {
      try {
        let flatQuery = supabase
          .from('data_sources')
          .select('*')
          .order('created_at', { ascending: false })

        if (orFilters.length > 0) {
          flatQuery = flatQuery.or(orFilters.join(','))
        }

        const { data: flatData, error: flatError } = await flatQuery

        if (!flatError && flatData && flatData.length > 0) {
          dbs = flatData.map(db => ({
            ...db,
            bots_count: 0
          }))
        }
      } catch {
        // Continue to final client_id fallback
      }
    }

    // 3. Final safety fallback: Direct eq match on client_id or context_id if still empty
    if (dbs.length === 0 && client_id) {
      try {
        const { data: directData } = await supabase
          .from('data_sources')
          .select('*')
          .eq('client_id', client_id)
          .order('created_at', { ascending: false })

        if (directData && directData.length > 0) {
          dbs = directData.map(db => ({ ...db, bots_count: 0 }))
        }
      } catch {}
    }

    return NextResponse.json(dbs)
  } catch (e: any) {
    console.error('GET /api/databases unexpected error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const actor=await getAuthenticatedWorkspaceUser(req,'sources',true)
  if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
  try {
    const { name, purpose, data_type, lookup_field } = await req.json()
    const client_id=actor.workspaceId
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const { data, error } = await supabase
      .from('data_sources')
      .insert({
        client_id,
        name,
        purpose: purpose || null,
        data_type: data_type || 'custom',
        lookup_field: lookup_field || 'id',
        status: 'draft',
        source_count: 0,
        // Fallbacks for legacy schema constraints just in case
        endpoint_url: '',
        source_type: 'api'
      })
      .select()
      .single()

    if (error) {
      console.error("Supabase POST Databases Error:", error)
      if (error.code === '42703' || error.code === '42P01') return NextResponse.json({ error: 'Database migrations have not been applied' }, { status: 503 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
