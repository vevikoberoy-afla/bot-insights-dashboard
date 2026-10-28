import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { assertSafeOutboundUrl, safeOutboundFetch } from '@/lib/urlSecurity'
import {BoundedCache} from '@/lib/boundedCache'

const MAX_RESPONSE_BYTES = 2_000_000
const MAX_ROWS = 10_000

export const ORDER_FIELD_ALIASES: Record<string, string[]> = {
  order_number: ['order_number', 'order_id', 'order_no', 'orderno', 'order', 'id', 'name'],
  customer_email: ['customer_email', 'email', 'email_address', 'billing_email', 'contact_email', 'customer.email'],
  customer_phone: ['customer_phone', 'phone', 'phone_number', 'mobile', 'mobile_number', 'billing_phone', 'customer.phone'],
  customer_name: ['customer_name', 'name', 'full_name', 'billing_name', 'contact_name', 'customer.name'],
  status: ['status', 'order_status', 'financial_status'],
  fulfillment_status: ['fulfillment_status', 'shipping_status', 'delivery_status'],
  placed_at: ['placed_at', 'order_date', 'created_at', 'created_date', 'date'],
  delivered_at: ['delivered_at', 'delivery_date', 'delivered_date', 'fulfilled_at'],
  total_amount: ['total_amount', 'order_total', 'total', 'amount', 'grand_total'],
  currency: ['currency', 'currency_code'],
  items: ['items', 'line_items', 'order_items', 'products'],
  item_name: ['item_name', 'product_name', 'product', 'title', 'description', 'line_item'],
  item_sku: ['item_sku', 'sku', 'product_sku', 'variant_sku'],
  item_quantity: ['item_quantity', 'quantity', 'qty'],
  item_price: ['item_price', 'unit_price', 'price'],
}

export type NormalizedOrderItem = {
  externalId: string
  name: string
  sku?: string | null
  quantity: number
  unitPrice?: number | null
  raw?: Record<string, unknown>
}

export type NormalizedOrder = {
  orderNumber: string
  customerEmail?: string | null
  customerPhone?: string | null
  customerName?: string | null
  status?: string | null
  fulfillmentStatus?: string | null
  placedAt?: string | null
  deliveredAt?: string | null
  totalAmount?: number | null
  currency?: string | null
  items: NormalizedOrderItem[]
  source: { databaseId: string; sourceId: string; sourceName: string; sourceType: string }
  raw: Record<string, unknown>
}

export type OrderResolution = {
  status: 'found' | 'not_found' | 'unavailable' | 'unconfigured'
  order?: NormalizedOrder
  errors?: string[]
}

type SourceDescriptor = {
  id: string
  databaseId: string
  sourceType: string
  sourceName: string
  endpointUrl: string
  authHeader?: string | null
  httpMethod?: string | null
  requestBody?: string | null
  sheetTab?: string | null
  lookupField?: string | null
  fieldMapping: Record<string, string>
}

type SourceRows = { rows: Record<string, unknown>[]; rowCount: number }

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const normalizeIdentifier = (value: unknown) => String(value ?? '').trim().replace(/^#/, '').toLowerCase()

function getPath(row: Record<string, unknown>, path: string): unknown {
  const directKey = Object.keys(row).find(key => normalizeKey(key) === normalizeKey(path))
  if (directKey) return row[directKey]
  let current: any = row
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    const key = Object.keys(current).find(candidate => normalizeKey(candidate) === normalizeKey(part))
    if (!key) return undefined
    current = current[key]
  }
  return current
}

function mappedFields(canonical: string, mapping: Record<string, string>) {
  const candidates = new Set<string>()
  const canonicalEntry = Object.entries(mapping).find(([key]) => normalizeKey(key) === normalizeKey(canonical))
  if (canonicalEntry?.[1]) candidates.add(canonicalEntry[1])
  for (const [sourceField, targetField] of Object.entries(mapping)) {
    if (normalizeKey(targetField) === normalizeKey(canonical)) candidates.add(sourceField)
  }
  for (const alias of ORDER_FIELD_ALIASES[canonical] || []) candidates.add(alias)
  return Array.from(candidates)
}

