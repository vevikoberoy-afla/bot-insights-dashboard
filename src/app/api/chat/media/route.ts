import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { randomUUID } from 'crypto'
import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { getCorsHeaders, handleOptions } from '@/lib/cors'
import { getIP, mediaRateLimit } from '@/lib/ratelimit'
import { verifyWidgetSessionToken } from '@/lib/security/widgetSessionToken'

export const maxDuration = 30

function isValidImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true
  // WebP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return true
  return false
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin')
  const contextId = req.nextUrl.searchParams.get('ctx') ?? ''
  const urlBotId = req.nextUrl.searchParams.get('bot')
  const cors = await getCorsHeaders(contextId, origin, urlBotId)
  return handleOptions(cors)
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rawContextId = req.nextUrl.searchParams.get('ctx')?.trim() ?? ''
  const contextId = (rawContextId === 'YOUR_CLIENT_ID' || rawContextId === 'null' || rawContextId === 'undefined') ? '' : rawContextId
  const urlBotId = req.nextUrl.searchParams.get('bot')?.trim() || null
  const cors = await getCorsHeaders(contextId, origin, urlBotId)

  try {
    // Authenticate before parsing a potentially large multipart body.
    let uploadClaims
    try { uploadClaims = verifyWidgetSessionToken(req.headers.get('x-widget-session-token') || '', 'widget') }
    catch { return NextResponse.json({ error: 'Invalid upload session.' }, { status: 401, headers: cors }) }
    if (Number(req.headers.get('content-length') || 0) > 6 * 1024 * 1024) {
      return NextResponse.json({ error: 'Upload is too large.' }, { status: 413, headers: cors })
    }
    const ipLimit = await mediaRateLimit.limit(getIP(req)).catch(() => null)
    if (!ipLimit) {
      return NextResponse.json({ error: 'Upload service temporarily unavailable.' }, { status: 503, headers: cors })
    }
    if (!ipLimit.success) {
      return NextResponse.json({ error: 'Too many uploads. Please try again later.' }, { status: 429, headers: cors })
    }
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const sessionId = (formData.get('session_id') as string | null) || 'anon'
    const botId = (formData.get('bot_id') as string | null) || urlBotId || uploadClaims.botId
    const effectiveContextId = (formData.get('context_id') as string | null) || contextId
    const flowId = formData.get('flow_id') as string | null
    const stepId = formData.get('step_id') as string | null

    try {
      const claims = uploadClaims
      if (claims.sessionId !== sessionId || (botId && claims.botId !== botId)) throw new Error('MEDIA_SCOPE_MISMATCH')
    } catch {
      return NextResponse.json({ error: 'This upload session has expired. Refresh the widget and try again.' }, { status: 401, headers: cors })
    }

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400, headers: cors })
    }

    const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Image is too large. Maximum upload size is 5 MB.' },
        { status: 413, headers: cors }
      )
    }

    // 1. RE-CHECK TOGGLE: photo_upload_enabled must be true for the bot or explicitly enabled
    let targetBotId = botId
    let photoUploadEnabled = false
    let validReturnPhotoStep = false

    if (targetBotId) {
      const { data: b } = await supabase
        .from('bots')
        .select('id, photo_upload_enabled, bot_flow')
        .eq('id', targetBotId)
        .maybeSingle()
      photoUploadEnabled = !!(b?.photo_upload_enabled ?? b?.bot_flow?.photo_upload_enabled)
      if (!photoUploadEnabled) {
        const { data: settings } = await supabase.from('bot_settings').select('support_config').eq('bot_id', targetBotId).maybeSingle()
        photoUploadEnabled = settings?.support_config?.photo_uploads === true
      }
    } else if (effectiveContextId) {
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('context_id', effectiveContextId)
        .maybeSingle()
      if (client?.id) {
        const { data: b } = await supabase
          .from('bots')
          .select('id, photo_upload_enabled, bot_flow')
          .eq('client_id', client.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        targetBotId = b?.id || null
        photoUploadEnabled = !!(b?.photo_upload_enabled ?? b?.bot_flow?.photo_upload_enabled)
      }
    } else {
      // Standalone widget preview or default mode
      photoUploadEnabled = true
    }

    // A verified damaged-item flow requires evidence even when the general
    // free-form chat attachment toggle is off.
    if (flowId && stepId && targetBotId) {
      const active = await redis.get<any>(`return_flow:${targetBotId}:${sessionId}`).catch(() => null)
      validReturnPhotoStep = !!active && active.flowId === flowId && active.stepId === stepId && active.step === 'photos'
      if (!validReturnPhotoStep) {
        return NextResponse.json({ error: 'This photo request has expired.' }, { status: 409, headers: cors })
      }
    }

    if (!photoUploadEnabled && !validReturnPhotoStep) {
      return NextResponse.json(
        { error: 'Photo uploads are not enabled for this bot.' },
        { status: 403, headers: cors }
      )
    }

    // 2. RATE LIMIT: Max 5 images per session
    if (sessionId && sessionId !== 'anon') {
      const rateKey = `media_uploads:${sessionId}`
      const uploadCount = await redis.incr(rateKey)
      if (uploadCount === 1) {
        await redis.expire(rateKey, 86400) // 24 hours
      }
      if (uploadCount > 5) {
        return NextResponse.json(
          { error: 'Session upload limit reached (maximum 5 images per chat session).' },
          { status: 429, headers: cors }
        )
      }
    }

    // 3. READ BUFFER & VALIDATE MAGIC BYTES (Security requirement)
    const arrayBuffer = await file.arrayBuffer()
    const rawBuffer = Buffer.from(arrayBuffer)

    if (!isValidImageMagicBytes(rawBuffer)) {
      return NextResponse.json(
        { error: 'Invalid file format. Only JPEG, PNG, and WebP images are accepted.' },
        { status: 400, headers: cors }
      )
    }

    // 4. SERVER-SIDE SHARP COMPRESS:
    // - Resize max 1024x1024 inside
    // - Auto-rotate based on orientation before stripping EXIF
    // - Strip EXIF metadata (privacy requirement)
    // - Output WebP quality 75%
    const compressedWebpBuffer = await sharp(rawBuffer, { limitInputPixels: 25_000_000 })
      .rotate()
      .resize(1024, 1024, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 75 })
      .toBuffer()

    // 5. UPLOAD TO SUPABASE STORAGE "chat-media" BUCKET
    const bucketName = 'chat-media'
    const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'anon'
    const fileName = `${safeSessionId}/${Date.now()}-${randomUUID()}.webp`

    // Ensure bucket exists
    try {
      const { data: buckets } = await supabase.storage.listBuckets()
      if (!buckets?.some(b => b.name === bucketName)) {
        await supabase.storage.createBucket(bucketName, {
          public: false,
          fileSizeLimit: 5242880,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
        })
      } else {
        await supabase.storage.updateBucket(bucketName, {
          public: false,
          fileSizeLimit: 5242880,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
        })
      }
    } catch (bErr) {
      console.warn('[chat/media] Bucket check/creation warning:', bErr)
    }

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, compressedWebpBuffer, {
        contentType: 'image/webp',
        upsert: false
      })

    if (uploadError) {
      console.error('[chat/media] Supabase storage upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to store image attachment.' },
        { status: 500, headers: cors }
      )
    }

    // Private media is exposed only through an expiring signed URL.
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 60 * 60)

    if (signedUrlError || !signedUrlData?.signedUrl) {
      await supabase.storage.from(bucketName).remove([fileName])
      return NextResponse.json(
        { error: 'Failed to create secure image URL.' },
        { status: 500, headers: cors }
      )
    }

    return NextResponse.json(
      {
        url: signedUrlData.signedUrl,
        storagePath: fileName,
        mediaType: 'image/webp',
        sizeBytes: compressedWebpBuffer.length
      },
      { headers: cors }
    )
  } catch (err: any) {
    console.error('[chat/media] Unexpected error:', err)
    return NextResponse.json(
        { error: 'Unable to process this image. Please try a valid JPEG, PNG, or WebP image.' },
      { status: 500, headers: cors }
    )
  }
}
