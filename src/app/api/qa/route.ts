import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { embed } from '@/lib/embeddings'
import { getAuthContext } from '@/lib/auth'

// GET — list QA pairs for a context
export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req)
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contextId = req.nextUrl.searchParams.get('context_id')
  if (!contextId) return NextResponse.json({ error: 'context_id required' }, { status: 400 })
  const { data: owner } = await supabase.from('clients').select('id').eq('id', auth.organizationId).eq('context_id', contextId).maybeSingle()
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await supabase
    .from('qa_pairs')
    .select('*')
    .eq('context_id', contextId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ qa_pairs: data ?? [] })
}

// POST — create a QA pair
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req)
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { context_id, question, answer, source_url } = await req.json()

    if (!context_id || !question?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: 'context_id, question, and answer are required' }, { status: 400 })
    }
    const { data: owner } = await supabase.from('clients').select('id').eq('id', auth.organizationId).eq('context_id', context_id).maybeSingle()
    if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Embed the question for similarity matching
    const questionEmbedding = await embed(question.trim())

    const { data, error } = await supabase
      .from('qa_pairs')
      .insert({
        context_id,
        question: question.trim(),
        answer: answer.trim(),
        source_url: source_url || null,
        question_embedding: JSON.stringify(questionEmbedding),
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ qa_pair: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE — remove a QA pair
export async function DELETE(req: NextRequest) {
  const auth = await getAuthContext(req)
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: pair } = await supabase.from('qa_pairs').select('context_id').eq('id', id).maybeSingle()
  const { data: owner } = pair?.context_id
    ? await supabase.from('clients').select('id').eq('id', auth.organizationId).eq('context_id', pair.context_id).maybeSingle()
    : { data: null }
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await supabase.from('qa_pairs').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
