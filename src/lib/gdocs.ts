import { googleDocumentExport, fetchDocumentLink } from '@/lib/knowledge/documentLinks'
import { acquireDocumentImport } from '@/lib/knowledge/documentPolicy'
import { parseQuarantinedDocument } from '@/lib/knowledge/documentParser'

// Compatibility for older context imports. New knowledge-base document imports
// use their workspace-specific policy and durable ingestion directly.
export async function extractGoogleDocOrSheet(url: string): Promise<{ text: string; success: boolean }> {
  let release: (() => void) | undefined
  try {
    if (!googleDocumentExport(url)) return { text: '', success: false }
    release = acquireDocumentImport()
    const document = await fetchDocumentLink(url, 5 * 1024 * 1024)
    const parsed = await parseQuarantinedDocument(document.buffer, document.extension)
    return { text: parsed.text, success: true }
  } catch {
    return { text: '', success: false }
  } finally { release?.() }
}
