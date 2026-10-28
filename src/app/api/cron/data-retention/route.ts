import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function removeExpiredChatMedia() {
  const { data, error } = await supabase.rpc('retention_media_candidates')
  if (error) throw error
  const removable = Array.from(new Set((data || []).map((row: any) => {
    try { return decodeURIComponent(String(row.storage_path || '')) } catch { return String(row.storage_path || '') }
  }).filter(Boolean))) as string[]
  for (let index = 0; index < removable.length; index += 100) {
    const batch = removable.slice(index, index + 100)
    const { error } = await supabase.storage.from('chat-media').remove(batch)
    if (error) throw error
  }
  return removable.length
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(req.headers.get('authorization') || '')

  if (!secret || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let deletedMedia = 0
  try {
    deletedMedia = await removeExpiredChatMedia()
  } catch (error: any) {
    console.error('[cron/data-retention media]', error?.message || error)
    return NextResponse.json({ error: 'Media retention cleanup failed' }, { status: 500 })
  }

  const { data, error } = await supabase.rpc('enforce_data_retention')
  if (error) {
    console.error('[cron/data-retention]', error.message)
    return NextResponse.json({ error: 'Data retention cleanup failed' }, { status: 500 })
  }

  const { data: deletedNotifications, error: notificationError } = await supabase.rpc('prune_in_app_notifications', { p_limit: 5000 })
  if (notificationError && notificationError.code !== '42883') {
    console.error('[cron/data-retention notifications]', notificationError.message)
  }

  return NextResponse.json({ success: true, deletedMessages: Number(data || 0), deletedMedia, deletedNotifications: Number(deletedNotifications || 0) })
}
