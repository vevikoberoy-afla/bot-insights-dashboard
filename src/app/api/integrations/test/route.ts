import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/requestAuth'
import { assertSafeOutboundUrl } from '@/lib/urlSecurity'
import { testCommerceConnection } from '@/lib/integrations/commerceConnector'

// POST /api/integrations/test — test a channel connection without saving
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const body = await req.json()
    const { channel, config } = body

    if (!channel) {
      return NextResponse.json({ error: 'channel required' }, { status: 400 })
    }

    // Simulate different test outcomes per channel type
    switch (channel) {
      case 'whatsapp': {
        const { api_key, phone_number_id, business_account_id } = config || {}
        if (!api_key || !phone_number_id) {
          return NextResponse.json({ success: false, message: 'Missing API Key or Phone Number ID.' }, { status: 400 })
        }
        // Real test: hit Meta Graph API to validate the token
        try {
          const res = await fetch(
            `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}/${phone_number_id}?fields=display_phone_number,verified_name`,
            { headers: { Authorization: `Bearer ${api_key}` }, signal: AbortSignal.timeout(5000) }
          )
          const data = await res.json()
          if (data.error) {
            return NextResponse.json({ success: false, message: `Meta API Error: ${data.error.message}` })
          }
          return NextResponse.json({ success: true, message: `✅ Connected! Number: ${data.display_phone_number} (${data.verified_name})` })
        } catch {
          return NextResponse.json({ success: false, message: 'Could not reach Meta Graph API. Check your token.' })
        }
      }

      case 'telegram': {
        const { bot_token } = config || {}
        if (!bot_token) {
          return NextResponse.json({ success: false, message: 'Missing Bot Token.' }, { status: 400 })
        }
        try {
          const cleanToken = bot_token.trim()
          const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`, { signal: AbortSignal.timeout(5000) })
          const data = await res.json()
          if (!data.ok) {
            return NextResponse.json({ success: false, message: `Telegram Error: ${data.description}` })
          }

          // Auto-register webhook
          const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
          if (!appUrl) {
            return NextResponse.json({ 
              success: true, 
              message: `✅ Bot @${data.result.username} is valid! ⚠️ Webhook NOT registered — set NEXT_PUBLIC_APP_URL in your .env to your public URL (e.g. https://yourapp.com).` 
            })
          }

          const webhookUrl = `${appUrl}/api/webhooks/telegram`
          const hookRes = await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`)
          const hookData = await hookRes.json()
          
          if (!hookData.ok) {
            console.error('Webhook set failed:', hookData)
            return NextResponse.json({ 
              success: true, 
              message: `✅ Bot @${data.result.username} authenticated, but webhook registration failed: ${hookData.description}` 
            })
          }

          return NextResponse.json({ success: true, message: `✅ Connected! Bot: @${data.result.username} — Webhook registered to ${webhookUrl}` })
        } catch (err: any) {
          console.error('[Telegram Test Error]', err)
          return NextResponse.json({ success: false, message: 'Could not reach Telegram API. Check your token.' })
        }
      }

      case 'slack': {
        const { bot_token } = config || {}
        if (!bot_token) {
          return NextResponse.json({ success: false, message: 'Missing Bot Token.' }, { status: 400 })
        }
        try {
          const res = await fetch('https://slack.com/api/auth.test', {
            headers: { Authorization: `Bearer ${bot_token}` },
            signal: AbortSignal.timeout(5000),
          })
          const data = await res.json()
          if (!data.ok) {
            return NextResponse.json({ success: false, message: `Slack Error: ${data.error}` })
          }
          return NextResponse.json({ success: true, message: `✅ Connected! Team: ${data.team}, Bot: ${data.user}` })
        } catch {
          return NextResponse.json({ success: false, message: 'Could not reach Slack API. Check your token.' })
        }
      }

      case 'sms': {
        const { account_sid, auth_token } = config || {}
        if (!account_sid || !auth_token) {
          return NextResponse.json({ success: false, message: 'Missing Account SID or Auth Token.' }, { status: 400 })
        }
        try {
          const creds = Buffer.from(`${account_sid}:${auth_token}`).toString('base64')
          const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account_sid}.json`, {
            headers: { Authorization: `Basic ${creds}` },
            signal: AbortSignal.timeout(5000),
          })
          const data = await res.json()
          if (data.status === 401 || data.code === 20003) {
            return NextResponse.json({ success: false, message: 'Invalid Twilio credentials.' })
          }
          return NextResponse.json({ success: true, message: `✅ Connected! Account: ${data.friendly_name}` })
        } catch {
          return NextResponse.json({ success: false, message: 'Could not reach Twilio API.' })
        }
      }

      case 'email': {
        const { smtp_host, smtp_port, smtp_user, smtp_pass } = config || {}
        if (!smtp_host || !smtp_user || !smtp_pass) {
          return NextResponse.json({ success: false, message: 'SMTP host, username, and password are required.' }, { status: 400 })
        }
        try {
          const nodemailer = (await import('nodemailer')).default
          const port = Number(smtp_port || 587)
          const transporter = nodemailer.createTransport({host:smtp_host,port,secure:port===465,requireTLS:port!==465,auth:{user:smtp_user,pass:smtp_pass},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000,disableFileAccess:true,disableUrlAccess:true})
          await transporter.verify()
          transporter.close()
          return NextResponse.json({ success: true, message: `✅ SMTP authentication succeeded for ${smtp_user}.` })
        } catch (error: any) {
          return NextResponse.json({ success: false, message: `SMTP connection failed: ${error?.message || 'Check the server, port, and app password.'}` })
        }
      }

      case 'google_calendar': {
        if (!config?.access_token) return NextResponse.json({ success:false,message:'Access token is required.' },{status:400})
        const res=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendar_id||'primary')}`,{headers:{Authorization:`Bearer ${config.access_token}`},signal:AbortSignal.timeout(8000)}),data=await res.json()
        return NextResponse.json(res.ok?{success:true,message:`Connected to ${data.summary||config.calendar_id||'primary'}.`}:{success:false,message:data.error?.message||'Google Calendar connection failed.'})
      }
      case 'calendly': {
        if(!config?.access_token)return NextResponse.json({success:false,message:'Access token is required.'},{status:400})
        const res=await fetch('https://api.calendly.com/users/me',{headers:{Authorization:`Bearer ${config.access_token}`},signal:AbortSignal.timeout(8000)}),data=await res.json()
        return NextResponse.json(res.ok?{success:true,message:`Connected to ${data.resource?.name||'Calendly'}.`}:{success:false,message:data.message||'Calendly connection failed.'})
      }
      case 'acuity': {
        if(!config?.user_id||!config?.api_key)return NextResponse.json({success:false,message:'User ID and API key are required.'},{status:400})
        const res=await fetch('https://acuityscheduling.com/api/v1/me',{headers:{Authorization:`Basic ${Buffer.from(`${config.user_id}:${config.api_key}`).toString('base64')}`},signal:AbortSignal.timeout(8000)}),data=await res.json()
        return NextResponse.json(res.ok?{success:true,message:`Connected to ${data.firstName||data.name||'Acuity'}.`}:{success:false,message:data.message||'Acuity connection failed.'})
      }
      case 'custom_calendar':
      case 'booking_webhook': {
        const target=config?.base_url||config?.endpoint_url;if(!target)return NextResponse.json({success:false,message:'HTTPS URL is required.'},{status:400})
        await assertSafeOutboundUrl(target)
        return NextResponse.json({success:true,message:'URL passed public HTTPS safety validation. A live event will verify its API contract.'})
      }
      case 'shopify':
      case 'woocommerce': {
        try {
          const store = await testCommerceConnection(channel, config || {})
          return NextResponse.json({ success: true, message: `Connected to ${store.name} (${store.domain}).` })
        } catch (error: any) {
          return NextResponse.json({ success: false, message: error?.message || 'Store connection failed.' }, { status: 400 })
        }
      }


      default:
        return NextResponse.json({ success: true, message: '✅ Config saved. Connection will be verified on first use.' })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
