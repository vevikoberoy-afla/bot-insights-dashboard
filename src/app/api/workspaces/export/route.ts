import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checked,requireWorkspace,saasError } from '@/lib/saas/context'
export const dynamic='force-dynamic'
// Bounded exports avoid unbounded serverless responses. Large workspaces use the support request workflow.
export async function GET(){
 try{
  const ctx=await requireWorkspace(null,'settings'),tables=['contacts','catalog_products','commerce_orders','feature_bookings','tickets']
  const data:Record<string,unknown>={workspace_id:ctx.workspaceId,exported_at:new Date().toISOString(),format_version:1}
  for(const table of tables){const result=await supabase.from(table).select('*',{count:'exact'}).eq('client_id',ctx.workspaceId).limit(5000);const rows=checked(result);if((result.count || 0)>5000)return NextResponse.json({error:'This workspace needs a larger export. Submit a data export request in Account Support.'},{status:413});data[table]=rows}
  const items=await supabase.from('commerce_order_items').select('*,commerce_orders!inner(client_id)',{count:'exact'}).eq('commerce_orders.client_id',ctx.workspaceId).limit(5000)
  data.commerce_order_items=checked(items)
  if((items.count || 0)>5000)return NextResponse.json({error:'Please request a larger export through Account Support.'},{status:413})
  const serialized=JSON.stringify(data,null,2)
  if(Buffer.byteLength(serialized)>25*1024*1024)return NextResponse.json({error:'Please request a larger export through Account Support.'},{status:413})
  const audit=await supabase.from('saas_audit_events').insert({actor_id:ctx.user.id,client_id:ctx.workspaceId,action:'workspace.export',reason:'Owner/admin downloaded customer and transaction data',after_value:{tables:[...tables,'commerce_order_items']}})
  checked(audit)
  return new NextResponse(serialized,{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="workspace-${ctx.workspaceId}.json"`,'Cache-Control':'no-store'}})
 }catch(e){return saasError(e)}
}
