import { NextRequest, NextResponse } from 'next/server'
import { verifySignatureAppRouter } from '@upstash/qstash/dist/nextjs'
import { supabase } from '@/lib/supabase'
import { resolveSmtpCredentials, sendEmailReply } from '@/lib/email'
import { verifyWebhookSecret } from '@/lib/webhookSecurity'

async function handler(req: NextRequest) {
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY && !verifyWebhookSecret(req, process.env.EMAIL_WEBHOOK_SECRET)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { jobId } = await req.json()
  if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  const { data: job } = await supabase.from('email_delivery_jobs').select('*').eq('id', jobId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Email job not found' }, { status: 404 })
  if (job.status === 'sent') return NextResponse.json({ success: true, duplicate: true })
  await supabase.from('email_delivery_jobs').update({status:'processing',attempts:Number(job.attempts||0)+1,updated_at:new Date().toISOString()}).eq('id',job.id)
  const credentials = await resolveSmtpCredentials(job.client_id, job.bot_id)
  if (!credentials) {
    await supabase.from('email_delivery_jobs').update({status:'failed',last_error:'SMTP is not configured',processed_at:new Date().toISOString()}).eq('id',job.id)
    return NextResponse.json({ error: 'SMTP is not configured' }, { status: 400 })
  }
  const sent = await sendEmailReply(credentials,{operationId:`job:${job.id}`,to:job.recipient,subject:job.subject,body:job.body,inReplyTo:job.headers?.in_reply_to,references:job.headers?.references,brandName:job.headers?.brand_name,isReply:job.headers?.is_reply !== false})
  await supabase.from('email_delivery_jobs').update({status:sent.success?'sent':'failed',provider_message_id:sent.messageId||null,last_error:sent.error||null,processed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id)
  return NextResponse.json(sent, { status: sent.success ? 200 : 500 })
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY ? verifySignatureAppRouter(handler) : handler
