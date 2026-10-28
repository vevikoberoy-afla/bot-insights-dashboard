import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const moved = () => NextResponse.json({
  error: 'Manual FAQ Overrides have moved to Knowledge Bases.',
  code: 'MOVED_TO_KNOWLEDGE_BASES',
  knowledge_url: '/knowledge',
}, { status: 410 })

// Kept as a clear compatibility response for older dashboard bundles. New FAQ
// content must be created as bot-linked knowledge so every channel retrieves it
// through the same permission and relevance pipeline.
export const GET = moved
export const POST = moved
export const PUT = moved
export const DELETE = moved
