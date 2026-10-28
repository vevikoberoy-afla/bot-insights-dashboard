import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireStaff, saasError } from '@/lib/saas/context'

export async function GET(req: NextRequest) {
  try { await requireStaff() } catch(error) { return saasError(error) }
    // This is a superadmin endpoint, but for boilerplate we just return all usage
    const { data, error } = await supabase
        .from('api_usage_log')
        .select(`
            *,
            clients(name)
        `)
        .order('date', { ascending: false })
        .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Group by provider for a high-level summary
    const summary = (data || []).reduce((acc: any, curr) => {
        if (!acc[curr.provider]) acc[curr.provider] = { calls: 0, cost: 0 }
        acc[curr.provider].calls += curr.calls_count
        acc[curr.provider].cost += Number(curr.cost_estimate)
        return acc
    }, {})

    return NextResponse.json({
        summary,
        logs: data
    })
}
export const dynamic = 'force-dynamic'
