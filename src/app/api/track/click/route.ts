import {NextRequest,NextResponse} from 'next/server'
import {verifyClickToken} from '@/lib/email/bulkCrypto'
import {supabase} from '@/lib/supabase'
import {redis} from '@/lib/redis'

export async function GET(req:NextRequest){
 const value=verifyClickToken(String(req.nextUrl.searchParams.get('token')||''));if(!value)return NextResponse.json({error:'Invalid or expired link'},{status:400})
 const first=await redis.set(`track:click:${value.recipientId}`,'1',{ex:2592000,nx:true}).catch(()=>'fallback')
 if(first){
  const result=await supabase.rpc('bulk_email_record_engagement_v2',{p_recipient:value.recipientId,p_event:'clicked',p_metadata:{host:new URL(value.target).host}})
  if(result.error){await redis.del(`track:click:${value.recipientId}`).catch(()=>{})}
  else if(result.data?.recorded&&result.data?.campaign_id){const pipeline=redis.pipeline();pipeline.hincrby(`campaign:${result.data.campaign_id}:metrics`,'clicked',Number(result.data.clicked_delta||1));if(Number(result.data.opened_delta||0)>0)pipeline.hincrby(`campaign:${result.data.campaign_id}:metrics`,'opened',Number(result.data.opened_delta));await pipeline.exec().catch(()=>{})}
 }
 return new NextResponse(null,{status:302,headers:{Location:value.target,'Referrer-Policy':'no-referrer','Cache-Control':'no-store'}})
}
