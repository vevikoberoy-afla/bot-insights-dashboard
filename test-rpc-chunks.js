import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const { data: chunks } = await supabase.from('chunks').select('dataset_id, embedding').limit(1)
  if (!chunks || chunks.length === 0) {
    console.log('No chunks found to test.')
    return
  }
  const datasetId = chunks[0].dataset_id
  const embedding = chunks[0].embedding

  const { data, error } = await supabase.rpc('match_chunks_by_datasets', {
    p_dataset_ids: [datasetId],
    p_embedding: JSON.stringify(embedding),
    p_match_count: 5,
  })
  console.log('RPC Error:', error)
  console.log('RPC Results:', data?.length)
}
check()
