import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checked,requireStaff,saasError } from '@/lib/saas/context'
export async function GET() {
 try {
  await requireStaff()
  const rows=checked(await supabase.from('saas_workspace_accounts').select('access_state,saas_plan_versions(price_minor,currency,billing_interval)').eq('access_state','active'))
  const currencies:Record<string,{configured_mrr_minor:number;configured_arr_minor:number}>={}
  for(const row of rows || []) {
   const p:any=Array.isArray(row.saas_plan_versions)?row.saas_plan_versions[0]:row.saas_plan_versions
   if(p?.price_minor==null || p.billing_interval==='contract')continue
   const amount=Number(p.price_minor)/(p.billing_interval==='year'?12:1)
   const sum=currencies[p.currency] ||= {configured_mrr_minor:0,configured_arr_minor:0}
   sum.configured_mrr_minor+=amount;sum.configured_arr_minor+=amount*12
  }
  return NextResponse.json({currencies,active_clients:rows?.length || 0,payment_provider:'not_connected',note:'Configured subscription value only. No payments have been verified.'})
 }catch(e){return saasError(e)}
}
export const dynamic = 'force-dynamic'
