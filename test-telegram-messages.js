import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const { data: messages } = await supabase.from('messages').select('*').eq('channel', 'telegram').order('created_at', { ascending: false }).limit(5)
  console.log('Telegram Messages:', messages)
}
check()
