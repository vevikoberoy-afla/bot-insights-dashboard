import {supabase} from '@/lib/supabase'

export type PaymentPolicy={cash_on_delivery_allowed:boolean;direct_upi_allowed:boolean;gateway_allowed:boolean;qr_upload_allowed:boolean;max_upi_accounts:number}
const safeDefault:PaymentPolicy={cash_on_delivery_allowed:true,direct_upi_allowed:false,gateway_allowed:false,qr_upload_allowed:false,max_upi_accounts:0}

export async function effectivePaymentPolicy(clientId:string):Promise<PaymentPolicy>{
 const {data,error}=await supabase.rpc('effective_payment_policy',{p_client:clientId})
 if(error||!data){
  if(error&&!/does not exist|schema cache/i.test(error.message))console.error('[payment policy]',error.message)
  return safeDefault
 }
 return{
  cash_on_delivery_allowed:data.cash_on_delivery_allowed===true,
  direct_upi_allowed:data.direct_upi_allowed===true,
  gateway_allowed:data.gateway_allowed===true,
  qr_upload_allowed:data.qr_upload_allowed===true,
  max_upi_accounts:Math.max(0,Math.min(50,Number(data.max_upi_accounts)||0)),
 }
}
