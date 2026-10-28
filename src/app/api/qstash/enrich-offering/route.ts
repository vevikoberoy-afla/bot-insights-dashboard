import { NextRequest,NextResponse } from 'next/server'
import { verifySignatureAppRouter } from '@upstash/qstash/dist/nextjs'
import { enrichOffering } from '@/lib/offeringEnrichment'
import { verifyWebhookSecret } from '@/lib/webhookSecurity'
import {getEffectiveEntitlements,featureAllowed} from '@/lib/saas/entitlements'

const qstashSignaturesConfigured=!!(process.env.QSTASH_CURRENT_SIGNING_KEY&&process.env.QSTASH_NEXT_SIGNING_KEY)

async function handler(req:NextRequest){
 if(!qstashSignaturesConfigured&&!verifyWebhookSecret(req,process.env.CATALOG_ENRICHMENT_SECRET))return NextResponse.json({error:'Unauthorized'},{status:401})
 try{const body=await req.json(),kind=body.kind==='service'?'service':body.kind==='product'?'product':null;if(!kind||!body.id||!body.clientId)return NextResponse.json({error:'Invalid enrichment job'},{status:400});if(!featureAllowed(await getEffectiveEntitlements(String(body.clientId)),kind==='service'?'booking.enabled':'commerce.enabled'))return NextResponse.json({skipped:true,reason:'Workspace access unavailable'});return NextResponse.json(await enrichOffering(kind,String(body.id),String(body.clientId)))}catch(error:any){console.error('[enrich offering worker]',error);return NextResponse.json({error:error?.message||'Enrichment failed'},{status:500})}
}

export const POST=qstashSignaturesConfigured?verifySignatureAppRouter(handler):handler
