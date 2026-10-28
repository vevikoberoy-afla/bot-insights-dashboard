import { supabase } from './supabase'
import { redis } from './redis'
import { withTimeout } from './utils/withTimeout'
import Groq from 'groq-sdk' // legacy — kept for future use
import { chatClassify } from './gemini'
import { assertSafeOutboundUrl, safeOutboundFetch } from './urlSecurity'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _groqLegacy = new Groq({ apiKey: process.env.GROQ_API_KEY || '' })

interface DataSource {
    id: string
    source_type: string
    endpoint_url: string
    auth_header: string | null
    lookup_param: string
    field_mapping: Record<string, string>
}

/**
 * On-demand live data fetch with 45s Redis cache-aside & 1500ms hard timeout.
 * Called ONLY when Gemini tool-call (`fetch_live_data`) triggers.
 */
export async function handleFetchLiveData(
    clientId: string,
    args: { query_type: string; identifier?: string },
    botId?: string
): Promise<string> {
    const safeIdentifier = (args.identifier || '').trim().slice(0, 100).replace(/[<>{}\\]/g, '')
    const cacheKey = `live_data:${clientId || 'default'}:${args.query_type}:${safeIdentifier || 'all'}`

    // 1. Serve from Redis cache if fetched recently (45s TTL)
    try {
        const cached = await redis.get<string>(cacheKey)
        if (cached) return cached
    } catch {}

    // 2. Cache miss — fetch live, bounded by 5000ms hard timeout
    try {
        const fetchPromise = async (): Promise<string> => {
            if (!safeIdentifier) {
                return 'Please provide a specific Order ID or tracking number to look up in the database.'
            }

            const searchRes = await searchConnectedDatabases(safeIdentifier, {
                botId,
                clientId,
            })

            if (searchRes.found && searchRes.data) {
                return sanitizeLiveDataValue(searchRes.data)
            }
            return `No matching records found in the connected database for "${safeIdentifier}".`
        }

        const rawResult = await withTimeout(fetchPromise(), 15000, 'Database lookup timed out.')
        const result = sanitizeLiveDataValue(rawResult)
        redis.set(cacheKey, result, { ex: 45 }).catch(() => {})
        return result
    } catch (err) {
        console.error('[handleFetchLiveData error]:', err)
        return 'Live database is temporarily unavailable. Please try again shortly.'
    }
}

/**
 * Strips bracket tags and prompt injection markers from external sheet/REST values
 */
function sanitizeLiveDataValue(text: string): string {
    if (!text) return ''
    return text
        .replace(/[<>{}]/g, '')
        .replace(/(?:ignore\s+(?:all\s+)?previous\s+instructions|system\s+prompt|developer\s+mode)/gi, '[FILTERED]')
        .slice(0, 2000)
}

// Search across all databases and multi-source connections linked to a bot or client
export async function searchConnectedDatabases(
    identifier: string,
    opts: { botId?: string | null; clientId?: string | null; contextId?: string | null } = {}
): Promise<{ found: boolean; data: string | null }> {
    const cleanIdentifier = (identifier || '').trim()
    if (!cleanIdentifier) return { found: false, data: null }

    const dbIdSet = new Set<string>()

    // 1. Linked bot_databases
    if (opts.botId) {
        const { data: botDbs } = await supabase.from('bot_databases').select('database_id').eq('bot_id', opts.botId)
        botDbs?.forEach((d: any) => d.database_id && dbIdSet.add(d.database_id))

        const { data: botSources } = await supabase.from('bot_data_sources').select('data_source_id').eq('bot_id', opts.botId)
        botSources?.forEach((d: any) => d.data_source_id && dbIdSet.add(d.data_source_id))

        // If bot has client_id, also check client databases
        const { data: botRow } = await supabase.from('bots').select('client_id').eq('id', opts.botId).maybeSingle()
        if (botRow?.client_id && !opts.clientId) {
            opts.clientId = botRow.client_id
        }
    }

    // 2. Client data_sources
    if (opts.clientId) {
        const { data: clientDbs } = await supabase.from('data_sources').select('id').eq('client_id', opts.clientId).eq('enabled', true)
        clientDbs?.forEach((d: any) => d.id && dbIdSet.add(d.id))
    }

    // 3. ContextId data_sources
    if (opts.contextId) {
        const { data: ctxDbs } = await supabase.from('data_sources').select('id').eq('context_id', opts.contextId).eq('enabled', true)
        ctxDbs?.forEach((d: any) => d.id && dbIdSet.add(d.id))
    }

    // Never fall back to system-wide sources. Returning no result is safer
    // than allowing one tenant to query another tenant's connected database.
    if (dbIdSet.size === 0) {
        return { found: false, data: null }
    }

    // Search candidate database IDs
    for (const dbId of Array.from(dbIdSet)) {
        try {
            const res = await lookupByDataSourceId(dbId, cleanIdentifier)
            if (res) {
                return { found: true, data: res }
            }
        } catch (err) {
            console.warn(`[searchConnectedDatabases] error looking up in db ${dbId}:`, err)
        }
    }

    return { found: false, data: null }
}

