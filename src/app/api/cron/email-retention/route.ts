import {NextRequest,NextResponse} from 'next/server'
import {supabase} from '@/lib/supabase'
import {verifyWebhookSecret} from '@/lib/webhookSecurity'
export async function POST(req:NextRequest){if(!verifyWebhookSecret(req,process.env.CRON_SECRET))return NextResponse.json({error:'Unauthorized'},{status:401});const{data,error}=await supabase.rpc('purge_old_campaign_recipients');if(error)return NextResponse.json({error:'Cleanup unavailable'},{status:503});return NextResponse.json({deleted:Number(data||0)})}
