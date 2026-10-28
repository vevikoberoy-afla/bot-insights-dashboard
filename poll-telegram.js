import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

let offset = 0;

async function pollTelegram() {
  console.log('🤖 Starting Telegram Local Poller...');

  // 1. Find the active Telegram Bot in the system that has an integration linked
  const { data: bots } = await supabase
    .from('bots')
    .select('id, client_id, name, handoff_message, bot_flow')
    .eq('channel', 'telegram')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  const bot = bots?.find(b => b.bot_flow?.integration_id) || null
  if (!bot) {
    console.error('❌ No active telegram bot with a linked integration found.')
    return;
  }

  const integrationId = bot.bot_flow.integration_id
  const { data: integration } = await supabase
    .from('channel_integrations')
    .select('config')
    .eq('id', integrationId)
    .single()

  const botToken = integration?.config?.bot_token
  if (!botToken) {
    console.error('❌ Missing bot_token in integration config.')
    return;
  }

  // Delete webhook so we can poll
  await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`)
  console.log('✅ Webhook deleted, starting long-polling loop...')

  setInterval(async () => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=10`);
      const data = await res.json();
      
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          console.log(`📩 Received message from ${update.message?.from?.first_name}: ${update.message?.text}`);
          
          // Forward to local Next.js Webhook API
          await fetch(`http://localhost:3000/api/webhooks/telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update)
          })
        }
      }
    } catch (err) {
      console.error('Polling error:', err)
    }
  }, 2000);
}

pollTelegram();
