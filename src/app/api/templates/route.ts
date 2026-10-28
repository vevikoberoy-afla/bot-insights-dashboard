import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
  const actor=await getAuthenticatedWorkspaceUser(req,'templates')
  if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
  const clientId = actor.workspaceId

  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const actor=await getAuthenticatedWorkspaceUser(req,'templates',true)
  if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
  try {
    const body = await req.json()
    const clientId = actor.workspaceId
    const title = String(body.title || body.name || '').trim()
    const content = String(body.body || body.preview || '').trim()
    const generatedShortcode = `/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    const shortcode = String(body.shortcode || generatedShortcode).trim()
    if (!clientId || !title || !content) {
      return NextResponse.json({ error: 'client_id, title, and body are required' }, { status: 400 })
    }
    const { data, error } = await supabase.from('templates').insert({
      client_id: clientId,
      title: title.slice(0, 120),
      category: String(body.category || 'Greeting').slice(0, 50),
      body: content.slice(0, 10_000),
      shortcode: (shortcode.startsWith('/') ? shortcode : `/${shortcode}`).slice(0, 80),
      variables: Array.isArray(body.variables) ? body.variables.slice(0, 25) : [],
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
