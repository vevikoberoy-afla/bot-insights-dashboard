import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const { data, error } = await supabase.from('chunks').select('*').limit(5)
  console.log('Chunks error:', error)
  if (data && data.length > 0) {
    console.log('Sample chunk keys:', Object.keys(data[0]))
    console.log('Sample chunk active value:', data[0].active)
  } else {
    console.log('No chunks found in DB!')
  }
}
check()
