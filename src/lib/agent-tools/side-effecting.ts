import { supabase } from '@/lib/supabase'
import type { ToolContext, ToolResult } from './types'

/** propose_campaign — stage a campaign launch for approval */
export async function proposeCampaign(
  ctx: ToolContext,
  payload: { segmentCriteria: Record<string, unknown>; channel: string; copy: string }
): Promise<ToolResult<{ actionId: string }>> {
  
  const { data, error } = await supabase
    .from('agent_actions')
    .insert({
      client_id: ctx.clientId,
      action_type: 'launch_campaign',
      payload,
      status: 'proposed',
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { actionId: data.id } }
}

/** execute_approved_action — runs a previously approved action */
export async function executeApprovedAction(
  ctx: ToolContext,
  actionId: string
): Promise<ToolResult<{ status: string }>> {
  
  const { data: action } = await supabase
    .from('agent_actions')
    .select('*')
    .eq('id', actionId)
    .eq('client_id', ctx.clientId)
    .single()

  if (!action || action.status !== 'approved') {
    return { ok: false, error: 'Action not found or not approved' }
  }

  try {
    if (action.action_type === 'launch_campaign') {
      // Delegate to your existing Dittofeed campaign trigger logic here.
      // Placeholder — wire to your actual Dittofeed broadcast call.
    }
    await supabase
      .from('agent_actions')
      .update({ status: 'executed', executed_at: new Date().toISOString() })
      .eq('id', actionId)
    return { ok: true, data: { status: 'executed' } }
  } catch (err) {
    await supabase
      .from('agent_actions')
      .update({ status: 'failed', result: { error: String(err) } })
      .eq('id', actionId)
    return { ok: false, error: String(err) }
  }
}
