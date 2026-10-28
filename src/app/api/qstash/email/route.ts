import { NextRequest, NextResponse } from 'next/server'
import { verifySignatureAppRouter } from '@upstash/qstash/dist/nextjs'
import { supabase } from '@/lib/supabase'
import { resolveSmtpCredentials, sendEmailReply } from '@/lib/email'
import { verifyWebhookSecret } from '@/lib/webhookSecurity'
import { featureAllowed, getEffectiveEntitlements } from '@/lib/saas/entitlements'

async function handler(req: NextRequest) {
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY && !verifyWebhookSecret(req, process.env.EMAIL_WEBHOOK_SECRET)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { contact_id, email, campaign_id, message_text, subject, client_id } = await req.json()
  if (!contact_id || !email || !campaign_id || !message_text || !client_id) return NextResponse.json({ error: 'Invalid campaign email job' }, { status: 400 })
  if (!featureAllowed(await getEffectiveEntitlements(client_id), 'campaigns.enabled')) return NextResponse.json({ skipped: true, reason: 'Workspace campaign service is paused' })
  const { data: contact } = await supabase.from('contacts').select('id,email,opt_in_email').eq('id',contact_id).eq('client_id',client_id).maybeSingle()
  if (!contact || !contact.opt_in_email || String(contact.email).toLowerCase() !== String(email).toLowerCase()) return NextResponse.json({ error: 'Contact is not opted in to email marketing' }, { status: 403 })
  const { data: integrations } = await supabase.from('channel_integrations').select('bot_id,config').eq('client_id',client_id).eq('channel','email').eq('status','active')
  const mailbox = (integrations || []).find((item:any) => item.config?.bot_role === 'marketing') || (integrations || [])[0]
  if (!mailbox) return NextResponse.json({ error: 'No active email mailbox is configured' }, { status: 400 })
  const credentials = await resolveSmtpCredentials(client_id,mailbox.bot_id)
  if (!credentials) return NextResponse.json({ error: 'SMTP is not configured' }, { status: 400 })
  const sent = await sendEmailReply(credentials,{operationId:`campaign:${campaign_id}:${contact_id}`,category:'marketing',to:email,subject:subject||'Update',body:message_text,brandName:mailbox.config?.from_name||'Updates',isReply:false})
  await supabase.from('campaign_recipients').upsert({campaign_id,contact_id,status:sent.success?'sent':'failed',sent_at:sent.success?new Date().toISOString():null,error_message:sent.error||null},{onConflict:'campaign_id,contact_id'})
  return NextResponse.json(sent,{status:sent.success?200:500})
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY ? verifySignatureAppRouter(handler) : handler
