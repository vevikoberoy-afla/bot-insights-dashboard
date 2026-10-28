import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await getAuthenticatedWorkspaceResource(req, 'agent_actions', params.id, 'campaigns', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { decision } = await req.json() // 'approved' | 'rejected'
    if (!['approved', 'rejected'].includes(decision)) return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
    

    await supabase
      .from('agent_actions')
      .update({ status: decision, decided_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('client_id', actor.workspaceId)

    // Log to the existing audit_logs table with actor_type = 'human'
    await supabase.from('audit_logs').insert({
      actor_type: 'human',
      action: `agent_action_${decision}`,
      target: params.id,
    })

    return NextResponse.json({ status: decision })
  } catch (error) {
    console.error('[Agent Action Decide] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
