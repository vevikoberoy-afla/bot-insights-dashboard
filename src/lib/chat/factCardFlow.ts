import { randomUUID } from 'crypto'
import { embed } from '@/lib/embeddings'
import { redis } from '@/lib/redis'
import { supabase } from '@/lib/supabase'
import { searchBotCatalog } from '@/lib/chat/catalogRepository'
import { currentFlowRevision } from '@/lib/chat/flowRevision'
import type { FlowMessage } from '@/lib/interactiveReturnFlow'

const FACT_INTENT = /\b(price|cost|how much|stock|available|availability|benefits?|ingredients?|allergens?|allerg(?:y|ic)|contain|compare|versus|\bvs\b|difference)\b/i
export const isAuthoritativeFactRequest=(text:string)=>FACT_INTENT.test(text)&&!/\b(order status|track(?:ing)? order|cancel (?:my )?order|return|refund|book|reserve|appointment)\b/i.test(text)
const ALLERGENS = ['peanut','tree nut','nut','milk','dairy','egg','soy','wheat','gluten','fish','shellfish','sesame']
const cleanQuery = (text: string) => text.toLowerCase()
  .replace(/\b(what|is|are|the|price|cost|of|how|much|does|do|you|have|in|stock|available|availability|benefits?|ingredients?|allergens?|allerg(?:y|ic)|contain|compare|versus|vs|difference|between|and|for|a|an)\b/g, ' ')
  .replace(/[^a-z0-9_-]+/g, ' ').replace(/\s+/g, ' ').trim()
const values = (value: unknown) => Array.isArray(value) ? value.map(v => String(v).toLowerCase()) : typeof value === 'string' ? value.toLowerCase().split(/[,;]+/).map(v => v.trim()) : []

async function scopedKnowledge(botId: string, text: string) {
  const [links, vector] = await Promise.all([
    supabase.from('bot_datasets').select('dataset_id,datasets(active_from,active_until)').eq('bot_id', botId),
    embed(text),
  ])
  const now = Date.now()
  const ids = (links.data || []).filter((link: any) => {
    const ds = link.datasets
    return !ds || (!ds.active_from || Date.parse(ds.active_from) <= now) && (!ds.active_until || Date.parse(ds.active_until) > now)
  }).map((link: any) => link.dataset_id)
  if (!ids.length) return []
  const result = await supabase.rpc('match_chunks_by_datasets', { p_dataset_ids: ids, p_embedding: JSON.stringify(vector), p_match_count: 3 })
  return result.error ? [] : (result.data || []).map((row: any) => String(row.content || row.text || '')).filter(Boolean)
}

async function activeResume(clientId: string, botId: string, sessionId: string) {
  const states = await Promise.all([redis.get<any>(`booking_flow:${clientId}:${botId}:${sessionId}`), redis.get<any>(`commerce_flow:${clientId}:${botId}:${sessionId}`)])
  const state = states.find(Boolean)
  if (!state?.id || !state?.stepId) return null
  return { state, revision: await currentFlowRevision(clientId, botId, sessionId, state.id) }
}

export async function handleAuthoritativeFactQuestion(input: { clientId: string; botId: string; sessionId: string; text: string }) {
  if (!isAuthoritativeFactRequest(input.text)) return null
  const query = ALLERGENS.reduce((value, allergen) => value.replace(new RegExp(`\\b${allergen.replace(' ', '\\s+')}s?\\b`, 'gi'), ' '), cleanQuery(input.text)).replace(/\s+/g, ' ').trim()
  if (query.length < 2) return null
  const needsKnowledge = /\b(benefits?|ingredients?|allergens?|allerg(?:y|ic)|contain|compare|versus|\bvs\b|difference)\b/i.test(input.text)
  const [products, chunks, resume] = await Promise.all([
    searchBotCatalog({ clientId: input.clientId, botId: input.botId, query, limit: 4 }),
    needsKnowledge ? scopedKnowledge(input.botId, input.text) : Promise.resolve([]),
    activeResume(input.clientId, input.botId, input.sessionId),
  ])
  if (!products.length) return null
  const price = /\b(price|cost|how much)\b/i.test(input.text), stock = /\b(stock|available|availability)\b/i.test(input.text), allergenQuestion = /\b(allergens?|allerg(?:y|ic)|contain|ingredients?)\b/i.test(input.text)
  const requested = ALLERGENS.filter(item => new RegExp(`\\b${item.replace(' ', '\\s+')}s?\\b`, 'i').test(input.text))
  const lines = products.map((product: any) => {
    const facts = [`**${product.name}**${product.sku ? ` (${product.sku})` : ''}`]
    if (price) facts.push(`${product.currency || 'INR'} ${Number(product.price || 0).toFixed(2)}`)
    if (stock) facts.push(Number(product.available_quantity ?? product.stock_quantity ?? 0) > 0 ? `In stock (${Number(product.available_quantity ?? product.stock_quantity)} available)` : 'Out of stock')
    if (allergenQuestion) {
      const attrs = product.attributes || {}, present = values(attrs.allergens), absent = values(attrs.allergen_free || attrs.free_from)
      facts.push(`Allergen check — ${(requested.length ? requested : ALLERGENS).map(name => `${name}: ${present.some(v => v.includes(name)) ? 'Present' : absent.some(v => v.includes(name)) ? 'Absent' : 'Unknown / Not specified'}`).join('; ')}`)
      if (attrs.ingredients) facts.push(`Ingredients: ${values(attrs.ingredients).join(', ') || String(attrs.ingredients)}`)
    }
    return facts.join(' — ')
  })
  if (needsKnowledge && chunks.length) lines.push(`Catalog notes: ${chunks.join(' ').slice(0, 700)}`)
  const first: any = products[0], available = Number(first.available_quantity ?? first.stock_quantity ?? 0)
  const cardProducts = products.map((product: any) => {
    const quantity = Number(product.available_quantity ?? product.stock_quantity ?? 0)
    return { value: `product:${product.id}`, name: product.name, label: product.name, description: product.description, sku: product.sku, imageUrl: product.image_url, price: Number(product.price || 0), currency: product.currency || 'INR', availableQuantity: Math.max(0, quantity), inStock: product.track_inventory === false || product.allow_backorder === true || quantity > 0, availabilityText: quantity > 0 ? `${quantity} available` : 'Out of stock' }
  })
  const messages: FlowMessage[] = [
    { id: randomUUID(), role: 'bot', type: 'text', flowId: `fact-${randomUUID()}`, stepId: randomUUID(), interactive: false, payload: { text: lines.join('\n') } },
    { id: randomUUID(), role: 'bot', type: 'product_grid', flowId: `fact-${randomUUID()}`, stepId: randomUUID(), interactive: cardProducts.some(product => product.inStock), payload: { factCard: true, title: available > 0 ? 'Available products' : 'Alternatives in stock', products: cardProducts } },
  ]
  if (resume) messages.push({ id: randomUUID(), role: 'bot', type: 'quick_replies', flowId: resume.state.id, stepId: resume.state.stepId, interactive: true, payload: { title: 'Your previous request is still saved.', text: 'Your previous request is still saved.', choices: [{ value: 'resume', label: 'Resume' }], revision: resume.revision } })
  return { answer: lines.join('\n'), source: 'authoritative_fact', messages, flow: null }
}