// Legacy entry point — used if no tool calling is active
export async function lookupInDataSource(
    contextId: string,
    orderId: string
): Promise<string | null> {
    const res = await searchConnectedDatabases(orderId, { contextId })
    return res.data
}

// Agentic Tool Calling entry point — uses specific data_source_id
export async function lookupByDataSourceId(
    dataSourceId: string,
    identifier: string
): Promise<string | null> {
    const { data: ds } = await supabase
        .from('data_sources')
        .select('*')
        .eq('id', dataSourceId)
        .maybeSingle()

    if (ds && ds.endpoint_url) {
        const res = await executeDataSource(ds, identifier)
        if (res) return res
    }

    // Also query multi-source database_sources table if available
    try {
        const { data: subSources } = await supabase
            .from('database_sources')
            .select('*')
            .eq('database_id', dataSourceId)
            .neq('status', 'error')

        if (subSources && subSources.length > 0) {
            for (const sub of subSources) {
                const isSheet = sub.source_type === 'sheets' || 
                                sub.source_type === 'google_sheets' ||
                                !!sub.sheet_url || 
                                sub.source_name?.includes('docs.google.com/spreadsheets') ||
                                sub.endpoint_url?.includes('docs.google.com/spreadsheets')

                if (isSheet) {
                    const sheetUrl = sub.sheet_url || 
                                     sub.endpoint_url || 
                                     (sub.source_name?.includes('docs.google.com/spreadsheets') ? sub.source_name : null) ||
                                     (sub.source_name?.startsWith('http') ? sub.source_name : null)
                    if (sheetUrl) {
                        const res = await queryGoogleSheets({ 
                            id: sub.id,
                            source_type: 'sheets',
                            endpoint_url: sheetUrl, 
                            auth_header: sub.auth_header,
                            lookup_param: 'id',
                            field_mapping: sub.field_mapping || ds?.field_mapping || {} 
                        }, identifier)
                        if (res) return res
                    }
                } else if (sub.source_type === 'api' || sub.source_type === 'rest_api' || sub.endpoint_url) {
                    const url = sub.endpoint_url || (sub.source_name?.startsWith('http') ? sub.source_name : null)
                    if (url) {
                        const res = await queryRestApi({
                            id: sub.id,
                            source_type: 'api',
                            endpoint_url: url,
                            auth_header: sub.auth_header,
                            lookup_param: ds?.lookup_field || 'id',
                            field_mapping: sub.field_mapping || ds?.field_mapping || {}
                        }, identifier)
                        if (res) return res
                    }
                }
            }
        }
    } catch (err) {
        console.error('[datasource] database_sources lookup failed:', err)
    }

    return null
}

