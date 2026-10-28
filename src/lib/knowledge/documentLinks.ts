import { assertSafeOutboundUrl, safeOutboundFetchBuffer } from '@/lib/urlSecurity'
import { DocumentImportError, DOCUMENT_EXTENSIONS } from '@/lib/knowledge/documentPolicy'

export function googleDocumentExport(value: string) {
  const url = new URL(value)
  const withResourceKey=(target:string)=>{
    const key=url.searchParams.get('resourcekey')
    if(!key||!/^[\w-]{1,200}$/.test(key))return target
    const exported=new URL(target);exported.searchParams.set('resourcekey',key);return exported.toString()
  }
  if(url.hostname==='drive.google.com'){
    const id=url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/)?.[1] || (/^\/(?:open|uc)$/.test(url.pathname)?url.searchParams.get('id'):null)
    if(id&&/^[\w-]{5,200}$/.test(id))return{url:withResourceKey(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`),extension:undefined,google:true}
  }
  if (url.hostname !== 'docs.google.com') return null
  if (/^\/document\/d\/e\/[\w-]+\/pub\/?$/.test(url.pathname)) return { url: url.toString(), extension: 'html', google: true }
  const doc = url.pathname.match(/^\/document(?:\/u\/\d+)?\/d\/([\w-]+)(?:\/|$)/)
  if (doc) return { url: withResourceKey(`https://docs.google.com/document/d/${doc[1]}/export?format=txt`), extension: 'txt', google: true }
  const sheet = url.pathname.match(/^\/spreadsheets(?:\/u\/\d+)?\/d\/([\w-]+)(?:\/|$)/)
  if (sheet && sheet[1] !== 'e') {
    const gid = url.searchParams.get('gid') || new URLSearchParams(url.hash.slice(1)).get('gid') || '0'
    if (!/^\d{1,16}$/.test(gid)) throw new DocumentImportError('The Google Sheet tab identifier is invalid.')
    return { url: withResourceKey(`https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv&gid=${gid}`), extension: 'csv', google: true }
  }
  return null
}
export async function fetchDocumentLink(value: unknown, maxBytes: number) {
  if (typeof value !== 'string' || value.length > 2048) throw new DocumentImportError('Enter a valid public HTTPS document link.')
  let url: URL
  try { url = await assertSafeOutboundUrl(value.trim()) }
  catch { throw new DocumentImportError('Enter a public HTTPS document link. Private network addresses are not allowed.') }
  const google = googleDocumentExport(url.toString())
  let result
  try {
    result = await safeOutboundFetchBuffer(google?.url || url, {
      maxBytes, signal: AbortSignal.timeout(20_000), allowPublicRedirects: true,
      headers: { Accept: 'text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html;q=0.8,*/*;q=0.5' },
    })
  } catch (error) {
    if (error instanceof Error && /too large/i.test(error.message)) throw new DocumentImportError('This document exceeds your workspace file-size limit.', 413)
    throw new DocumentImportError('The document server could not be reached or redirected to an unsafe address. Try downloading the file and uploading it instead.', 502)
  }
  const { response, buffer, contentType } = result
  if ([401,403,404].includes(response.status) && google) throw new DocumentImportError('Google did not allow access to this document. Enable “Anyone with the link”, allow downloads, or upload an exported copy.', 403)
  if (!response.ok) throw new DocumentImportError(`The document server returned ${response.status}. Check the link or upload a downloaded copy.`, 502)
  if (google?.extension !== 'html' && google && (contentType === 'text/html' || /<html|<!doctype html/i.test(buffer.subarray(0,1024).toString('utf8')))) throw new DocumentImportError('Google returned a sign-in or access page instead of document text. Share the document publicly with downloads enabled, or upload an exported copy.', 403)
  const remoteName = new URL(response.url || url).pathname.split('/').pop() || 'document'
  const extension = google?.extension || (contentType === 'application/pdf' || buffer.subarray(0,5).toString() === '%PDF-' ? 'pdf'
    : contentType.includes('wordprocessingml') || (buffer.length>=4 && buffer.readUInt32LE(0)===0x04034b50) ? 'docx'
    : contentType === 'text/html' || contentType === 'application/xhtml+xml' ? 'html'
    : contentType.includes('markdown') ? 'md' : contentType.includes('csv') ? 'csv'
    : (DOCUMENT_EXTENSIONS as readonly string[]).includes(remoteName.split('.').pop()?.toLowerCase() || '') ? remoteName.split('.').pop()!.toLowerCase() : 'txt')
  return { buffer, extension, title: google ? url.hostname === 'docs.google.com' && google.extension === 'csv' ? 'Google Sheet' : 'Google document' : remoteName.slice(0,150), sourceUrl: url.toString() }
}
