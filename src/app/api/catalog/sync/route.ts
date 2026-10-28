import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'products', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const clientId = actor.workspaceId
    let productCount = 0
    let orderCount = 0
    for (const product of Array.isArray(body.products) ? body.products.slice(0, 5000) : []) {
      const row = { client_id: clientId, external_id: String(product.id || product.external_id || ''), sku: product.sku || null,
        name: String(product.name || product.title || '').trim(), price: product.price ?? null, currency: product.currency || 'INR',
        inventory_quantity: product.inventory_quantity ?? product.stock ?? null,
        inventory_status: product.inventory_status || ((product.inventory_quantity ?? product.stock ?? 0) > 0 ? 'in_stock' : 'out_of_stock'),
        metadata: product.metadata || {}, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      if (!row.name || !row.external_id) continue
      const { error } = await supabase.from('support_products').upsert(row, { onConflict: 'client_id,external_id' })
      if (!error) productCount++
    }
    for (const order of Array.isArray(body.orders) ? body.orders.slice(0, 5000) : []) {
      const row = { client_id: clientId, external_id: String(order.id || order.external_id || ''),
        order_number: String(order.order_number || order.number || '').trim(), customer_email: order.customer_email || order.email || null,
        customer_phone: order.customer_phone || order.phone || null, status: order.status || 'processing',
        fulfillment_status: order.fulfillment_status || null, total_amount: order.total_amount ?? order.total ?? null,
        currency: order.currency || 'INR', placed_at: order.placed_at || order.created_at || null,
        delivered_at: order.delivered_at || null, metadata: order.metadata || {}, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      if (!row.order_number) continue
      const { data: saved, error } = await supabase.from('support_orders').upsert(row, { onConflict: 'client_id,order_number' }).select('id').single()
      if (error || !saved) continue
      orderCount++
      if (Array.isArray(order.items)) {
        for (const [index, item] of order.items.entries()) {
          await supabase.from('support_order_items').upsert({ order_id: saved.id,
            external_id: String(item.id || item.external_id || `${index}`), sku: item.sku || null,
            name: String(item.name || item.title || 'Item'), quantity: Number(item.quantity || 1), unit_price: item.unit_price ?? item.price ?? null,
            metadata: item.metadata || {} }, { onConflict: 'order_id,external_id' })
        }
      }
    }
    return NextResponse.json({ success: true, products_synced: productCount, orders_synced: orderCount })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid catalog payload' }, { status: 400 })
  }
}