function fieldValue(row: Record<string, unknown>, canonical: string, mapping: Record<string, string>) {
  for (const field of mappedFields(canonical, mapping)) {
    const value = getPath(row, field)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function asNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function asDate(value: unknown): string | null {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function flattenRow(row: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const flattened: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(flattened, flattenRow(value as Record<string, unknown>, path))
    else flattened[path] = value
  }
  return flattened
}

function parseHeaders(raw?: string | null) {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (!raw?.trim()) return headers
  const value = raw.trim()
  if (value.startsWith('{')) {
    const parsed = JSON.parse(value)
    for (const [key, headerValue] of Object.entries(parsed)) headers[key] = String(headerValue)
  } else if (value.includes(':') && !value.toLowerCase().startsWith('bearer ')) {
    const separator = value.indexOf(':')
    headers[value.slice(0, separator).trim()] = value.slice(separator + 1).trim()
  } else headers.Authorization = value
  return headers
}

async function boundedText(response: Response) {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_RESPONSE_BYTES) throw new Error('Source response exceeds 2 MB')
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Source response exceeds 2 MB')
  return text
}

const sourceRowsCache = new BoundedCache<string,{rows:Record<string,unknown>[];expiresAt:number}>({maxEntries:20,maxBytes:16*1024*1024,ttlMs:5*60*1000})

function sheetsGvizUrl(value: string, tab?: string | null) {
  const match = value.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) throw new Error('Invalid Google Sheets URL')
  const gid = value.match(/gid=(\d+)/)?.[1]
  const query = tab ? `sheet=${encodeURIComponent(tab)}` : `gid=${gid || '0'}`
  return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&${query}`
}

function sheetsExportUrl(value: string, tab?: string | null) {
  const match = value.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) throw new Error('Invalid Google Sheets URL')
  const gid = value.match(/gid=(\d+)/)?.[1]
  const query = tab ? `sheet=${encodeURIComponent(tab)}` : `gid=${gid || '0'}`
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&${query}`
}

function parseCsv(text: string): Record<string, unknown>[] {
  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true, transformHeader: header => header.trim() })
  if (parsed.errors.length && !parsed.data.length) throw new Error(parsed.errors[0].message)
  return parsed.data.slice(0, MAX_ROWS)
}

function unwrapJson(value: any): Record<string, unknown>[] {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object').slice(0, MAX_ROWS)
  for (const key of ['data', 'orders', 'order', 'results', 'result', 'records']) {
    if (value[key]) {
      const rows = unwrapJson(value[key])
      if (rows.length) return rows
    }
  }
  return typeof value === 'object' ? [value] : []
}

async function fetchRows(source: SourceDescriptor, identifier?: string): Promise<SourceRows> {
  const cacheKey = `${source.id || source.endpointUrl}:${source.sheetTab || ''}`
  const cached = sourceRowsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { rows: cached.rows, rowCount: cached.rows.length }
  }

  const type = source.sourceType.toLowerCase()
  if (type === 'sheets' || type === 'google_sheets' || source.endpointUrl.includes('docs.google.com/spreadsheets')) {
    let rows: Record<string, unknown>[] | null = null
    // 1. Try fast Google Sheets visualization CSV endpoint (usually returns in < 1s with no redirects)
    try {
      const gvizUrl = sheetsGvizUrl(source.endpointUrl, source.sheetTab)
      const res = await safeOutboundFetch(gvizUrl, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        const text = await boundedText(res)
        rows = parseCsv(text)
      }
    } catch (e) {
      // Fall through to standard export URL
    }

    // 2. Fall back to standard export URL if gviz didn't return rows
    if (!rows || !rows.length) {
      const exportUrl = sheetsExportUrl(source.endpointUrl, source.sheetTab)
      const res = await safeOutboundFetch(exportUrl, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error(`Google Sheets returned ${res.status}`)
      const text = await boundedText(res)
      rows = parseCsv(text)
    }

    sourceRowsCache.set(cacheKey, { rows, expiresAt: Date.now() + 180_000 })
    return { rows, rowCount: rows.length }
  }
  if (type === 'csv_url' || type === 'csv' || type === 'upload') {
    await assertSafeOutboundUrl(source.endpointUrl)
    const response = await safeOutboundFetch(source.endpointUrl, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`CSV source returned ${response.status}`)
    const rows = parseCsv(await boundedText(response))
    sourceRowsCache.set(cacheKey, { rows, expiresAt: Date.now() + 180_000 })
    return { rows, rowCount: rows.length }
  }

  let endpoint = source.endpointUrl
  const encoded = encodeURIComponent(identifier || '')
  endpoint = endpoint.replace(/\{\{(?:identifier|order_id)\}\}|\{(?:identifier|order_id)\}/gi, encoded)
    .replace(/:order_id\b/gi, encoded)
  const url = await assertSafeOutboundUrl(endpoint)
  const method = String(source.httpMethod || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET'
  const headers = parseHeaders(source.authHeader)
  const init: RequestInit = { method, headers, cache: 'no-store', signal: AbortSignal.timeout(15000) }
  if (identifier && endpoint === source.endpointUrl && method === 'GET') url.searchParams.set(source.lookupField || 'id', identifier)
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json'
    const template = source.requestBody?.trim() || JSON.stringify({ [source.lookupField || 'id']: '{{identifier}}' })
    init.body = template.replace(/\{\{(?:identifier|order_id)\}\}|\{(?:identifier|order_id)\}/gi, identifier || '')
  }
  const response = await safeOutboundFetch(url, init)
  if (!response.ok) throw new Error(`REST source returned ${response.status}`)
  const raw = await boundedText(response)
  const rows = unwrapJson(JSON.parse(raw))
  return { rows, rowCount: rows.length }
}

