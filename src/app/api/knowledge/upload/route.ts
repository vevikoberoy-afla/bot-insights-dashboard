import { NextRequest } from 'next/server'
import { handleDocumentUpload } from '@/lib/knowledge/documentUpload'

export const runtime = 'nodejs'
export const maxDuration = 60

// Compatibility endpoint: all document uploads share the same authorization,
// size limits, quarantine, parser isolation and ingestion path.
export async function POST(req: NextRequest) {
  return handleDocumentUpload(req)
}
