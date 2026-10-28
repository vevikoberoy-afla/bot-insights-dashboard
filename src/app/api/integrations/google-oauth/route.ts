import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { supabase } from '@/lib/supabase'
import { decryptConfigSecrets, encryptConfigSecrets } from '@/lib/security/secretVault'

const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url')
const sign=(payload:string,secret:string)=>createHmac('sha256',secret).update(payload).digest('base64url')

export async function GET(req:NextRequest){
 const user=await getAuthenticatedWorkspaceUser(req);if(!user)return NextResponse.json({error:'Sign in required'},{status:401})
 const code=req.nextUrl.searchParams.get('code'),incoming=req.nextUrl.searchParams.get('state'),requested=req.nextUrl.searchParams.get('integration_id')
 const unsigned=incoming?.split('.')[0]
 let integrationId=requested||''
 if(unsigned){try{const parsed=JSON.parse(Buffer.from(unsigned,'base64url').toString());integrationId=parsed.integration_id;if(parsed.user_id!==user.id||parsed.expires<Date.now())throw new Error('Expired OAuth request')}catch{return NextResponse.json({error:'Invalid OAuth state'},{status:400})}}
 const {data:integration}=await supabase.from('channel_integrations').select('id,client_id,channel,config,status').eq('id',integrationId).eq('client_id',user.workspaceId).eq('channel','google_calendar').maybeSingle()
 if(!integration)return NextResponse.json({error:'Google Calendar integration not found'},{status:404})
 const config=decryptConfigSecrets(user.workspaceId,integration.config||{}),clientId=config.client_id||process.env.GOOGLE_CALENDAR_CLIENT_ID,clientSecret=config.client_secret||process.env.GOOGLE_CALENDAR_CLIENT_SECRET
 if(!clientId||!clientSecret)return NextResponse.json({error:'Configure a Google OAuth client ID and secret first'},{status:400})
 const redirectUri=`${req.nextUrl.origin}/api/integrations/google-oauth`
 if(!code){const payload=encode({integration_id:integration.id,user_id:user.id,expires:Date.now()+10*60_000}),state=`${payload}.${sign(payload,clientSecret)}`;const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.searchParams.set('client_id',clientId);url.searchParams.set('redirect_uri',redirectUri);url.searchParams.set('response_type','code');url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent');url.searchParams.set('scope','https://www.googleapis.com/auth/calendar');url.searchParams.set('state',state);return NextResponse.redirect(url)}
 if(!incoming||!unsigned){return NextResponse.json({error:'Missing OAuth state'},{status:400})}
 const actual=Buffer.from(incoming.split('.')[1]||''),expected=Buffer.from(sign(unsigned,clientSecret));if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return NextResponse.json({error:'Invalid OAuth signature'},{status:400})
 const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'}),signal:AbortSignal.timeout(12000)}),tokens=await tokenRes.json()
 if(!tokenRes.ok)return NextResponse.json({error:tokens.error_description||'Google authorization failed'},{status:400})
 const next={...config,client_id:clientId,client_secret:clientSecret,access_token:tokens.access_token,refresh_token:tokens.refresh_token||config.refresh_token,token_expires_at:new Date(Date.now()+Number(tokens.expires_in||3600)*1000).toISOString()}
 const {error}=await supabase.from('channel_integrations').update({config:encryptConfigSecrets(user.workspaceId,next),status:'active',updated_at:new Date().toISOString()}).eq('id',integration.id).eq('client_id',user.workspaceId);if(error)return NextResponse.json({error:error.message},{status:500})
 return NextResponse.redirect(new URL('/settings/integrations?google=connected',req.url))
}
