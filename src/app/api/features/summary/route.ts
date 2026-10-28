import { NextRequest,NextResponse } from 'next/server'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { supabase } from '@/lib/supabase'

export async function GET(req:NextRequest){
 const user=await getAuthenticatedWorkspaceUser(req,'bookings')
 if(!user)return NextResponse.json({error:'You do not have access to booking operations'},{status:403})
 const today=new Date(),tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1)
 const [services,offers,bookings,products,orders,notifications]=await Promise.all([
  supabase.from('booking_services').select('id',{count:'exact',head:true}).eq('client_id',user.workspaceId).eq('is_active',true),
  supabase.from('booking_offers').select('id',{count:'exact',head:true}).eq('client_id',user.workspaceId).eq('status','active').lte('start_at',today.toISOString()).gt('end_at',today.toISOString()),
  supabase.from('feature_bookings').select('id',{count:'exact',head:true}).eq('client_id',user.workspaceId).eq('status','confirmed').gte('slot_start',today.toISOString().slice(0,10)).lt('slot_start',tomorrow.toISOString().slice(0,10)),
  supabase.from('catalog_product_availability').select('id,track_inventory,available_quantity,low_stock_threshold').eq('client_id',user.workspaceId),
  supabase.from('commerce_orders').select('id',{count:'exact',head:true}).eq('client_id',user.workspaceId).in('status',['placed','confirmed','processing','packed','fulfilled','shipped','out_for_delivery','delivery_failed','return_requested','return_in_transit','partially_returned']),
  supabase.from('booking_notifications').select('id',{count:'exact',head:true}).eq('client_id',user.workspaceId).eq('status','failed'),
 ])
 const lowStock=(products.data||[]).filter((p:any)=>p.track_inventory&&Number(p.available_quantity)<=Number(p.low_stock_threshold)).length
 return NextResponse.json({activeServices:services.count||0,liveOffers:offers.count||0,todayBookings:bookings.count||0,lowStock,openOrders:orders.count||0,failedNotifications:notifications.count||0})
}
