import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const { data: dsets } = await supabase.from('datasets').select('*').limit(1)
  console.log('Datasets:', dsets)

  const { data: bd } = await supabase.from('bot_datasets').select('id, dataset_id, datasets (*), dataset (*)').limit(1)
  console.log('Bot Datasets:', bd)
}
check()
