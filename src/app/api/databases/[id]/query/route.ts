import { NextRequest, NextResponse } from 'next/server'
import { resolveOrderFromDatabase } from '@/lib/orderResolver'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await getAuthenticatedWorkspaceResource(req, 'data_sources', params.id, 'sources')
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const lookupValue = req.nextUrl.searchParams.get('lookup_value')?.trim()
  if (!lookupValue) return NextResponse.json({ error: 'lookup_value is required' }, { status: 400 })
  if (lookupValue.length > 100) return NextResponse.json({ error: 'lookup_value is too long' }, { status: 400 })
  try {
    const result = await resolveOrderFromDatabase(params.id, lookupValue)
    if (result.status === 'found' && result.order) {
      return NextResponse.json({ found: true, source_name: result.order.source.sourceName,
        source_type: result.order.source.sourceType, data: result.order })
    }
    return NextResponse.json({ found: false, status: result.status,
      error: result.status === 'unavailable' ? 'The connected source could not be reached.' : undefined })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lookup failed' }, { status: 500 })
  }
}