async function executeDataSource(ds: DataSource, identifier: string): Promise<string | null> {
    try {
        switch (ds.source_type) {
            case 'google_sheets':
            case 'sheets':
                return await queryGoogleSheets(ds, identifier)
            case 'rest_api':
            case 'api':
                return await queryRestApi(ds, identifier)
            case 'csv_url':
                return await queryCsvUrl(ds, identifier)
            default:
                if (ds.endpoint_url?.includes('docs.google.com/spreadsheets')) {
                    return await queryGoogleSheets(ds, identifier)
                }
                return null
        }
    } catch (err) {
        console.error('[datasource] lookup failed:', err)
        return null
    }
}

// ── Google Sheets ─────────────────────────────────────────────────────────────
// Converts any Google Sheets URL to a public CSV export URL
async function queryGoogleSheets(ds: DataSource, orderId: string): Promise<string | null> {
    const csvUrl = sheetsUrlToCsv(ds.endpoint_url)
    if (!csvUrl) return null

    const res = await fetch(csvUrl, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null

    const csv = await res.text()
    return searchCsv(csv, orderId, ds.field_mapping)
}

function sheetsUrlToCsv(url: string): string | null {
    // Extract sheet ID from any Google Sheets URL format
    const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    if (!match) return null
    const sheetId = match[1]

    // Extract gid (tab ID) if present
    const gidMatch = url.match(/gid=(\d+)/)
    const gid = gidMatch ? gidMatch[1] : '0'

    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`
}

// ── REST API ──────────────────────────────────────────────────────────────────
async function queryRestApi(ds: DataSource, orderId: string): Promise<string | null> {
    const url = await assertSafeOutboundUrl(ds.endpoint_url)
    url.searchParams.set(ds.lookup_param ?? 'id', orderId)

    const headers: Record<string, string> = { 'Accept': 'application/json' }
    if (ds.auth_header) headers['Authorization'] = ds.auth_header

    const res = await safeOutboundFetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null

    const data = await res.json()
    if (!data || (Array.isArray(data) && data.length === 0)) return null

    const row = Array.isArray(data) ? data[0] : data
    return formatResult(row, orderId, ds.field_mapping)
}

// ── CSV URL ───────────────────────────────────────────────────────────────────
async function queryCsvUrl(ds: DataSource, orderId: string): Promise<string | null> {
    await assertSafeOutboundUrl(ds.endpoint_url)
    const res = await safeOutboundFetch(ds.endpoint_url, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const csv = await res.text()
    return searchCsv(csv, orderId, ds.field_mapping)
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function searchCsv(
    csv: string,
    orderId: string,
    fieldMapping: Record<string, string> = {}
): string | null {
    if (!orderId || !orderId.trim()) return null
    const lines = csv.trim().split('\n').filter(Boolean)
    if (lines.length < 2) return null

    // Parse headers
    const headers = parseCsvLine(lines[0])
    const cleanId = orderId.trim().toLowerCase().replace(/^#/, '')

    // Search each row for the order ID
    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i])
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h.trim()] = (values[idx] ?? '').trim() })

        // Check if any cell matches the order ID (case-insensitive & stripped of #)
        const matched = Object.values(row).some(val => {
            if (!val) return false
            const cleanVal = val.toLowerCase().replace(/^#/, '').trim()
            if (cleanVal === cleanId) return true
            if (cleanVal.length >= cleanId.length && cleanVal.includes(cleanId)) return true
            return false
        })

        if (matched) {
            return formatResult(row, orderId, fieldMapping)
        }
    }

    return null
}

function parseCsvLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue }
        if (char === ',' && !inQuotes) { result.push(current); current = ''; continue }
        current += char
    }
    result.push(current)
    return result
}

// ── Format result for LLM ────────────────────────────────────────────────────
function formatResult(
    row: Record<string, unknown>,
    orderId: string,
    fieldMapping: Record<string, string>
): string {
    // Build a readable summary from the row data
    const lines = [`Order lookup result for ID: ${orderId}`]

    // Use field mapping if available, otherwise show all fields
    const mapping = fieldMapping ?? {}
    const mappedKeys = Object.keys(mapping)

    if (mappedKeys.length > 0) {
        for (const [key, label] of Object.entries(mapping)) {
            const value = row[key] ?? row[label]
            if (value !== undefined && value !== '') {
                lines.push(`${label}: ${value}`)
            }
        }
    } else {
        // Show all fields
        for (const [key, value] of Object.entries(row)) {
            if (value !== undefined && value !== '') {
                lines.push(`${key}: ${value}`)
            }
        }
    }

    return lines.join('\n')
}

/**
 * Extracts order search identifier or detects order intent from user message and conversation history
 */
export function extractOrderDetails(
    text: string,
    history: Array<{ role: string; content: string }> = []
): { orderId: string | null; isAskingForOrder: boolean } {
    // Strip common emojis and trim
    const clean = text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g, '').trim()

    // 1. Explicit 'order id is XYZ' or 'order #XYZ' or 'order: XYZ'
    const explicitPrefix = clean.match(/(?:order|tracking|ticket)\s*(?:id|number|no|#)?\s*(?:is|:|-|#|\s)\s*([A-Za-z0-9-_]{3,25})\b/i)
    if (explicitPrefix && explicitPrefix[1] && !/^(status|details|update|info|please|help)$/i.test(explicitPrefix[1])) {
        return { orderId: explicitPrefix[1].toUpperCase(), isAskingForOrder: true }
    }

    // 2. Specific formatted IDs like ORD-001, ORD_123, ORD001, TRK-9999, #12345
    const formattedId = clean.match(/\b([A-Za-z]{2,5}[-_]\d{1,10}[A-Za-z0-9-_]*)\b/i) ||
                        clean.match(/\b(ORD\d{1,10}[A-Za-z0-9-_]*)\b/i) ||
                        clean.match(/#(\d{3,12})\b/)
    if (formattedId && formattedId[1]) {
        return { orderId: formattedId[1].toUpperCase(), isAskingForOrder: true }
    }

    // 3. Standalone code (e.g. user just replies 'ORD-001', '12345', 'XYZ-789')
    if (/^[A-Za-z0-9-_]{2,15}$/.test(clean)) {
        const recentBotMsg = history.slice(-3).find(h => h.role === 'assistant' || h.role === 'model')?.content || ''
        const wasAsked = /order\s*(?:id|number|status)|tracking|provide/i.test(recentBotMsg)
        if (wasAsked || /^(ORD|TRK|ID)/i.test(clean) || /^\d{3,8}$/.test(clean)) {
            return { orderId: clean.toUpperCase(), isAskingForOrder: true }
        }
    }

    // 4. General order/tracking inquiry without an ID yet
    const isAsking = /\b(order\s*status|track\s*(?:my\s*)?order|where\s*is\s*(?:my\s*)?order|check\s*(?:my\s*)?order|order\s*tracking|delivery\s*status|shipping\s*status)\b/i.test(clean)
    return { orderId: null, isAskingForOrder: isAsking }
}

// ── Intent detection ──────────────────────────────────────────────────────────
// ── Intent detection ──────────────────────────────────────────────────────────
// Extracts ANY lookup identifier from natural language (Name, Email, ID, etc.)
export async function extractLookupKey(currentMessage: string): Promise<string | null> {
    const text = currentMessage.trim();
    if (!text) return null;

    try {
        const extracted = await chatClassify(
            `You extract search identifiers from customer messages. 
The customer might provide an Order ID, a Ticket Number, a Name, an Email, or a Phone Number to check their status in a database.
If the message contains a likely identifier, output ONLY the extracted identifier (no punctuation, no explanation).
If there is no identifier, output the exact word "NONE".
Examples:
"My name is Murali Krishna when does it end?" -> "Murali Krishna"
"Where is order #12345?" -> "12345"
"status of project alpha" -> "alpha"
"hello how are you" -> "NONE"`,
            text,
            32
        );

        if (extracted === 'NONE' || extracted === '') return null;
        return extracted;
    } catch (e) {
        console.error('Failed to extract lookup key:', e);
        return null;
    }
}
