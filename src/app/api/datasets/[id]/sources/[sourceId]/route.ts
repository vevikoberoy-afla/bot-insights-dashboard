import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'
import { KnowledgeCrawlError, startKnowledgeCrawl } from '@/lib/knowledgeCrawler'
import { crawlRateLimit } from '@/lib/ratelimit'
import { documentPolicy, DocumentImportError } from '@/lib/knowledge/documentPolicy'

export const maxDuration = 60

// DELETE /api/datasets/[id]/sources/[sourceId]
export async function DELETE(
    req: NextRequest,
    props: { params: Promise<{ id: string; sourceId: string }> }
) {
    const params = await props.params;
    const { id: dataset_id, sourceId } = params
    const actor = await getAuthenticatedWorkspaceResource(req, 'datasets', dataset_id, 'knowledge', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: ownedSource } = await supabase.from('dataset_sources').select('id').eq('id', sourceId).eq('dataset_id', dataset_id).maybeSingle()
    if (!ownedSource) return NextResponse.json({ error: 'Source not found' }, { status: 404 })

    // Delete all chunks tied to this source
    const chunksDeleted = await supabase.from('chunks').delete().eq('dataset_source_id', sourceId).eq('dataset_id', dataset_id)
    if (chunksDeleted.error) return NextResponse.json({ error: 'Could not remove source content' }, { status: 500 })

    // Delete the source record
    const { error } = await supabase.from('dataset_sources').delete().eq('id', sourceId).eq('dataset_id', dataset_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Recount
    const { count: chunkCount } = await supabase
        .from('chunks')
        .select('id', { count: 'exact', head: true })
        .eq('dataset_id', dataset_id)
        .eq('active', true)

    const { count: sourceCount } = await supabase
        .from('dataset_sources')
        .select('id', { count: 'exact', head: true })
        .eq('dataset_id', dataset_id)

    // Determine new dataset status
    const { count: readyCount } = await supabase
        .from('dataset_sources')
        .select('id', { count: 'exact', head: true })
        .eq('dataset_id', dataset_id)
        .eq('status', 'ready')

    await supabase.from('datasets').update({
        chunk_count: chunkCount || 0,
        source_count: sourceCount || 0,
        status: readyCount && readyCount > 0 ? 'ready' : 'draft'
    }).eq('id', dataset_id)

    return NextResponse.json({ success: true })
}

// POST /api/datasets/[id]/sources/[sourceId]/retry — re-queue a failed source
export async function POST(
    req: NextRequest,
    props: { params: Promise<{ id: string; sourceId: string }> }
) {
    const params = await props.params;
    const { sourceId } = params
    const actor = await getAuthenticatedWorkspaceResource(req, 'datasets', params.id, 'knowledge', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: source, error } = await supabase
        .from('dataset_sources')
        .select('*')
        .eq('id', sourceId)
        .eq('dataset_id', params.id)
        .single()

    if (error || !source) return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    if (source.status !== 'error') return NextResponse.json({ error: 'Only failed sources can be retried.' }, { status: 409 })
    if (source.document_state?.scan_status === 'passed' && source.document_state?.text) {
        try {
            const policy=await documentPolicy(actor.workspaceId)
            if(!policy.maxBytes)throw new DocumentImportError('Document imports are disabled for your workspace.',403)
            const resumed = await supabase.from('dataset_sources').update({status:'processing',error_msg:null,crawl_lease:null,crawl_lease_until:null}).eq('id',sourceId).eq('dataset_id',params.id).eq('status','error').select('id,dataset_id,source_type,source_ref,source_name,status,error_msg,chunk_count,created_at').single()
            if(resumed.error)throw new Error('Could not resume document import')
            return NextResponse.json({success:true,source:resumed.data})
        }catch(error){return NextResponse.json({error:error instanceof DocumentImportError?error.message:'Could not resume document import.'},{status:error instanceof DocumentImportError?error.status:503})}
    }

    if (['website_crawl','url'].includes(source.source_type) && source.source_ref) {
        try {
            const rate = await crawlRateLimit.limit(`knowledge:${actor.workspaceId}`)
            if (!rate.success) return NextResponse.json({ error: 'Please wait before retrying another import.' }, { status: 429 })
            if (source.crawl_state?.job_id && !source.crawl_state.restart_required) {
                const result = await supabase.from('dataset_sources').update({ status: 'processing', error_msg: null, crawl_lease: null, crawl_lease_until: null }).eq('id', sourceId).eq('dataset_id', params.id).eq('status','error').select().single()
                if (result.error) throw new Error('Could not resume website import')
                return NextResponse.json({ success: true, source: result.data })
            }
            const replacement = await startKnowledgeCrawl(params.id, actor.workspaceId, {
                source_ref: source.source_ref, source_name: source.source_name,
                mode: source.crawl_state?.mode || 'single', selected_urls: source.crawl_state?.selected,
            })
            const removed = await supabase.from('chunks').delete().eq('dataset_source_id', sourceId).eq('dataset_id', params.id)
            if (removed.error) throw new Error('Could not replace failed source')
            const deleted = await supabase.from('dataset_sources').delete().eq('id', sourceId).eq('dataset_id', params.id)
            if (deleted.error) throw new Error('Could not replace failed source')
            return NextResponse.json({ success: true, source: replacement })
        } catch (error) { return NextResponse.json({ error: error instanceof KnowledgeCrawlError ? error.message : 'Could not retry this source.' }, { status: error instanceof KnowledgeCrawlError ? error.status : 503 }) }
    }

    return NextResponse.json({ error: 'Remove this source and import it again to retry.' }, { status: 400 })
}
