'use client'

export default function GlobalAnalytics() {
  const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL

  if (!umamiUrl) {
    return (
      <div className="flex items-center justify-center h-64 text-ink-muted">
        <p>Umami Analytics not configured. Add NEXT_PUBLIC_UMAMI_URL.</p>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Platform Analytics (Umami)</h2>
          <p className="text-sm text-ink-muted">
            Cross-client website traffic and widget analytics
          </p>
        </div>
        <a href={umamiUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
          Open in new tab ↗
        </a>
      </div>
      <iframe src={umamiUrl} className="flex-1 w-full border-0" title="Global Analytics" />
    </div>
  )
}
