import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { embed } from '@/lib/embeddings'
import { generateAnswer } from '@/lib/groq'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const datasetId = params.id
    const actor = await getAuthenticatedWorkspaceResource(req, 'datasets', datasetId, 'knowledge')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { question, history = [] } = await req.json()

    if (!question?.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    // Embed question
    const questionEmbedding = await embed(question.trim())
    const embeddingStr = JSON.stringify(questionEmbedding)

    // Retrieve chunks specifically for this dataset
    const { data: chunks } = await supabase.rpc('match_chunks_by_datasets', {
      p_dataset_ids: [datasetId],
      p_embedding: embeddingStr,
      p_match_count: 5,
    })

    // Generate answer
    const { answer, source_url } = await generateAnswer(
      question.trim(),
      chunks ?? [],
      history,
      null,
      'en'
    )

    return NextResponse.json({ answer, source_url, chunks_used: chunks?.length || 0 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
