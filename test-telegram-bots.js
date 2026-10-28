import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const { data: bots } = await supabase.from('bots').select('id, name, created_at, bot_flow').eq('channel', 'telegram').eq('status', 'active').order('created_at', { ascending: false })
  console.log(JSON.stringify(bots, null, 2))
}
check()
