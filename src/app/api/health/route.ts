import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Check Supabase Database connection
    const startDb = Date.now()
    const { error: dbError } = await supabase.from('clients').select('id').limit(1)
    const dbLatency = Date.now() - startDb

    if (dbError) throw new Error(`Database error: ${dbError.message}`)

    // Could add Upstash Redis check here if rate limiter exposed a ping method

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: 'up',
          latency_ms: dbLatency
        },
        api: {
          status: 'up'
        }
      }
    }, { status: 200 })

  } catch (err: any) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err.message
    }, { status: 503 })
  }
}
