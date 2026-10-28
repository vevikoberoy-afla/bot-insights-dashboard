import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { classifyIntent } from './src/lib/guardrails.js'
// Since we can't easily run TS with imports here, I'll just write a script that does the supabase stuff.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
    const { data: bots } = await supabase
      .from('bots')
      .select('id, client_id, name, handoff_message, bot_flow')
      .eq('channel', 'telegram')
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    const bot = bots?.find(b => b.bot_flow?.integration_id) || null
    console.log('Selected Bot:', bot?.id)

    const integrationId = bot?.bot_flow?.integration_id
    console.log('Integration:', integrationId)
    
    // Simulate inserting message
    const chatId = 1111111
    const sessionId = `tg_${chatId}`
    console.log('Attempting upsert session:', sessionId)
    
    const { error: sessionErr } = await supabase.from('sessions').upsert({
      session_id: sessionId,
      client_id: bot.client_id,
      bot_id: bot.id,
      channel: 'telegram',
      mode: 'ai',
      last_message_at: new Date().toISOString()
    }, { onConflict: 'session_id' })
    console.log('Session Err:', sessionErr)

    const { error: msgErr } = await supabase.from('messages').insert([
      { context_id: bot.client_id, session_id: sessionId, bot_id: bot.id, channel: 'telegram', role: 'user', content: 'test msg' },
      { context_id: bot.client_id, session_id: sessionId, bot_id: bot.id, channel: 'telegram', role: 'assistant', content: 'test response' },
    ])
    console.log('Msg Err:', msgErr)
}
check()
