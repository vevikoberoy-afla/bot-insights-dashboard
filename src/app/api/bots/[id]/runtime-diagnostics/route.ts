import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { supabase } from '@/lib/supabase'

const missing = (error: any) => ['42P01', 'PGRST205', '42703'].includes(error?.code || '')

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const user = await getAuthenticatedWorkspaceUser(req, 'bots', false)
  if (!user) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  const { data: bot } = await supabase.from('bots').select('id,client_id').eq('id', id).eq('client_id', user.workspaceId).maybeSingle()
  if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })

  const [serviceLinks, productLinks, offerLinks, couponLinks, knowledgeLinks, channels, supportSettings, operations, rejected] = await Promise.all([
    supabase.from('bot_booking_services').select('service_id,booking_services(name)').eq('bot_id', id),
    supabase.from('bot_catalog_products').select('product_id,catalog_products(name)').eq('bot_id', id),
    supabase.from('bot_booking_offers').select('offer_id').eq('bot_id', id),
    supabase.from('bot_coupon_rules').select('coupon_id').eq('bot_id', id).eq('enabled', true),
    supabase.from('bot_datasets').select('dataset_id').eq('bot_id', id),
    supabase.from('channel_integrations').select('id,channel,status').eq('client_id', user.workspaceId).eq('bot_id', id),
    supabase.from('bot_settings').select('support_config').eq('bot_id', id).maybeSingle(),
    supabase.from('chat_operations').select('operation_id,operation_type,status,created_at,error_code').eq('client_id', user.workspaceId).order('created_at', { ascending: false }).limit(12),
    supabase.from('chat_action_audit').select('id,flow_id,step_id,outcome,expected_revision,actual_revision,created_at').eq('client_id', user.workspaceId).eq('bot_id', id).order('created_at', { ascending: false }).limit(12),
  ])
  const fatal = [serviceLinks, productLinks, offerLinks, couponLinks, knowledgeLinks, channels, supportSettings].find(result => result.error && !missing(result.error))?.error
  if (fatal) return NextResponse.json({ error: fatal.message }, { status: 500 })
  const firstProduct: any = productLinks.data?.[0]?.catalog_products
  const firstService: any = serviceLinks.data?.[0]?.booking_services
  const support = (supportSettings.data as any)?.support_config || {}
  return NextResponse.json({
    capabilities: {
      services: serviceLinks.data?.length || 0,
      products: productLinks.data?.length || 0,
      offers: offerLinks.data?.length || 0,
      coupons: couponLinks.data?.length || 0,
      knowledge_sources: knowledgeLinks.data?.length || 0,
      channels: channels.data?.filter((item: any) => item.status !== 'disabled').length || 0,
      returns: support.returns_refunds === true,
      order_status: support.ticket_status === true || support.order_verification === true,
    },
    samples: { product: firstProduct?.name || '', service: firstService?.name || '' },
    operations: operations.error && missing(operations.error) ? [] : operations.data || [],
    rejected_actions: rejected.error && missing(rejected.error) ? [] : rejected.data || [],
    audit_installed: !rejected.error,
  })
}
