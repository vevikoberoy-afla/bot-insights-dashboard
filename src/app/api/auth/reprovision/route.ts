import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const TILEDESK_URL = process.env.TILEDESK_URL || 'http://tiledesk.placeholder.local'
const DITTOFEED_URL = process.env.DITTOFEED_URL || 'http://dittofeed.placeholder.local'

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const res = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timeoutId)
        if (!res.ok) throw new Error(`External API failed: ${res.statusText}`)
        return res
    } catch (error) {
        clearTimeout(timeoutId)
        throw error
    }
}

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization')
        let token = ''
        if (authHeader?.startsWith('Bearer ')) token = authHeader.slice(7)
        if (!token) {
            const cookieHeader = req.headers.get('Cookie')
            if (cookieHeader) {
                const match = cookieHeader.match(/sb-[a-z0-9]+-auth-token=([^;]+)/)
                if (match) {
                    try { token = JSON.parse(decodeURIComponent(match[1]))[0] } catch (e) {}
                }
            }
        }
        
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { cookies: { getAll: () => [], setAll: () => {} } }
        )

        const authClient = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => [], setAll: () => {} } }
        )

        const { data: { user } } = await authClient.auth.getUser(token)
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Check current status
        const { data: client, error } = await supabase
            .from('clients')
            .select('id, provisioning_status')
            .eq('id', user.id)
            .single()

        if (error || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
        if (client.provisioning_status === 'complete') return NextResponse.json({ success: true, status: 'complete' })

        let currentStatus = client.provisioning_status

        // Resolve directly to complete
        if (currentStatus === 'pending' || currentStatus === 'tiledesk_done') {
            await supabase.from('clients').update({
                provisioning_status: 'complete'
            }).eq('id', user.id)
            currentStatus = 'complete'
        }

        return NextResponse.json({ success: true, status: currentStatus })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
