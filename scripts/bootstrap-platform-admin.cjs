/* Explicit operator bootstrap. Does not create users, send email, or change passwords. */
require('dotenv').config({path:'.env.local',quiet:true})
require('dotenv').config({path:'.env',quiet:true})
const {createClient}=require('@supabase/supabase-js')
const email=String(process.argv[2]||'').trim().toLowerCase()
async function main(){
 if(!email.includes('@'))throw new Error('Usage: node scripts/bootstrap-platform-admin.cjs verified-owner@example.com')
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Supabase server environment is required.')
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
 let user=null
 for(let page=1;page<=1000;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:100});if(error)throw error;user=data.users.find(u=>u.email?.toLowerCase()===email);if(user||data.users.length<100)break}
 if(!user||!user.email_confirmed_at)throw new Error('An existing user with this verified email is required. Sign up and verify the email first.')
 const {error}=await db.from('platform_staff_memberships').upsert({user_id:user.id,role_key:'platform_owner',status:'active',require_mfa:true},{onConflict:'user_id'})
 if(error)throw error
 const audit=await db.from('saas_audit_events').insert({actor_id:user.id,action:'staff.bootstrap',reason:'Explicit server operator bootstrap',after_value:{role_key:'platform_owner',require_mfa:true}})
 if(audit.error)throw audit.error
 console.log(`Platform owner access enabled for ${email}. Sign in, open /admin, and verify an authenticator. No password was changed.`)
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
