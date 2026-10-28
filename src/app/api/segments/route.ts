import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

const safeColor = (value: unknown) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#2563EB'

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedWorkspaceUser(req,'contacts')
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const { data, error } = await supabase
    .from('contact_segments')
    .select('*, contact_segment_members(count)')
    .eq('client_id', user.workspaceId)
    .order('is_system', { ascending: false })
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data || []).map((segment: any) => ({
    ...segment,
    contact_count: segment.contact_segment_members?.[0]?.count || 0,
    contact_segment_members: undefined,
  })))
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedWorkspaceUser(req,'contacts',true)
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const body = await req.json()
    const name = String(body.name || '').trim().slice(0, 100)
    if (!name) return NextResponse.json({ error: 'Segment name is required' }, { status: 400 })
    const { data, error } = await supabase.from('contact_segments').insert({
      client_id: user.workspaceId,
      name,
      description: String(body.description || '').trim().slice(0, 300) || null,
      color: safeColor(body.color),
      segment_type: 'manual',
      is_system: false,
      rules: [],
    }).select('*').single()
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'A segment with this name already exists' : error.message }, { status: 400 })
    return NextResponse.json({ ...data, contact_count: 0 }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid request' }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedWorkspaceUser(req,'contacts',true)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const body = await req.json()
  const name = String(body.name || '').trim().slice(0, 100)
  if (!body.id || !name) return NextResponse.json({ error: 'Segment id and name are required' }, { status: 400 })
  const { data, error } = await supabase.from('contact_segments')
    .update({ name, description: String(body.description || '').trim().slice(0, 300) || null, color: safeColor(body.color), updated_at: new Date().toISOString() })
    .eq('id', body.id).eq('client_id', user.workspaceId).eq('is_system', false).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Automatic segments cannot be edited' }, { status: 403 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedWorkspaceUser(req,'contacts',true)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Segment id is required' }, { status: 400 })
  const { data, error } = await supabase.from('contact_segments').delete()
    .eq('id', id).eq('client_id', user.workspaceId).eq('is_system', false).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Automatic segments cannot be deleted' }, { status: 403 })
  return NextResponse.json({ success: true })
}
