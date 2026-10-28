const CHUNK_SIZE = 400
const CHUNK_OVERLAP = 50

export async function chunkText(text: string): Promise<string[]> {
  const normalized = String(text || '').replace(/\r\n?/g, '\n').trim()
  if (!normalized) return []
  const chunks: string[] = []
  let start = 0
  while (start < normalized.length && chunks.length < 10_000) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length)
    if (end < normalized.length) {
      const window = normalized.slice(start, end)
      const boundary = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '), window.lastIndexOf(' '))
      if (boundary >= Math.floor(CHUNK_SIZE * 0.55)) end = start + boundary + 1
    }
    const value = normalized.slice(start, end).trim()
    if (value.length > 30) chunks.push(value)
    if (end >= normalized.length) break
    start = Math.max(start + 1, end - CHUNK_OVERLAP)
  }
  return chunks
}
