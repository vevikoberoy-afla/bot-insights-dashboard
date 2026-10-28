import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { assertSafeOutboundUrl } from '@/lib/urlSecurity'
import { encryptTenantSecret } from '@/lib/security/secretVault'
import crypto from 'node:crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req,'settings')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: client } = await supabase.from('clients').select('context_id').eq('id', actor.workspaceId).single()
    
    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select('id, context_id, url, events, is_active, last_triggered_at, created_at')
      .eq('context_id', client?.context_id || '__invalid__')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ webhooks })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req,'settings',true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { url, events } = await req.json()
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    const safeUrl = await assertSafeOutboundUrl(String(url))
    const { data: client } = await supabase.from('clients').select('context_id').eq('id', actor.workspaceId).single()
    if (!client?.context_id) return NextResponse.json({ error: 'Workspace context is not configured' }, { status: 409 })
    const signingSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`

    const { data: inserted, error } = await supabase
      .from('webhooks')
      .insert({ url: safeUrl.toString(), context_id: client.context_id, events: Array.isArray(events) ? events.slice(0, 30) : ['message.received'], secret: encryptTenantSecret(actor.workspaceId, signingSecret) })
      .select('id, context_id, url, events, is_active, last_triggered_at, created_at')
      .single()

    if (error) throw error

    return NextResponse.json({ webhook: inserted, signingSecretShownOnce: signingSecret })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req,'settings',true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const { data: client } = await supabase.from('clients').select('context_id').eq('id', actor.workspaceId).single()
    const { data: deleted, error } = await supabase.from('webhooks').delete().eq('id', id).eq('context_id', client?.context_id || '__invalid__').select('id').maybeSingle()
    if (error) throw error
    if (!deleted) return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
