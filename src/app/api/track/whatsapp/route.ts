import {NextRequest,NextResponse} from 'next/server'
import {verifyWhatsAppClickToken} from '@/lib/whatsappClickToken'
import {supabase} from '@/lib/supabase'
import {redis} from '@/lib/redis'

export async function GET(req:NextRequest){
 const value=verifyWhatsAppClickToken(String(req.nextUrl.searchParams.get('token')||''));if(!value)return NextResponse.json({error:'Invalid or expired link'},{status:400})
 const key=`track:wa:click:${value.recipientId}`,first=await redis.set(key,'1',{ex:2592000,nx:true}).catch(()=>'database-fallback')
 if(first){const result=await supabase.rpc('bulk_whatsapp_record_recipient_click',{p_recipient:value.recipientId});if(result.error){await redis.del(key).catch(()=>{})}else if(result.data?.recorded)await redis.hincrby(`campaign:${result.data.campaign_id}:metrics`,'clicked',1).catch(()=>{})}
 return new NextResponse(null,{status:302,headers:{Location:value.target,'Referrer-Policy':'no-referrer','Cache-Control':'no-store'}})
}
