require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: chunks } = await supabase.from('chunks').select('id, text, dataset_id, context_id');
  console.log('Total chunks:', chunks?.length);
  if (chunks?.length) {
    console.log(chunks[0]);
  }
}
check();
