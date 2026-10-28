import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

// GET /api/bot-databases?bot_id=xxx — List databases linked to a bot
export async function GET(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'sources')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const bot_id = req.nextUrl.searchParams.get('bot_id')
    if (!bot_id) {
      return NextResponse.json({ error: 'bot_id is required' }, { status: 400 })
    }
    const { data: ownedBot } = await supabase.from('bots').select('id').eq('id', bot_id).eq('client_id', actor.workspaceId).maybeSingle()
    if (!ownedBot) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const assignedMap = new Map<string, any>()

    // 1. Try querying bot_databases with joined data_sources
    try {
      const { data: botDbs, error } = await supabase
        .from('bot_databases')
        .select('id, bot_id, database_id, priority, created_at, data_sources (*)')
        .eq('bot_id', bot_id)
        .order('priority', { ascending: true })

      if (!error && botDbs) {
        for (const item of botDbs) {
          if (item.database_id) {
            assignedMap.set(item.database_id, item)
          }
        }
      } else {
        // Fallback: flat select on bot_databases
        const { data: flatDbs } = await supabase
          .from('bot_databases')
          .select('*')
          .eq('bot_id', bot_id)

        if (flatDbs) {
          for (const item of flatDbs) {
            if (item.database_id && !assignedMap.has(item.database_id)) {
              assignedMap.set(item.database_id, item)
            }
          }
        }
      }
    } catch {}

    // 2. Also check bot_data_sources (legacy / alternative table)
    try {
      const { data: botSources } = await supabase
        .from('bot_data_sources')
        .select('*')
        .eq('bot_id', bot_id)

      if (botSources) {
        for (const item of botSources) {
          const dbId = item.data_source_id || item.database_id
          if (dbId && !assignedMap.has(dbId)) {
            assignedMap.set(dbId, {
              id: item.id,
              bot_id: item.bot_id,
              database_id: dbId,
              priority: 0,
              created_at: item.created_at || new Date().toISOString(),
              data_sources: null
            })
          }
        }
      }
    } catch {}

    // 3. For any items missing data_sources object, fetch from data_sources table
    const itemsMissingDetails = Array.from(assignedMap.values()).filter(item => !item.data_sources)
    if (itemsMissingDetails.length > 0) {
      const dbIdsToFetch = itemsMissingDetails.map(item => item.database_id)
      const { data: dbRecords } = await supabase
        .from('data_sources')
        .select('*')
        .eq('client_id', actor.workspaceId)
        .in('id', dbIdsToFetch)

      if (dbRecords) {
        const recordMap = new Map<string, any>(dbRecords.map(r => [r.id, r]))
        for (const item of itemsMissingDetails) {
          const matched = recordMap.get(item.database_id)
          if (matched) {
            item.data_sources = matched
          }
        }
      }
    }

    const results = Array.from(assignedMap.values())
    return NextResponse.json(results)
  } catch (err: any) {
    console.error('GET /api/bot-databases error:', err)
    return NextResponse.json({ error: err.message || 'Invalid request' }, { status: 500 })
  }
}

// POST /api/bot-databases — Link a database to a bot
export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'sources', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { bot_id, database_id, priority = 0 } = await req.json()
    if (!bot_id || !database_id) {
      return NextResponse.json({ error: 'bot_id and database_id are required' }, { status: 400 })
    }
    const [bot, database] = await Promise.all([
      supabase.from('bots').select('id').eq('id', bot_id).eq('client_id', actor.workspaceId).maybeSingle(),
      supabase.from('data_sources').select('id').eq('id', database_id).eq('client_id', actor.workspaceId).maybeSingle(),
    ])
    if (!bot.data || !database.data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 1. Insert into bot_databases
    let primaryRecord: any = null
    const { data, error } = await supabase
      .from('bot_databases')
      .insert({ bot_id, database_id, priority })
      .select('id, bot_id, database_id, priority, created_at, data_sources (*)')
      .maybeSingle()

    if (!error && data) {
      primaryRecord = data
    } else if (error && error.code !== '23505') {
      // If error is relation-related, try inserting without select join
      const flatInsert = await supabase
        .from('bot_databases')
        .insert({ bot_id, database_id, priority })
        .select()
        .maybeSingle()
      if (flatInsert.data) primaryRecord = flatInsert.data
    }

    // 2. Also keep bot_data_sources in sync
    try {
      await supabase
        .from('bot_data_sources')
        .upsert({ bot_id, data_source_id: database_id }, { onConflict: 'bot_id,data_source_id' })
    } catch {}

    // Invalidate bot caches
    try {
      await redis.del(`bot_ctx:${bot_id}`)
      await redis.del(`live_data:${bot_id}:*`)
    } catch {}

    // Ensure data_sources details are attached
    if (primaryRecord && !primaryRecord.data_sources) {
      const { data: dbInfo } = await supabase.from('data_sources').select('*').eq('id', database_id).eq('client_id', actor.workspaceId).maybeSingle()
      if (dbInfo) primaryRecord.data_sources = dbInfo
    }

    return NextResponse.json(primaryRecord || { success: true, bot_id, database_id }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/bot-databases error:', err)
    return NextResponse.json({ error: err.message || 'Invalid request' }, { status: 500 })
  }
}

// DELETE /api/bot-databases?bot_id=xxx&database_id=xxx OR ?id=xxx — Unlink
export async function DELETE(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'sources', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = req.nextUrl.searchParams.get('id')
    const bot_id = req.nextUrl.searchParams.get('bot_id')
    const database_id = req.nextUrl.searchParams.get('database_id')

    if (!id && (!bot_id || !database_id)) {
      return NextResponse.json({ error: 'id or (bot_id and database_id) are required' }, { status: 400 })
    }

    const resolvedBotId = bot_id || (id
      ? (await supabase.from('bot_databases').select('bot_id').eq('id', id).maybeSingle()).data?.bot_id
      : null)
    const { data: ownedBot } = resolvedBotId
      ? await supabase.from('bots').select('id').eq('id', resolvedBotId).eq('client_id', actor.workspaceId).maybeSingle()
      : { data: null }
    if (!ownedBot) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (database_id) {
      const { data: ownedDatabase } = await supabase.from('data_sources').select('id').eq('id', database_id).eq('client_id', actor.workspaceId).maybeSingle()
      if (!ownedDatabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete from bot_databases
    if (id) {
      await supabase.from('bot_databases').delete().eq('id', id)
    }
    if (bot_id && database_id) {
      await supabase.from('bot_databases').delete().eq('bot_id', bot_id).eq('database_id', database_id)
      try {
        await supabase.from('bot_data_sources').delete().eq('bot_id', bot_id).eq('data_source_id', database_id)
      } catch {}
    }

    // Invalidate bot caches
    if (resolvedBotId) {
      try {
        await redis.del(`bot_ctx:${resolvedBotId}`)
        await redis.del(`live_data:${resolvedBotId}:*`)
      } catch {}
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid request' }, { status: 500 })
  }
}
