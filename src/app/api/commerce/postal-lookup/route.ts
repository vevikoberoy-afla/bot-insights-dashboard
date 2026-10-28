import { NextRequest, NextResponse } from 'next/server'
import { normalizePostal, parseIndiaPost, parseZippopotam, validPostalFormat, type PostalLocation } from '@/lib/postalLookup'
import { localRateLimit } from '@/lib/security/rateLimitFallback'

async function provider(url: string, parser: (data: any) => PostalLocation | null) {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'SIEXY-Postal-Lookup/1.0' }, next: { revalidate: 86400 }, signal: AbortSignal.timeout(3500) })
    if (!response.ok) throw new Error('POSTAL_NOT_FOUND')
    const location = parser(await response.json())
    if (!location) throw new Error('POSTAL_NOT_FOUND')
    return location
}

export async function GET(request: NextRequest) {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(), requestId = forwarded || request.headers.get('x-real-ip') || 'local'
    if (!localRateLimit(`postal:${requestId}`, 15, 60_000).success) return NextResponse.json({ valid: false, error: 'Too many postal lookups' }, { status: 429, headers: { 'Cache-Control': 'no-store' } })
    const country = String(request.nextUrl.searchParams.get('country') || '').trim().toUpperCase()
    const postal = normalizePostal(request.nextUrl.searchParams.get('postal'))
    if (!validPostalFormat(country, postal)) return NextResponse.json({ valid: false, error: 'Invalid country or postal code' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    try {
        const lookups = [provider(`https://api.zippopotam.us/${encodeURIComponent(country)}/${encodeURIComponent(postal)}`, parseZippopotam)]
        if (country === 'IN') lookups.unshift(provider(`https://api.postalpincode.in/pincode/${encodeURIComponent(postal)}`, parseIndiaPost))
        const location = await Promise.any(lookups)
        return NextResponse.json({ valid: true, verified: true, country, postal, ...location }, { headers: { 'Cache-Control': 'private, max-age=86400' } })
    } catch { return NextResponse.json({ valid: true, verified: false, country, postal }, { headers: { 'Cache-Control': 'private, max-age=300' } }) }
}
