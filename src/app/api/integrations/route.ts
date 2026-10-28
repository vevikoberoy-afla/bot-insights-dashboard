import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { mergeWriteOnlySecrets, redactSecretsForBrowser } from '@/lib/security/redactSecrets'
import { encryptConfigSecrets } from '@/lib/security/secretVault'

const COMMERCE_CHANNELS = new Set(['shopify', 'woocommerce'])

function commerceIdentity(channel: string, config: Record<string, unknown>) {
  if (channel === 'shopify') {
    const domain = String(config.shop_domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) throw new Error('Use the permanent store.myshopify.com domain')
    if (!String(config.access_token || '').trim()) throw new Error('Shopify Admin API access token is required')
    if (!String(config.webhook_secret || '').trim()) throw new Error('Shopify webhook signing secret is required')
    config.shop_domain = domain
    return domain
  }
  const raw = String(config.store_url || '').trim().replace(/\/$/, '')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('A valid WooCommerce HTTPS store URL is required') }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use the public HTTPS WooCommerce site origin, without a path')
  if (!String(config.consumer_key || '').startsWith('ck_') || !String(config.consumer_secret || '').startsWith('cs_')) throw new Error('Valid WooCommerce consumer credentials are required')
  if (!String(config.webhook_secret || '').trim()) throw new Error('WooCommerce webhook signing secret is required')
  config.store_url = url.origin
  return url.origin
}

// GET /api/integrations?client_id=xxx
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedWorkspaceUser(req,'settings')
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const client_id = user.workspaceId

  const { data, error } = await supabase
    .from('channel_integrations')
    .select('*')
    .eq('client_id', client_id)
    .order('created_at', { ascending: false })

  if (error) {
    // Table might not exist yet — return empty
    if (error.code === '42P01') return NextResponse.json([])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(redactSecretsForBrowser(data || []))
}

