import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { lookupInDataSource } from '@/lib/datasource'
import { getAuthContext } from '@/lib/auth'

// GET — get data source for a context
export async function GET(req: NextRequest) {
    const auth = await getAuthContext(req)
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const contextId = req.nextUrl.searchParams.get('context_id')
    if (!contextId) return NextResponse.json({ error: 'context_id required' }, { status: 400 })
    const { data: owner } = await supabase.from('clients').select('id').eq('id', auth.organizationId).eq('context_id', contextId).maybeSingle()
    if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data } = await supabase
        .from('data_sources')
        .select('*')
        .eq('context_id', contextId)
        .order('created_at', { ascending: false })

    return NextResponse.json({ data_sources: data ?? [] })
}

// POST — create or upsert data source
export async function POST(req: NextRequest) {
    const auth = await getAuthContext(req)
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const {
            context_id, name, source_type,
            endpoint_url, auth_header,
            lookup_param, field_mapping,
        } = await req.json()

        if (!context_id || !endpoint_url) {
            return NextResponse.json({ error: 'context_id and endpoint_url required' }, { status: 400 })
        }
        const { data: owner } = await supabase.from('clients').select('id').eq('id', auth.organizationId).eq('context_id', context_id).maybeSingle()
        if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })



        const { data, error } = await supabase
            .from('data_sources')
            .insert({
                context_id,
                name: name ?? 'Order Database',
                source_type: source_type ?? 'google_sheets',
                endpoint_url,
                auth_header: auth_header || null,
                lookup_param: lookup_param ?? 'id',
                field_mapping: field_mapping ?? { id: 'id', status: 'status' },
                enabled: true,
            })
            .select()
            .single()

        if (error) throw new Error(error.message)

        // Automatically link this new data source to all of the client's bots
        const { data: clientCheck } = await supabase
            .from('clients')
            .select('id')
            .eq('context_id', context_id)
            .single()
            
        if (clientCheck) {
            const { data: bots } = await supabase
                .from('bots')
                .select('id')
                .eq('client_id', clientCheck.id)

            if (bots && bots.length > 0) {
                const links = bots.map(b => ({ bot_id: b.id, data_source_id: data.id }))
                await supabase.from('bot_data_sources').insert(links)
            }
        }

        return NextResponse.json({ success: true, id: data.id })

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

// DELETE — remove data source
export async function DELETE(req: NextRequest) {
    const auth = await getAuthContext(req)
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await supabase.from('data_sources').delete().eq('id', id).eq('client_id', auth.organizationId)
    return NextResponse.json({ success: true })
}

// PUT — test a data source with a sample order ID
export async function PUT(req: NextRequest) {
    const auth = await getAuthContext(req)
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { context_id, test_id } = await req.json()
        if (!context_id || !test_id) {
            return NextResponse.json({ error: 'context_id and test_id required' }, { status: 400 })
        }
        const { data: owner } = await supabase.from('clients').select('id').eq('id', auth.organizationId).eq('context_id', context_id).maybeSingle()
        if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const result = await lookupInDataSource(context_id, test_id)
        return NextResponse.json({
            success: true,
            found: !!result,
            result: result ?? 'No record found for that ID',
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Lookup failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
