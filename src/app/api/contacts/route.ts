import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { upsertCustomerContact } from '@/lib/customerContacts'
import {normalizeE164Phone} from '@/lib/phone'
import {logConsent} from '@/lib/leadCapture/consentLog'

const editable = ['name','email','phone','avatar_url','source_channel','tags','custom_fields','opt_in_web','opt_in_whatsapp','opt_in_whatsapp_marketing','opt_in_whatsapp_utility','opt_in_email','opt_in_sms'] as const
async function owner(req: NextRequest, requested?: string | null) {
  const user = await getAuthenticatedWorkspaceUser(req,'contacts',req.method!=='GET')
  if (!user) return null
  if (!requested || requested === user.workspaceId) return user.workspaceId
  return null
}

export async function GET(req: NextRequest) {
  const clientId = await owner(req, req.nextUrl.searchParams.get('client_id'))
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const compact=req.nextUrl.searchParams.get('compact')==='1',limit=Math.min(200,Math.max(1,Number(req.nextUrl.searchParams.get('limit')||100))),search=String(req.nextUrl.searchParams.get('q')||'').trim().replace(/[,%()]/g,' ').slice(0,100)
  let query=supabase.from('contacts').select(compact?'id,name,email,phone,phone_e164,opt_in_email,opt_in_whatsapp_marketing,opt_in_whatsapp_utility,last_active_at':'*').eq('client_id',clientId).order('created_at',{ascending:false})
  if(compact){if(search)query=query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);query=query.limit(limit)}
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if(compact){
    const rows=data||[],ids=rows.map((contact:any)=>contact.id),emails=rows.map((contact:any)=>String(contact.email||'').trim().toLowerCase()).filter(Boolean)
    const [consentResult,suppressionResult]=await Promise.all([
      ids.length?supabase.from('consent_log').select('contact_id,opted_in,created_at').in('contact_id',ids).eq('channel','email').order('created_at',{ascending:false}):Promise.resolve({data:[] as any[],error:null}),
      emails.length?supabase.from('email_suppressions').select('email').eq('client_id',clientId).in('email',emails):Promise.resolve({data:[] as any[],error:null}),
    ])
    const latestConsent=new Map<string,boolean>(),suppressed=new Set((suppressionResult.data||[]).map((item:any)=>String(item.email||'').toLowerCase()))
    for(const item of consentResult.error?[]:(consentResult.data||[]))if(!latestConsent.has(item.contact_id))latestConsent.set(item.contact_id,item.opted_in===true)
    return NextResponse.json(rows.map((contact:any)=>{const address=String(contact.email||'').trim().toLowerCase(),emailConsent=latestConsent.get(contact.id)??contact.opt_in_email===true,emailSuppressed=address?suppressed.has(address):false;return{...contact,opt_in_email:emailConsent,email_consent_source:latestConsent.has(contact.id)?'audit_log':'contact',email_suppressed:emailSuppressed,email_eligible:Boolean(address&&emailConsent&&!emailSuppressed)}}),{headers:{'Cache-Control':'private, max-age=10, stale-while-revalidate=20'}})
  }
  const contactIds = (data || []).map((contact: any) => contact.id)
  let memberships: any[] = []
  if (contactIds.length) {
    const result = await supabase.from('contact_segment_members')
      .select('contact_id,assignment_source,contact_segments(id,name,color,is_system,segment_type)')
      .in('contact_id',contactIds)
    // Older installations without migration 064 still load Contacts normally.
    if (!result.error) memberships = result.data || []
  }
  const byContact = new Map<string,any[]>()
  memberships.forEach((membership:any) => {
    const segment = Array.isArray(membership.contact_segments) ? membership.contact_segments[0] : membership.contact_segments
    if (!segment) return
    const list = byContact.get(membership.contact_id) || []
    list.push({...segment,assignment_source:membership.assignment_source})
    byContact.set(membership.contact_id,list)
  })
  return NextResponse.json((data || []).map((contact:any) => {
    const segmentDetails = byContact.get(contact.id) || []
    return {...contact,segments:segmentDetails.map(segment=>segment.name),segment_details:segmentDetails}
  }))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const clientId = await owner(req, body.client_id)
    if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!body.email && !body.phone) return NextResponse.json({ error: 'An email or phone number is required' }, { status: 400 })
    const contact = await upsertCustomerContact({
      clientId,
      name: body.name || [body.first_name, body.last_name].filter(Boolean).join(' '),
      email: body.email,
      phone: body.phone,
      channel: body.source_channel || 'web',
      source: body.capture_method === 'csv_import' ? 'csv_import' : 'manual',
      customFields: body.custom_fields || body.attributes,
    })
    const consentUpdates:any=Object.fromEntries(['opt_in_web','opt_in_whatsapp','opt_in_whatsapp_marketing','opt_in_whatsapp_utility','opt_in_email','opt_in_sms'].filter(key=>body[key]!==undefined).map(key=>[key,body[key]===true]))
    if(Object.keys(consentUpdates).length){const result=await supabase.from('contacts').update({...consentUpdates,updated_at:new Date().toISOString()}).eq('client_id',clientId).eq('id',contact.id).select('*').single();if(result.error)throw result.error;Object.assign(contact,result.data)}
    await Promise.all((['email','sms','web'] as const).flatMap(channel=>{const key=`opt_in_${channel}`;return body[key]===undefined?[]:[logConsent({contactId:contact.id,channel,optedIn:body[key]===true,source:'manual'})]}))
    if (Array.isArray(body.tags) && body.tags.length) {
      const tags = Array.from(new Set([...(contact.tags || []), ...body.tags.map(String)]))
      const { data } = await supabase.from('contacts').update({ tags }).eq('client_id', clientId).eq('id', contact.id).select('*').single()
      return NextResponse.json(data || contact, { status: 201 })
    }
    return NextResponse.json(contact, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid request' }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const clientId = await owner(req, body.client_id)
    if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!body.id) return NextResponse.json({ error: 'Contact id is required' }, { status: 400 })
    const updates:any = Object.fromEntries(editable.filter(key => body[key] !== undefined).map(key => [key, body[key]]))
    if(body.phone!==undefined)updates.phone_e164=normalizeE164Phone(body.phone)
    const { data, error } = await supabase.from('contacts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', body.id).eq('client_id', clientId).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await Promise.all((['email','sms','web'] as const).flatMap(channel=>{const key=`opt_in_${channel}`;return body[key]===undefined?[]:[logConsent({contactId:body.id,channel,optedIn:body[key]===true,source:'manual'})]}))
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const clientId = await owner(req, req.nextUrl.searchParams.get('client_id'))
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Contact id is required' }, { status: 400 })
  const { error } = await supabase.from('contacts').delete().eq('id', id).eq('client_id', clientId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
