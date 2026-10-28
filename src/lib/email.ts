/**
 * Email utility library.
 * Sends emails via SMTP using nodemailer. Supports threaded replies, HTML templates,
 * and automatic resolution of SMTP credentials from channel_integrations or bot_channels.
 */

import nodemailer from 'nodemailer'
import { supabase } from '@/lib/supabase'
import { createHash, randomUUID } from 'crypto'
import { decryptConfigSecrets } from '@/lib/security/secretVault'
import {BoundedCache} from '@/lib/boundedCache'

export interface SmtpCredentials {
  workspace_id?: string
  smtp_host: string
  smtp_port?: number | string
  smtp_user: string
  smtp_pass: string
  from_name?: string
  from_email?: string
}

export interface SendEmailOptions {
  operationId?: string
  category?: 'transactional' | 'marketing'
  to: string
  subject: string
  body: string
  inReplyTo?: string | null
  references?: string | null
  brandName?: string
  isReply?: boolean
}

const transporterPool = new BoundedCache<string,any>({maxEntries:20,maxBytes:2*1024*1024,ttlMs:30*60*1000,sizeOf:()=>64*1024,onEvict:transport=>{try{transport.close()}catch{}}})

function pooledTransport(credentials: SmtpCredentials) {
  const port = typeof credentials.smtp_port === 'string' ? parseInt(credentials.smtp_port, 10) : (credentials.smtp_port || 587)
  const key = `${credentials.smtp_host}:${port}:${credentials.smtp_user}`
  const existing = transporterPool.get(key)
  if (existing) return existing
  const transporter = nodemailer.createTransport({
    host: credentials.smtp_host, port, secure: port === 465, pool: true,
    requireTLS: port !== 465,
    maxConnections: 15, maxMessages: 200,
    auth: { user: credentials.smtp_user, pass: credentials.smtp_pass },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  })
  transporterPool.set(key, transporter)
  return transporter
}

/**
 * Clean responsive HTML email template
 */
