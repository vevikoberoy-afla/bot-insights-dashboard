import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { chunkText } from '@/lib/chunker'
import { embed, hashText } from '@/lib/embeddings'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

async function ownsKnowledgeScope(workspaceId: string, contextId: string | null, datasetId: string | null) {
  if (datasetId) {
    const { data } = await supabase.from('datasets').select('id').eq('id', datasetId).eq('client_id', workspaceId).maybeSingle()
    return Boolean(data)
  }
  if (contextId) {
    const { data } = await supabase.from('clients').select('id').eq('id', workspaceId).eq('context_id', contextId).maybeSingle()
    return Boolean(data)
  }
  return false
}

// GET — list chunks or messages for a context or dataset
export async function GET(req: NextRequest) {
  const actor = await getAuthenticatedWorkspaceUser(req, 'knowledge')
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const contextId = req.nextUrl.searchParams.get('context_id')
  const datasetId = req.nextUrl.searchParams.get('dataset_id')
  const type = req.nextUrl.searchParams.get('type')

  if (!contextId && !datasetId) {
    return NextResponse.json({ error: 'context_id or dataset_id required' }, { status: 400 })
  }
  if (!await ownsKnowledgeScope(actor.workspaceId, contextId, datasetId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Return messages (chat logs) for the chats tab
  if (type === 'messages') {
    const botId = req.nextUrl.searchParams.get('bot_id')
    let msgQuery = supabase
      .from('messages')
      .select('*')
      .eq('context_id', contextId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (botId) {
      msgQuery = msgQuery.eq('bot_id', botId)
    }

    const { data: messages } = await msgQuery
    return NextResponse.json({ messages: messages ?? [] })
  }

  // Return chunks for the context or dataset tab
  let query = supabase
    .from('chunks')
    .select('id, title, text, source_url, source_type, created_at, active')
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (datasetId) {
    query = query.eq('dataset_id', datasetId)
  } else if (contextId) {
    query = query.eq('context_id', contextId)
  }

  const { data: chunks } = await query

  return NextResponse.json({ chunks: chunks ?? [] })
}

// POST — add a new manual text chunk
export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'knowledge', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { context_id, dataset_id, title, text, source_type = 'manual', source_url = null } = await req.json()

    if ((!context_id && !dataset_id) || !text?.trim() || !title?.trim()) {
      return NextResponse.json({ error: 'dataset_id, title, and text are required' }, { status: 400 })
    }
    if (!await ownsKnowledgeScope(actor.workspaceId, context_id || null, dataset_id || null)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Chunk the text (even manual entries might be long)
    const chunks = await chunkText(text.trim())
    if (!chunks.length) {
      return NextResponse.json({ error: 'Text too short to process' }, { status: 400 })
    }

    const results: any[] = []

    for (const chunk of chunks) {
      const hash = hashText(chunk)

      // Skip if already exists
      let existingQuery = supabase
        .from('chunks')
        .select('id')
        .eq('chunk_hash', hash)

      if (dataset_id) {
          existingQuery = existingQuery.eq('dataset_id', dataset_id)
      } else if (context_id) {
          existingQuery = existingQuery.eq('context_id', context_id)
      }

      const { data: existing } = await existingQuery.single()

      if (existing) continue

      // Embed this chunk
      const embedding = await embed(chunk)

      const insertData: any = {
          title: title.trim(),
          text: chunk,
          chunk_hash: hash,
          embedding: JSON.stringify(embedding),
          source_url,
          source_type,
          active: true,
      }
      if (dataset_id) insertData.dataset_id = dataset_id
      if (context_id) insertData.context_id = context_id

      const { data, error } = await supabase
        .from('chunks')
        .insert(insertData)
        .select()
        .single()

      if (error) throw new Error(error.message)
      results.push(data)
    }

    return NextResponse.json({ success: true, chunks_added: results.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE — soft delete a chunk by id
export async function DELETE(req: NextRequest) {
  const actor = await getAuthenticatedWorkspaceUser(req, 'knowledge', true)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const chunkId = req.nextUrl.searchParams.get('chunk_id')

  if (!chunkId) {
    return NextResponse.json({ error: 'chunk_id required' }, { status: 400 })
  }
  const { data: chunk } = await supabase.from('chunks').select('context_id,dataset_id').eq('id', chunkId).maybeSingle()
  if (!chunk || !await ownsKnowledgeScope(actor.workspaceId, chunk.context_id || null, chunk.dataset_id || null)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('chunks')
    .update({ active: false })
    .eq('id', chunkId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
