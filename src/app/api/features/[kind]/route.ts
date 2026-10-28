import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { supabase } from '@/lib/supabase'
import { bookingSlots, changeBooking, checked, featureTables, reserveBooking, validateFeature } from '@/lib/booking'
import { queueOfferingEnrichment } from '@/lib/offeringEnrichment'
import { invalidateWorkspaceBookingBundles } from '@/lib/chat/bookingBundleCache'
import { invalidateWorkspaceCommerceBundles } from '@/lib/chat/commerceBundleCache'

async function dispatch(req:NextRequest,kind:string) {
  const area=kind==='bookings'||kind==='slots'?'bookings':kind==='services'?'services':kind==='offers'?'offers':kind==='notifications'?'bookings':'bookings'
  const user=await getAuthenticatedWorkspaceUser(req,area,req.method!=='GET')
  if(!user) return NextResponse.json({error:'You do not have access to this booking area'},{status:403})
  try {
    if(kind==='slots') return NextResponse.json(await bookingSlots(user.workspaceId,req.nextUrl.searchParams.get('service_id') || '',req.nextUrl.searchParams.get('date') || '',Number(req.nextUrl.searchParams.get('quantity') || 1),req.nextUrl.searchParams.get('location_id') || undefined))
    if(!Object.prototype.hasOwnProperty.call(featureTables,kind)) return NextResponse.json({error:'Not found'},{status:404})
    const table=featureTables[kind as keyof typeof featureTables]
    if(req.method==='GET') {
      const rows=checked(await supabase.from(kind==='offers'?'booking_offer_stats':table).select('*').eq('client_id',user.workspaceId).order(kind==='notifications'?'due_at':'created_at',{ascending:false}).limit(1000))
      return NextResponse.json(rows)
    }
    const body=await req.json()
    if(kind==='bookings') {
      if(Array.isArray(body.ids)&&req.method==='PATCH') {
        const changed:any[]=[]
        for(const id of body.ids.slice(0,100))changed.push(await changeBooking(user.workspaceId,id,body.status,body.slot_start))
        return NextResponse.json(changed)
      }
      return NextResponse.json(req.method==='POST' ? await reserveBooking(user.workspaceId,{...body,channel:'dashboard'}) : await changeBooking(user.workspaceId,body.id,body.status,body.slot_start))
    }
    if(kind==='notifications'&&req.method==='PATCH'){
      const ids=Array.isArray(body.ids)?body.ids.slice(0,100):[body.id].filter(Boolean)
      const retried=checked(await supabase.from('booking_notifications').update({status:'pending',attempts:0,last_error:null,due_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('client_id',user.workspaceId).in('id',ids).in('status',['failed','cancelled']).select('*'))
      return NextResponse.json(retried)
    }
    if(kind!=='services' && kind!=='offers') return NextResponse.json({error:'Read only'},{status:405})
    const data=validateFeature(kind,body)
    const saved=checked(await (body.id ? supabase.from(table).update(data).eq('id',body.id).eq('client_id',user.workspaceId) : supabase.from(table).insert({...data,client_id:user.workspaceId})).select('*').single())
    await Promise.all([invalidateWorkspaceBookingBundles(user.workspaceId),invalidateWorkspaceCommerceBundles(user.workspaceId)])
    if(kind==='services')void queueOfferingEnrichment(req.nextUrl.origin,'service',saved.id,user.workspaceId).catch(error=>console.error('[queue service enrichment]',error))
    return NextResponse.json(saved)
  } catch(error:any) { return NextResponse.json({error:error.message},{status:400}) }
}
export const GET=async (req:NextRequest, props:{params: Promise<{kind:string}>}) => {
  const params = await props.params;
  return dispatch(req,params.kind);
}
export const POST=GET
export const PATCH=GET