export function formatEmailHtml(text: string, brandName = 'Support'): string {
  const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
  const safeBrandName = escapeHtml(brandName)
  // Convert newlines to formatted paragraphs / breaks
  const paragraphs = escapeHtml(text)
    .split(/\n\n+/)
    .map(p => `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #1e293b; font-size: 14px;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0">
          <!-- Header -->
          <tr>
            <td style="padding: 20px 24px; border-bottom: 1px solid #f1f5f9; background-color: #ffffff;">
              <span style="font-size: 16px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">${safeBrandName}</span>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 24px;">
              ${paragraphs}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 24px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; font-size: 11px; color: #64748b;">
              Sent via ${safeBrandName} AI &amp; Support Platform. Reply to this email to continue the conversation.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

/**
 * Resolves SMTP credentials from channel_integrations or bot_channels
 */
export async function resolveSmtpCredentials(
  clientId: string,
  botId?: string | null
): Promise<SmtpCredentials | null> {
  // Keep legacy credentials as a fallback. The Integrations dashboard is the
  // authoritative source for newly assigned mailboxes.
  let legacyCredentials: SmtpCredentials | null = null
  if (botId) {
    const { data: botChan } = await supabase
      .from('bot_channels')
      .select('credentials, identifier')
      .eq('bot_id', botId)
      .eq('channel_type', 'email')
      .maybeSingle()

    if (botChan?.credentials?.smtp_host && botChan?.credentials?.smtp_user) {
      legacyCredentials = {
        workspace_id: clientId,
        smtp_host: botChan.credentials.smtp_host,
        smtp_port: botChan.credentials.smtp_port || 587,
        smtp_user: botChan.credentials.smtp_user,
        smtp_pass: botChan.credentials.smtp_pass,
        from_name: botChan.credentials.from_name || 'Support',
        from_email: botChan.credentials.from_email || botChan.credentials.smtp_user || botChan.identifier,
      }
    }
  }

  // 1. Try channel_integrations for this client and bot.
  let integrationQuery = supabase
    .from('channel_integrations')
    .select('config')
    .eq('client_id', clientId)
    .eq('channel', 'email')
    .eq('status', 'active')
  if (botId) integrationQuery = integrationQuery.eq('bot_id', botId)
  let { data: integrations } = await integrationQuery.limit(1)
  if ((!integrations || !integrations.length) && botId) {
    const legacy = await supabase.from('channel_integrations').select('config').eq('client_id',clientId).eq('channel','email').eq('status','active').is('bot_id',null).limit(1)
    integrations = legacy.data
  }

  const activeInt = decryptConfigSecrets(clientId, integrations?.[0]?.config)
  if (activeInt?.smtp_host && activeInt?.smtp_user) {
    return {
      workspace_id: clientId,
      smtp_host: activeInt.smtp_host,
      smtp_port: activeInt.smtp_port || 587,
      smtp_user: activeInt.smtp_user,
      smtp_pass: activeInt.smtp_pass,
      from_name: activeInt.from_name || 'Support',
      from_email: activeInt.from_email || activeInt.email_address || activeInt.smtp_user,
    }
  }

  // 2. Preserve support for email channels created before mailbox integrations.
  if (legacyCredentials) return legacyCredentials

  // 3. Fallback to system-level SMTP environment variables if configured
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      workspace_id: clientId,
      smtp_host: process.env.SMTP_HOST,
      smtp_port: process.env.SMTP_PORT || 587,
      smtp_user: process.env.SMTP_USER,
      smtp_pass: process.env.SMTP_PASS,
      from_name: process.env.SMTP_FROM_NAME || 'Support',
      from_email: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
    }
  }

  return null
}

/**
 * Send an email reply to a customer with threading headers and HTML layout.
 */
export async function sendEmailReply(
  credentials: SmtpCredentials,
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const workspace = credentials.workspace_id
  const operation = options.operationId || randomUUID()
  let claimed = false
  try {
    if (!workspace) return { success: false, error: 'Workspace identity is required for outbound email.' }
    // One recipient per operation; multiple addresses cannot bypass per-recipient allowances.
    if (!/^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/.test(options.to)) return { success:false,error:'A single valid recipient is required.' }
    const hash = createHash('sha256').update(JSON.stringify([options.to.toLowerCase(),options.subject,options.body,options.category || 'transactional'])).digest('hex')
    const reservation = await supabase.rpc('saas_claim_delivery',{p_client:workspace,p_operation:operation,p_hash:hash,p_category:options.category || 'transactional'})
    if(reservation.error) return {success:false,error:'Email allowance is unavailable or has been reached.'}
    if(!reservation.data?.send) return reservation.data?.status==='accepted' ? {success:true,messageId:reservation.data.message_id} : {success:false,error:'This delivery is already being processed or requires review. It will not be sent twice.'}
    claimed = true
    const transporter = pooledTransport(credentials)

    const fromEmail = credentials.from_email || credentials.smtp_user
    const fromName = credentials.from_name || options.brandName || 'Support'

    const mailOptions: any = {
      from: `"${fromName}" <${fromEmail}>`,
      to: options.to,
      subject: options.isReply === false || options.subject.startsWith('Re:') ? options.subject : `Re: ${options.subject}`,
      text: options.body,
      html: formatEmailHtml(options.body, fromName),
    }

    // Threading headers
    if (options.inReplyTo) {
      mailOptions.inReplyTo = options.inReplyTo
      mailOptions.references = options.references ? `${options.references} ${options.inReplyTo}` : options.inReplyTo
    }

    const info = await transporter.sendMail(mailOptions)
    const finalized = await supabase.rpc('saas_finish_delivery',{p_client:workspace,p_operation:operation,p_status:'accepted',p_message:info.messageId})
    if(finalized.error) console.error('[email] acceptance persistence requires reconciliation',operation)

    return { success: true, messageId: info.messageId }
  } catch (err: any) {
    if(claimed && workspace) {
      const definite = ['EAUTH','EENVELOPE','EDNS','ECONNECTION'].includes(err.code) || (Number(err.responseCode)>=500)
      await supabase.rpc('saas_finish_delivery',{p_client:workspace,p_operation:operation,p_status:definite?'failed':'unknown',p_error:String(err.code || 'SMTP_UNKNOWN').slice(0,100)})
    }
    console.error('[Email Send Error]', err.message)
    return { success: false, error: err.message }
  }
}

export async function enqueueEmailReply(
  clientId: string,
  botId: string | null | undefined,
  options: SendEmailOptions & { sessionId?: string | null; idempotencyKey?: string | null }
): Promise<{ success: boolean; queued?: boolean; messageId?: string; error?: string }> {
  const credentials = await resolveSmtpCredentials(clientId, botId)
  if (!credentials) return { success: false, error: 'SMTP is not configured for this bot' }
  const { sessionId, idempotencyKey, ...delivery } = options
  const { data: job, error } = await supabase.from('email_delivery_jobs').insert({
    client_id: clientId, bot_id: botId || null, session_id: sessionId || null,
    recipient: delivery.to, subject: delivery.subject, body: delivery.body,
    headers: { in_reply_to: delivery.inReplyTo || null, references: delivery.references || null, brand_name: delivery.brandName || null, is_reply: delivery.isReply !== false },
    idempotency_key: idempotencyKey || null, status: 'queued',
  }).select('id').single()
  if (error?.code === '23505' && idempotencyKey) return { success: true, queued: true }
  // Compatibility before migration 063: preserve the existing direct sender.
  if (error || !job) return { success:false,error:'Email queue is unavailable. Please try again.' }
  if (!process.env.QSTASH_TOKEN) {
    const sent = await sendEmailReply(credentials, { ...delivery,operationId:`job:${job.id}` })
    await supabase.from('email_delivery_jobs').update({status:sent.success?'sent':'failed',provider_message_id:sent.messageId||null,last_error:sent.error||null,attempts:1,processed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id)
    return sent
  }
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
    if (!origin) throw new Error('NEXT_PUBLIC_APP_URL is required for queued email delivery')
    const { qstash } = await import('@/lib/qstash')
    await qstash.publishJSON({url:`${origin.replace(/\/$/,'')}/api/qstash/email-outbound`,body:{jobId:job.id},retries:5,flowControl:{key:'email-outbound',parallelism:15,rate:Number(process.env.EMAIL_OUTBOUND_RATE||100),period:'1s'},headers:process.env.EMAIL_WEBHOOK_SECRET?{'x-webhook-secret':process.env.EMAIL_WEBHOOK_SECRET}:undefined})
    return { success: true, queued: true, messageId: job.id }
  } catch (queueError: any) {
    await supabase.from('email_delivery_jobs').update({status:'failed',last_error:String(queueError?.message||queueError),updated_at:new Date().toISOString()}).eq('id',job.id)
    return { success: false, error: queueError?.message || 'Unable to queue email' }
  }
}
