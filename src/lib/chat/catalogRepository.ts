import { supabase } from '@/lib/supabase'
import { BoundedCache } from '@/lib/boundedCache'

const catalogCache=new BoundedCache<string,any[]>({maxEntries:256,maxBytes:16*1024*1024,ttlMs:15_000})
const pendingSearches=new Map<string,Promise<any[]>>()
const copyRows=(rows:any[])=>rows.map(row=>({...row,attributes:row.attributes&&typeof row.attributes==='object'?{...row.attributes}:row.attributes}))

const missingFunction = (error: any) =>
  error?.code === 'PGRST202'
  || error?.code === '42883'
  || /search_bot_catalog_page|schema cache|does not exist/i.test(String(error?.message || ''))

export async function searchBotCatalog(input: {
  clientId: string
  botId: string
  query?: string
  productIds?: string[]
  limit?: number
}) {
  const limit = Math.max(1, Math.min(50, Number(input.limit || 20)))
  const productIds = Array.from(new Set((input.productIds || []).filter(Boolean))).slice(0, 50)
  const cacheKey=JSON.stringify([input.clientId,input.botId,String(input.query||'').slice(0,200),productIds.slice().sort(),limit])
  const cached=catalogCache.get(cacheKey);if(cached)return copyRows(cached)
  const pending=pendingSearches.get(cacheKey);if(pending)return copyRows(await pending)
  const loading=loadBotCatalog(input,limit,productIds)
  pendingSearches.set(cacheKey,loading)
  try{const rows=await loading;catalogCache.set(cacheKey,rows);return copyRows(rows)}finally{pendingSearches.delete(cacheKey)}
}

async function loadBotCatalog(input:{clientId:string;botId:string;query?:string;productIds?:string[];limit?:number},limit:number,productIds:string[]) {

  const [searchResult, selectedResult] = await Promise.all([
    supabase.rpc('search_bot_catalog_page', {
      p_client: input.clientId,
      p_bot: input.botId,
      p_query: String(input.query || '').slice(0, 200),
      p_limit: limit,
    }),
    productIds.length
      ? supabase.from('catalog_product_availability').select('*')
          .eq('client_id', input.clientId).eq('status', 'active').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  let searched: any[] = []
  if (!searchResult.error) {
    searched = (searchResult.data || []).map((row: any) => row.product || row)
  } else if (missingFunction(searchResult.error)) {
    // Rolling-deploy compatibility only. Once migration 090 is installed the
    // bounded RPC is always used and this broad compatibility read disappears.
    const fallback = await supabase.from('catalog_product_availability').select('*')
      .eq('client_id', input.clientId).eq('status', 'active').order('name').limit(1000)
    if (fallback.error) throw fallback.error
    searched = fallback.data || []
  } else {
    throw searchResult.error
  }
  if ((selectedResult as any).error) throw (selectedResult as any).error

  const merged = new Map<string, any>()
  for (const row of [...searched, ...((selectedResult as any).data || [])]) merged.set(row.id, row)
  return Array.from(merged.values())
}
