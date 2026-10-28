import {NextRequest,NextResponse} from 'next/server'
import {verifyEmailToken} from '@/lib/email/bulkCrypto'
import {supabase} from '@/lib/supabase'
import {redis} from '@/lib/redis'

const pixel=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64')

export async function GET(req:NextRequest){
 const id=verifyEmailToken(String(req.nextUrl.searchParams.get('token')||''),'open')
 if(id){
  const first=await redis.set(`track:open:${id}`,'1',{ex:2592000,nx:true}).catch(()=>'fallback')
  if(first){
   const result=await supabase.rpc('bulk_email_record_engagement_v2',{p_recipient:id,p_event:'opened',p_metadata:{user_agent:String(req.headers.get('user-agent')||'').slice(0,250)}})
   if(result.error){await redis.del(`track:open:${id}`).catch(()=>{})}
   else if(result.data?.recorded&&result.data?.campaign_id)await redis.hincrby(`campaign:${result.data.campaign_id}:metrics`,'opened',Number(result.data.opened_delta||1)).catch(()=>{})
  }
 }
 return new NextResponse(pixel,{headers:{'Content-Type':'image/gif','Content-Length':String(pixel.length),'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'}})
}
