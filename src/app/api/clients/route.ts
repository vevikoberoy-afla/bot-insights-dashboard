import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import FirecrawlApp from '@mendable/firecrawl-js'
import { getAuthContext } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { allowedKnowledgeUrl, CRAWL_EXCLUDE_PATHS } from '@/lib/knowledgeCrawlPolicy'
import { assertSafeOutboundUrl } from '@/lib/urlSecurity'

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! })

// GET — list all clients with stats
export async function GET(req: NextRequest) {
    const auth = await getAuthContext(req)
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')

    // Single client
    if (id) {
        const { data: client } = await supabase
            .from('clients')
            .select('*')
            .eq('id', id)
            .single()

        if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

        // Get stats
        const stats = await getClientStats(client.context_id)
        return NextResponse.json({ client: { ...client, ...stats } })
    }

    // All clients
    const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })

    if (!clients?.length) return NextResponse.json({ clients: [] })

    // Fetch stats for each client
    const withStats = await Promise.all(
        clients.map(async (c) => {
            const stats = await getClientStats(c.context_id)
            return { ...c, ...stats }
        })
    )

    return NextResponse.json({ clients: withStats })
}

async function getClientStats(contextId: string | null) {
    if (!contextId) return { message_count: 0, chunk_count: 0, crawl_status: 'none' }

    const [msgRes, chunkRes, ctxRes] = await Promise.all([
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('context_id', contextId).eq('role', 'user'),
        supabase.from('chunks').select('id', { count: 'exact', head: true }).eq('context_id', contextId).eq('active', true),
        supabase.from('contexts').select('crawl_status, chunk_count, page_count').eq('id', contextId).single(),
    ])

    return {
        message_count: msgRes.count ?? 0,
        chunk_count: chunkRes.count ?? 0,
        crawl_status: ctxRes.data?.crawl_status ?? 'none',
        page_count: ctxRes.data?.page_count ?? 0,
    }
}

// POST — create new client + optionally start crawl
export async function POST(req: NextRequest) {
    const auth = await getAuthContext(req)
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const {
            name, email, website_url, notes,
            start_crawl = true,
            max_pages = 50,
            include_paths = [],
            exclude_paths = [],
        } = await req.json()

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
        }

        let contextId: string | null = null
        let crawlStarted = false

        // Start crawl if website URL provided
        if (website_url?.trim() && start_crawl) {
            if (!allowedKnowledgeUrl(website_url.trim())) return NextResponse.json({ error: 'Choose a public website page suitable for your knowledge base.' }, { status: 400 })
            await assertSafeOutboundUrl(website_url.trim())
            const { data: context } = await supabase
                .from('contexts')
                .insert({ site_url: website_url.trim(), crawl_status: 'crawling' })
                .select()
                .single()

            if (context) {
                contextId = context.id
                const safeLimit = Math.min(Math.max(5, max_pages), 200)

                const crawlOptions: Record<string, unknown> = {
                    limit: safeLimit,
                    maxDepth: 2,
                    allowExternalLinks: false,
                    scrapeOptions: {
                        formats: ['markdown'],
                        onlyMainContent: true,
                        excludeTags: ['nav', 'footer', 'header', 'aside', 'script', 'style', 'form'],
                    },
                }
                if (include_paths.length > 0) crawlOptions.includePaths = include_paths
                crawlOptions.excludePaths = [...CRAWL_EXCLUDE_PATHS, ...exclude_paths]

                const crawlResult = await firecrawl.asyncCrawlUrl(website_url.trim(), crawlOptions)

                // Store the job ID so the GET poll handler can check Firecrawl directly
                if (crawlResult.success && crawlResult.id) {
                    await supabase
                        .from('contexts')
                        .update({ firecrawl_job_id: crawlResult.id })
                        .eq('id', contextId)
                }
                crawlStarted = true
            }
        }

        // Create client record
        const { data: client, error } = await supabase
            .from('clients')
            .insert({
                name: name.trim(),
                email: email?.trim() || null,
                website_url: website_url?.trim() || null,
                context_id: contextId,
                notes: notes?.trim() || null,
            })
            .select()
            .single()

        if (error) throw new Error(error.message)

        return NextResponse.json({
            client,
            crawl_started: crawlStarted,
            manage_url: contextId ? `${process.env.NEXT_PUBLIC_APP_URL}/manage/${contextId}` : null,
            embed_snippet: contextId
                ? `<script src="${process.env.NEXT_PUBLIC_APP_URL}/widget.js?v=7" data-ctx="${contextId}" defer></script>`
                : null,
        })

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

// PUT — update client info
export async function PUT(req: NextRequest) {
    const auth = await getAuthContext(req)
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { id, name, email, website_url, notes, theme_color, widget_title, welcome_message } = await req.json()
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

        const updates: Record<string, unknown> = {}
        if (name !== undefined) updates.name = name.trim()
        if (email !== undefined) updates.email = email?.trim() || null
        if (website_url !== undefined) updates.website_url = website_url?.trim() || null
        if (notes !== undefined) updates.notes = notes?.trim() || null
        if (theme_color !== undefined) updates.theme_color = theme_color?.trim() || null
        if (widget_title !== undefined) updates.widget_title = widget_title?.trim() || null
        if (welcome_message !== undefined) updates.welcome_message = welcome_message?.trim() || null

        const { error } = await supabase.from('clients').update(updates).eq('id', id)
        if (error) throw new Error(error.message)

        await logAudit(null, 'CLIENT_UPDATED', id, updates, req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || undefined)

        return NextResponse.json({ success: true })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

// DELETE — delete client and all associated data
export async function DELETE(req: NextRequest) {
    const auth = await getAuthContext(req)
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Get context_id before deleting
    const { data: client } = await supabase
        .from('clients')
        .select('context_id')
        .eq('id', id)
        .single()

    // Delete client (context cascade deletes chunks, messages, cache, qa_pairs)
    await supabase.from('clients').delete().eq('id', id)

    if (client?.context_id) {
        await supabase.from('contexts').delete().eq('id', client.context_id)
    }

    return NextResponse.json({ success: true })
}
