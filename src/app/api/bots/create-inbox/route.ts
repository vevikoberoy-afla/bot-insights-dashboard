import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createInbox } from '@/lib/chatwoot'
import {requireWorkspace} from '@/lib/saas/context'

export async function POST(req: NextRequest) {
  try {
    const ctx=await requireWorkspace(null,'bots',true)
    const { botId, botName } = await req.json()

    

    // Create inbox in Chatwoot
    const inbox = await createInbox(`${botName}`)

    // Save inbox ID to bot record
    await supabase
      .from('bots')
      .update({ chatwoot_inbox_id: inbox.id })
      .eq('id', botId)
      .eq('client_id',ctx.workspaceId)

    return Response.json({ inboxId: inbox.id })

  } catch (error) {
    console.error('[Create Inbox] Error:', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