// POST /api/integrations — create a new channel instance
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedWorkspaceUser(req,'settings',true)
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const body = await req.json()
    const { channel, instance_name, config, bot_id } = body
    const client_id = user.workspaceId

    if (!client_id || !channel || !instance_name) {
      return NextResponse.json({ error: 'client_id, channel, and instance_name are required' }, { status: 400 })
    }
    if (bot_id) {
      const { data: ownedBot } = await supabase.from('bots').select('id').eq('id', bot_id).eq('client_id', client_id).maybeSingle()
      if (!ownedBot) return NextResponse.json({ error: 'The selected bot does not belong to this workspace' }, { status: 403 })
    }
    if (channel === 'email') {
      const emailAddress = String(config?.email_address || config?.from_email || config?.smtp_user || '').trim().toLowerCase()
      if (!emailAddress || !/^\S+@\S+\.\S+$/.test(emailAddress)) return NextResponse.json({ error: 'A valid mailbox email address is required' }, { status: 400 })
      if (!bot_id) return NextResponse.json({ error: 'Assign this mailbox to a bot' }, { status: 400 })
    }
    if (channel === 'whatsapp') {
      if (!bot_id) return NextResponse.json({ error: 'Assign this WhatsApp number to a bot' }, { status: 400 })
      if (!String(config?.phone_number_id || '').trim() || !String(config?.business_account_id || '').trim() || !String(config?.api_key || '').trim()) return NextResponse.json({ error: 'Phone Number ID, WABA ID, and permanent access token are required' }, { status: 400 })
      if (!/^[A-Z]{2}$/.test(String(config?.default_country || process.env.DEFAULT_PHONE_COUNTRY || 'IN').toUpperCase())) return NextResponse.json({ error: 'Default phone country must be a two-letter ISO code such as IN, US, or GB' }, { status: 400 })
    }
    let storeDomain = ''
    if (COMMERCE_CHANNELS.has(channel)) {
      try { storeDomain = commerceIdentity(channel, config || {}) } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }) }
    }

    const { data, error } = await supabase
      .from('channel_integrations')
      .insert({
        client_id,
        bot_id: bot_id || null,
        channel,
        instance_name,
        config: encryptConfigSecrets(client_id, config || {}),
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: 'Integrations migration has not been applied' }, { status: 503 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (COMMERCE_CHANNELS.has(channel)) {
      const { error: connectionError } = await supabase.from('commerce_store_connections').insert({
        client_id, integration_id: data.id, platform: channel, store_domain: storeDomain,
        status: 'pending', settings: { write_mode: config?.write_mode || 'read_only' },
      })
      if (connectionError) {
        await supabase.from('channel_integrations').delete().eq('id', data.id).eq('client_id', client_id)
        return NextResponse.json({ error: connectionError.code === '42P01' ? 'Apply supabase/104_ecommerce_store_connectors.sql before connecting a store' : connectionError.message }, { status: 503 })
      }
    }

    return NextResponse.json(redactSecretsForBrowser(data), { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

// PUT /api/integrations — update an existing instance
export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthenticatedWorkspaceUser(req,'settings',true)
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const body = await req.json()
    const { id, instance_name, config, status, bot_id } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    if (bot_id) {
      const { data: ownedBot } = await supabase.from('bots').select('id').eq('id', bot_id).eq('client_id', user.workspaceId).maybeSingle()
      if (!ownedBot) return NextResponse.json({ error: 'The selected bot does not belong to this workspace' }, { status: 403 })
    }
    const { data: existing } = await supabase.from('channel_integrations').select('channel,config').eq('id',id).eq('client_id',user.workspaceId).maybeSingle()
    if (config && (config.email_address || config.smtp_user) && !bot_id) return NextResponse.json({ error: 'Assign this mailbox to a bot' }, { status: 400 })
    if (existing?.channel === 'whatsapp' && !bot_id) return NextResponse.json({ error: 'Assign this WhatsApp number to a bot' }, { status: 400 })
    if (existing?.channel === 'whatsapp' && config?.default_country && !/^[A-Z]{2}$/.test(String(config.default_country).toUpperCase())) return NextResponse.json({ error: 'Default phone country must be a two-letter ISO code' }, { status: 400 })
    const plainMerged = mergeWriteOnlySecrets(existing?.config, config)
    let storeDomain = ''
    if (existing && COMMERCE_CHANNELS.has(existing.channel)) {
      // Existing secrets are encrypted. Only validate fields supplied by the browser;
      // write-only blank values keep the encrypted credential already in the vault.
      const identityConfig = { ...config }
      if (existing.channel === 'shopify') {
        identityConfig.access_token ||= plainMerged.access_token
        identityConfig.webhook_secret ||= plainMerged.webhook_secret
      } else {
        identityConfig.consumer_key ||= plainMerged.consumer_key
        identityConfig.consumer_secret ||= plainMerged.consumer_secret
        identityConfig.webhook_secret ||= plainMerged.webhook_secret
      }
      try { storeDomain = commerceIdentity(existing.channel, identityConfig) } catch (error: any) {
        // Domain validation is always safe; encrypted retained secrets count as configured.
        const secretOnly = /required/.test(error.message) && Object.values(plainMerged).some(value => typeof value === 'string' && value.startsWith('enc:'))
        if (!secretOnly) return NextResponse.json({ error: error.message }, { status: 400 })
        storeDomain = existing.channel === 'shopify' ? String(identityConfig.shop_domain) : String(identityConfig.store_url)
      }
    }
    const mergedConfig = encryptConfigSecrets(user.workspaceId, plainMerged)
    const { data, error } = await supabase
      .from('channel_integrations')
      .update({ instance_name, config: mergedConfig, status, bot_id: bot_id || null, updated_at: new Date().toISOString() })
      .eq('id', id).eq('client_id', user.workspaceId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (existing && COMMERCE_CHANNELS.has(existing.channel)) {
      await supabase.from('commerce_store_connections').update({ store_domain: storeDomain, status: status === 'paused' ? 'paused' : 'pending', updated_at: new Date().toISOString() }).eq('integration_id', id).eq('client_id', user.workspaceId)
    }
    return NextResponse.json(redactSecretsForBrowser(data))
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

// DELETE /api/integrations?id=xxx
export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedWorkspaceUser(req,'settings',true)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('channel_integrations').delete().eq('id', id).eq('client_id', user.workspaceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
