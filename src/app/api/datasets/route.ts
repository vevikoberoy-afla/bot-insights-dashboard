import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { normalizeKnowledgePurpose } from '@/lib/knowledgeCrawlPolicy'

export async function GET(req: NextRequest) {
    const actor=await getAuthenticatedWorkspaceUser(req,'knowledge')
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    const client_id = actor.workspaceId
    const id = req.nextUrl.searchParams.get('id')

    if (id) {
        const { data, error } = await supabase
            .from('datasets')
            .select(`
                *,
                dataset_sources(id, source_type, source_name, status, chunk_count, created_at),
                bot_datasets(bot_id, bots(id, name))
            `)
            .eq('id', id)
            .eq('client_id',client_id)
            .single()
        
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data)
    }

    if (!client_id) return NextResponse.json({ error: 'client_id or id is required' }, { status: 400 })

    const { data, error } = await supabase
        .from('datasets')
        .select(`
            *,
            dataset_sources(id, source_type, source_name, status, chunk_count, created_at),
            bot_datasets(bot_id, bots(id, name))
        `)
        .eq('client_id', client_id)
        .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
}

// POST /api/datasets — create a new dataset
export async function POST(req: NextRequest) {
    const actor=await getAuthenticatedWorkspaceUser(req,'knowledge',true)
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    try {
        const body = await req.json()
        const client_id=actor.workspaceId
        const { name, description, purpose, tags, created_from } = body

        // CHECK 1: name required
        if (!client_id || !name?.trim()) {
            return NextResponse.json({ error: 'client_id and name are required' }, { status: 400 })
        }
        if (name.trim().length < 3) {
            return NextResponse.json({ error: 'Name must be at least 3 characters' }, { status: 400 })
        }
        if (name.trim().length > 80) {
            return NextResponse.json({ error: 'Name must be 80 characters or less' }, { status: 400 })
        }

        // CHECK 2: name uniqueness per client
        const { count: nameCount } = await supabase
            .from('datasets')
            .select('id', { count: 'exact', head: true })
            .eq('client_id', client_id)
            .ilike('name', name.trim())

        if (nameCount && nameCount > 0) {
            return NextResponse.json({
                error: `You already have a knowledge base called "${name.trim()}". Please choose a different name.`
            }, { status: 409 })
        }

        const { data, error } = await supabase
            .from('datasets')
            .insert({
                client_id,
                name: name.trim(),
                description: description?.trim() || null,
                purpose: normalizeKnowledgePurpose(purpose ?? 'general'),
                tags: tags || [],
                status: 'draft',
                chunk_count: 0,
                source_count: 0,
                created_from: created_from || 'manual',
            })
            .select()
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data, { status: 201 })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 })
    }
}

// PUT /api/datasets — update metadata only (no re-embedding)
export async function PUT(req: NextRequest) {
    const actor=await getAuthenticatedWorkspaceUser(req,'knowledge',true)
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    try {
        const body = await req.json()
        const client_id=actor.workspaceId
        const { id, name, description, purpose, tags } = body
        if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

        // Name uniqueness check (exclude self)
        if (name) {
            if (name.trim().length < 3 || name.trim().length > 80) {
                return NextResponse.json({ error: 'Name must be 3–80 characters' }, { status: 400 })
            }
            const { count } = await supabase
                .from('datasets')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', client_id)
                .ilike('name', name.trim())
                .neq('id', id)

            if (count && count > 0) {
                return NextResponse.json({
                    error: `You already have a knowledge base called "${name.trim()}". Please choose a different name.`
                }, { status: 409 })
            }
        }

        const { data, error } = await supabase
            .from('datasets')
            .update({ ...(name !== undefined ? { name: name.trim() } : {}), ...(description !== undefined ? { description: description?.trim() || null } : {}), ...(purpose !== undefined ? { purpose: normalizeKnowledgePurpose(purpose) } : {}), ...(tags !== undefined ? { tags } : {}), updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('client_id',client_id)
            .select()
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data)
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 })
    }
}

// DELETE /api/datasets?id=xxx
export async function DELETE(req: NextRequest) {
    const actor=await getAuthenticatedWorkspaceUser(req,'knowledge',true)
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Warn if assigned to active bots
    const { count: botCount } = await supabase
        .from('bot_datasets')
        .select('bot_id', { count: 'exact', head: true })
        .eq('dataset_id', id)

    if ((botCount || 0) > 0) {
        const force = req.nextUrl.searchParams.get('force')
        if (force !== 'true') {
            return NextResponse.json({
                warning: true,
                botCount,
                message: `This knowledge base is used by ${botCount} bot(s). Deleting it will remove it from those bots. Add ?force=true to confirm.`
            }, { status: 200 })
        }
    }

    const { error } = await supabase.from('datasets').delete().eq('id', id).eq('client_id',actor.workspaceId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
