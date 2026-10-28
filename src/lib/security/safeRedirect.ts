export function safeRedirect(value: string | null | undefined, fallback = '/overview') {
  if (!value || /[\u0000-\u0020\u007f]/.test(value) || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  try {
    const decoded = decodeURIComponent(value)
    if (/[\u0000-\u0020\u007f]/.test(decoded) || !decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) return fallback
    return value
  } catch {
    return fallback
  }
}
