import {NextRequest,NextResponse} from 'next/server'
import {verifySignatureAppRouter} from '@upstash/qstash/dist/nextjs'
import {redis} from '@/lib/redis'
import {verifyWebhookSecret} from '@/lib/webhookSecurity'

async function handler(req:NextRequest){
 const secret=process.env.WHATSAPP_WORKER_SECRET||process.env.EMAIL_WEBHOOK_SECRET
 if(!process.env.QSTASH_CURRENT_SIGNING_KEY&&!verifyWebhookSecret(req,secret))return NextResponse.json({error:'Unauthorized'},{status:401})
 const body=await req.json(),key=String(body.key||'');if(!key.startsWith('wa:webhook:payload:'))return NextResponse.json({error:'Invalid event key'},{status:400})
 const raw=await redis.get<string>(key);if(!raw)return NextResponse.json({duplicate:true})
 const origin=(process.env.NEXT_PUBLIC_APP_URL||req.nextUrl.origin).replace(/\/$/,'')
 const response=await fetch(`${origin}/api/webhook/whatsapp`,{method:'POST',headers:{'Content-Type':'application/json','x-whatsapp-buffer-worker':'1',...(secret?{'x-webhook-secret':secret}:{})},body:raw,signal:AbortSignal.timeout(55000)})
 if(!response.ok)return NextResponse.json({error:'Buffered WhatsApp webhook processing failed'},{status:503})
 await redis.del(key).catch(()=>{})
 return NextResponse.json({processed:true})
}

export const POST=process.env.QSTASH_CURRENT_SIGNING_KEY&&process.env.QSTASH_NEXT_SIGNING_KEY?verifySignatureAppRouter(handler):handler
