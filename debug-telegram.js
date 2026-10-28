import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
    const { data: bot } = await supabase
      .from('bots')
      .select('id, client_id, name, handoff_message, bot_flow')
      .eq('channel', 'telegram')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    console.log('Bot:', bot?.id)

    const integrationId = bot?.bot_flow?.integration_id
    console.log('Integration ID:', integrationId)
    
    if (!integrationId) return;

    const { data: integration } = await supabase
      .from('channel_integrations')
      .select('config')
      .eq('id', integrationId)
      .single()

    console.log('Integration Config Bot Token:', !!integration?.config?.bot_token)
    
    const { data: linkedDatasets } = await supabase
      .from('bot_datasets')
      .select('dataset_id')
      .eq('bot_id', bot.id)
      
    console.log('Datasets linked:', linkedDatasets)
}
check()
