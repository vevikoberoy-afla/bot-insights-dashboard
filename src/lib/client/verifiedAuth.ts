import type {SupabaseClient} from '@supabase/supabase-js'

/**
 * Verify the browser identity with Supabase Auth before returning the locally
 * cached access token. Callers may forward the token, but must never derive
 * identity or authorization from getSession().user.
 */
export async function getVerifiedAccessToken(client:SupabaseClient){
 const {data:{user},error}=await client.auth.getUser()
 if(error||!user)return null
 const {data:{session}}=await client.auth.getSession()
 return session?.access_token||null
}
