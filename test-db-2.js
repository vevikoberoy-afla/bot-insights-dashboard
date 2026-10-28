import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const { data, error } = await supabase.from('bot_datasets').select('*').limit(1)
  console.log('Bot Datasets Error:', error)
  console.log('Bot Datasets Data:', data)
}
check()
