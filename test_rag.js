require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  // 1. Find the bot
  const { data: bots } = await supabase.from('bots').select('*');
  console.log('Bots:', bots.length);
  const bot = bots[0];
  if (!bot) return console.log('No bots found');

  // 2. Find linked datasets
  const { data: links } = await supabase.from('bot_datasets').select('*').eq('bot_id', bot.id);
  console.log(`Bot ${bot.id} is linked to datasets:`, links);

  if (!links || links.length === 0) return console.log('No linked datasets');

  const datasetIds = links.map(l => l.dataset_id);

  // 3. Check if chunks exist for these datasets
  const { data: chunks, error: chunkErr } = await supabase.from('chunks').select('id, text, active').in('dataset_id', datasetIds);
  console.log('Chunks for these datasets:', chunks?.length, chunkErr);

  // 4. Test match_chunks_by_datasets with dummy embedding
  const dummyEmbedding = new Array(768).fill(0.1);
  const { data: matches, error: matchErr } = await supabase.rpc('match_chunks_by_datasets', {
    p_dataset_ids: datasetIds,
    p_embedding: JSON.stringify(dummyEmbedding),
    p_match_count: 5
  });

  console.log('Matches:', matches?.length, matchErr);
}

test();
