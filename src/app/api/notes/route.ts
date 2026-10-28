import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checked, requireWorkspace, saasError } from '@/lib/saas/context'
export const dynamic='force-dynamic'

export async function GET(req: NextRequest) {
    try {
        const ctx=await requireWorkspace(req.nextUrl.searchParams.get('client_id'),'settings')
        const rows=checked(await supabase.from('notes').select('*').eq('client_id',ctx.workspaceId).order('updated_at',{ascending:false}))
        return NextResponse.json(rows || [])
    } catch(error) { return saasError(error) }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { client_id, title, content, is_snippet, author_id } = body
        const ctx=await requireWorkspace(client_id,'settings',true)

        if (!title?.trim()) {
            return NextResponse.json({ error: 'title is required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('notes')
            .insert({
                client_id: ctx.workspaceId,
                author_id: ctx.user.id,
                title: title.trim(),
                content: content || '',
                is_snippet: is_snippet || false
            })
            .select()
            .single()

        checked({data,error})
        return NextResponse.json(data, { status: 201 })
    } catch(error) {
        return saasError(error)
    }
}
