import { getEffectiveEntitlements, dashboardWriteAllowed } from '@/lib/saas/entitlements'

export const DOCUMENT_EXTENSIONS = ['pdf', 'txt', 'docx', 'md', 'csv'] as const
export const MAX_DOCUMENT_TEXT = 250_000
export const MAX_DOCUMENT_MB = 20
export class DocumentImportError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
export async function documentPolicy(clientId: string) {
  const entitlements = await getEffectiveEntitlements(clientId)
  if (!dashboardWriteAllowed(entitlements) || !entitlements.features['knowledge.enabled']) throw new DocumentImportError('Document imports are unavailable for this workspace.', 403)
  const configured = entitlements.limits['knowledge.documents.max_file_mb'] ?? 5
  const maxFileMb = Math.max(0, Math.min(MAX_DOCUMENT_MB, Number.isFinite(configured) ? Math.floor(configured) : 5))
  return { maxFileMb, maxBytes: maxFileMb * 1024 * 1024, extensions: DOCUMENT_EXTENSIONS, maxTextCharacters: MAX_DOCUMENT_TEXT }
}
export function documentFilename(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\x00-\x1f\x7f/\\:]/.test(value)) throw new DocumentImportError('Use a simple filename without paths or special control characters.')
  const filename = value.trim()
  const extension = filename.split('.').pop()?.toLowerCase()
  if (!(DOCUMENT_EXTENSIONS as readonly string[]).includes(extension || '')) throw new DocumentImportError('Upload a PDF, TXT, DOCX, Markdown, or CSV document.')
  return { filename, extension: extension! }
}

// One upload/download parser per server process. Excess work gets a retryable
// response rather than an unbounded queue retaining buffers in memory.
let activeImport = false
export function acquireDocumentImport() {
  if (activeImport) throw new DocumentImportError('A document is being checked. Please try again in a moment.', 429)
  activeImport = true
  return () => { activeImport = false }
}