function selectOrderRows(rows: Record<string, unknown>[], identifier: string, mapping: Record<string, string>, lookupField?: string | null) {
  const expected = normalizeIdentifier(identifier)
  const fields = [lookupField || '', ...mappedFields('order_number', mapping)].filter(Boolean)
  return rows.filter(row => fields.some(field => normalizeIdentifier(getPath(row, field)) === expected))
}

function normalizeItems(rows: Record<string, unknown>[], mapping: Record<string, string>): NormalizedOrderItem[] {
  let rootItems = fieldValue(rows[0], 'items', mapping)
  if (typeof rootItems === 'string' && rootItems.trim().startsWith('[')) {
    try { rootItems = JSON.parse(rootItems) } catch { /* use the row's item columns */ }
  }
  const itemRows: Record<string, unknown>[] = Array.isArray(rootItems)
    ? rootItems.filter(item => item && typeof item === 'object') as Record<string, unknown>[]
    : rows
  const items = itemRows.map((row, index) => {
    const name = fieldValue(row, 'item_name', mapping)
    const sku = fieldValue(row, 'item_sku', mapping)
    if (!name && !sku) return null
    return {
      externalId: String((row as any).id || sku || index + 1),
      name: String(name || sku || `Item ${index + 1}`).slice(0, 300),
      sku: sku ? String(sku).slice(0, 120) : null,
      quantity: Math.max(1, Math.floor(asNumber(fieldValue(row, 'item_quantity', mapping)) || 1)),
      unitPrice: asNumber(fieldValue(row, 'item_price', mapping)),
      raw: flattenRow(row),
    }
  }).filter(Boolean) as NormalizedOrderItem[]
  const deduped = new Map<string, NormalizedOrderItem>()
  for (const item of items) deduped.set(`${item.externalId}:${item.name}`, item)
  return Array.from(deduped.values())
}

function normalizeOrder(rows: Record<string, unknown>[], source: SourceDescriptor, requestedId: string): NormalizedOrder {
  const first = rows[0]
  return {
    orderNumber: String(fieldValue(first, 'order_number', source.fieldMapping) || requestedId).trim(),
    customerEmail: String(fieldValue(first, 'customer_email', source.fieldMapping) || '').trim().toLowerCase() || null,
    customerPhone: String(fieldValue(first, 'customer_phone', source.fieldMapping) || '').trim() || null,
    customerName: String(fieldValue(first, 'customer_name', source.fieldMapping) || '').trim() || null,
    status: String(fieldValue(first, 'status', source.fieldMapping) || '').trim() || null,
    fulfillmentStatus: String(fieldValue(first, 'fulfillment_status', source.fieldMapping) || '').trim() || null,
    placedAt: asDate(fieldValue(first, 'placed_at', source.fieldMapping)),
    deliveredAt: asDate(fieldValue(first, 'delivered_at', source.fieldMapping)),
    totalAmount: asNumber(fieldValue(first, 'total_amount', source.fieldMapping)),
    currency: String(fieldValue(first, 'currency', source.fieldMapping) || '').trim().toUpperCase() || null,
    items: normalizeItems(rows, source.fieldMapping),
    source: { databaseId: source.databaseId, sourceId: source.id, sourceName: source.sourceName, sourceType: source.sourceType },
    raw: flattenRow(first),
  }
}

async function descriptorsForDatabase(databaseId: string): Promise<SourceDescriptor[]> {
  const { data: database } = await supabase.from('data_sources').select('*').eq('id', databaseId).maybeSingle()
  if (!database) return []
  const descriptors: SourceDescriptor[] = []
  if (database.endpoint_url) descriptors.push({ id: database.id, databaseId, sourceType: database.source_type || 'api',
    sourceName: database.name || 'Primary source', endpointUrl: database.endpoint_url, authHeader: database.auth_header,
    httpMethod: 'GET', lookupField: database.lookup_field || database.lookup_param || 'id', fieldMapping: database.field_mapping || {} })
  const { data: sources } = await supabase.from('database_sources').select('*').eq('database_id', databaseId).neq('status', 'error').order('created_at')
  for (const source of sources || []) {
    const endpoint = source.sheet_url || source.endpoint_url || (String(source.source_name || '').startsWith('http') ? source.source_name : '')
    if (!endpoint) continue
    descriptors.push({ id: source.id, databaseId, sourceType: source.source_type || 'api', sourceName: source.source_name || 'Connected source',
      endpointUrl: endpoint, authHeader: source.auth_header, httpMethod: source.http_method,
      requestBody: source.request_body, sheetTab: source.sheet_tab,
      lookupField: database.lookup_field || database.lookup_param || 'id',
      fieldMapping: { ...(database.field_mapping || {}), ...(source.field_mapping || {}) } })
  }
  return descriptors
}

