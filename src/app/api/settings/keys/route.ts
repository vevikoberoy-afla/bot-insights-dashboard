import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { randomBytes } from 'crypto'
import { featureAllowed, getEffectiveEntitlements } from '@/lib/saas/entitlements'

// Use service role to bypass RLS since users table might not be fully linked for admin yet
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Generate a random crypto string
function generateKey() {
  return 'vt_' + randomBytes(32).toString('hex')
}

// Simple hash (in production use bcrypt or similar, but for now a simple sha256 via crypto if we had it. 
// For simplicity we will store it directly since we just need it working, wait, the schema requires key_hash.
// We can use a simple Web Crypto API hash.
async function hashKey(key: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedWorkspaceUser(req,'settings')
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    // In a real app we'd verify the token via auth.getUser, but we are using service role to fetch keys
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, name, prefix, created_at, last_used_at')
      .eq('client_id', user.workspaceId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ keys })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedWorkspaceUser(req,'settings',true)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name } = await req.json()
    if (!featureAllowed(await getEffectiveEntitlements(user.workspaceId), 'api.enabled')) return NextResponse.json({error:'API access is not included in your workspace plan.'},{status:403})
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const rawKey = generateKey()
    const hashed = await hashKey(rawKey)
    const prefix = rawKey.substring(0, 8)

    const { data: inserted, error } = await supabase
      .from('api_keys')
      .insert({
        name,
        key_hash: hashed,
        prefix,
        client_id: user.workspaceId,
      })
      .select('id, name, prefix, created_at, last_used_at')
      .single()

    if (error) throw error

    return NextResponse.json({ key: rawKey, record: inserted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedWorkspaceUser(req,'settings',true)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const { error } = await supabase.from('api_keys').delete().eq('id', id).eq('client_id', user.workspaceId)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
