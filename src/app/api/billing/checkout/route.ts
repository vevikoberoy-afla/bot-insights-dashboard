import { NextResponse } from 'next/server'
import { requireWorkspace,saasError } from '@/lib/saas/context'
export async function POST(){
 try{await requireWorkspace(null,'billing',true);return NextResponse.json({code:'PAYMENT_PROVIDER_NOT_CONFIGURED',error:'Payments are not connected. Request a plan change from your account page.'},{status:501})}catch(e){return saasError(e)}
}
