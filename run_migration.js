import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  try {
    // Instead of raw sql which isn't supported via JS client without postgres function, we can just inform the user
    console.log("Migration needs to be run in Supabase SQL Editor manually if you don't have psql.")
  } catch(e) {
    console.error(e)
  }
}
run()