async function connectedDatabaseIds(clientId: string, botId?: string | null) {
  const ids = new Set<string>()
  if (botId) {
    const [botDatabases, botSources] = await Promise.all([
      supabase.from('bot_databases').select('database_id').eq('bot_id', botId),
      supabase.from('bot_data_sources').select('data_source_id').eq('bot_id', botId),
    ])
    botDatabases.data?.forEach(row => ids.add(row.database_id))
    botSources.data?.forEach(row => ids.add(row.data_source_id))
  }
  const { data: clientSources } = await supabase.from('data_sources').select('id').eq('client_id', clientId).eq('enabled', true)
  clientSources?.forEach(row => ids.add(row.id))
  return Array.from(ids)
}

export async function resolveConnectedOrder(input: { clientId: string; botId?: string | null; orderNumber: string }): Promise<OrderResolution> {
  const databaseIds = await connectedDatabaseIds(input.clientId, input.botId)
  if (!databaseIds.length) return { status: 'unconfigured' }
  const errors: string[] = []
  let attempted = 0
  for (const databaseId of databaseIds) {
    const sources = await descriptorsForDatabase(databaseId)
    for (const source of sources) {
      attempted++
      try {
        const result = await fetchRows(source, input.orderNumber)
        const matches = selectOrderRows(result.rows, input.orderNumber, source.fieldMapping, source.lookupField)
        if (matches.length) return { status: 'found', order: normalizeOrder(matches, source, input.orderNumber) }
      } catch (error: any) {
        errors.push(`${source.sourceName}: ${error.message || 'lookup failed'}`)
      }
    }
  }
  if (!attempted) return { status: 'unconfigured' }
  if (errors.length === attempted) return { status: 'unavailable', errors }
  return { status: 'not_found', errors }
}

export async function resolveOrderFromDatabase(databaseId: string, orderNumber: string): Promise<OrderResolution> {
  const sources = await descriptorsForDatabase(databaseId)
  if (!sources.length) return { status: 'unconfigured' }
  const errors: string[] = []
  for (const source of sources) {
    try {
      const result = await fetchRows(source, orderNumber)
      const matches = selectOrderRows(result.rows, orderNumber, source.fieldMapping, source.lookupField)
      if (matches.length) return { status: 'found', order: normalizeOrder(matches, source, orderNumber) }
    } catch (error: any) { errors.push(`${source.sourceName}: ${error.message || 'lookup failed'}`) }
  }
  return errors.length === sources.length ? { status: 'unavailable', errors } : { status: 'not_found', errors }
}

export async function previewDatabaseSource(databaseId: string, sourceId: string, identifier?: string) {
  const source = (await descriptorsForDatabase(databaseId)).find(item => item.id === sourceId)
  if (!source) throw new Error('Source is incomplete or missing its URL')
  const result = await fetchRows(source, identifier)
  return { source, rowCount: result.rowCount, rows: result.rows.slice(0, 5).map(row => flattenRow(row)) }
}

export async function persistResolvedOrder(clientId: string, order: NormalizedOrder) {
  const now = new Date().toISOString()
  const externalId = `${order.source.databaseId}:${order.orderNumber}`
  const { data: saved, error } = await supabase.from('support_orders').upsert({
    client_id: clientId, external_id: externalId, order_number: order.orderNumber,
    customer_email: order.customerEmail || null, customer_phone: order.customerPhone || null,
    status: order.status || 'unknown', fulfillment_status: order.fulfillmentStatus || null,
    total_amount: order.totalAmount ?? null, currency: order.currency || 'INR',
    placed_at: order.placedAt || null, delivered_at: order.deliveredAt || null,
    metadata: { connector: order.source, source_snapshot: order.raw, customer_name: order.customerName || null }, synced_at: now, updated_at: now,
  }, { onConflict: 'client_id,order_number' }).select('*').single()
  if (error) throw new Error(error.message)
  for (const item of order.items) {
    const { error: itemError } = await supabase.from('support_order_items').upsert({
      order_id: saved.id, external_id: item.externalId, sku: item.sku || null, name: item.name,
      quantity: item.quantity, unit_price: item.unitPrice ?? null, metadata: item.raw || {},
    }, { onConflict: 'order_id,external_id' })
    if (itemError) throw new Error(itemError.message)
  }
  return saved
}
