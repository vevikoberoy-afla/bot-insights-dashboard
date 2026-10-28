import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const { data: integration } = await supabase.from('channel_integrations').select('*').eq('id', 'df54b18b-1638-4a29-a834-4e7940b40ad0').single()
  if (integration && integration.config.bot_token) {
    const token = integration.config.bot_token
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`)
    const data = await res.json()
    console.log('Updates:', JSON.stringify(data, null, 2))
  }
}
check()
