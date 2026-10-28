import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
supabase.from('clients').select('id').limit(1).single().then(r => console.log('CLIENT:', r.data.id))
