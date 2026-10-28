import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const embedding = Array(768).fill(0.1) // dummy embedding
  const { data, error } = await supabase.rpc('match_chunks_by_datasets', {
    p_dataset_ids: ['e97d12a8-edbe-496a-9365-7500e4d99298'],
    p_embedding: JSON.stringify(embedding),
    p_match_count: 5,
  })
  console.log('RPC match_chunks_by_datasets Error:', error)
  console.log('RPC data:', data)
}
check()
