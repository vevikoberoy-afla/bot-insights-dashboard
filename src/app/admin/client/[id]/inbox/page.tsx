'use client'

export default function InboxPage() {
  const chatwootUrl = process.env.NEXT_PUBLIC_CHATWOOT_URL

  if (!chatwootUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-ink-muted bg-surface rounded-xl border border-surface-border">
        <p>Inbox not configured. Add NEXT_PUBLIC_CHATWOOT_URL to your environment.</p>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col h-[calc(100vh-140px)] bg-surface rounded-xl border border-surface-border overflow-hidden">
      <div className="bg-surface-muted border-b border-surface-border px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Support Inbox</h2>
          <p className="text-sm text-ink-secondary">
            Live conversations — human handoffs appear here
          </p>
        </div>
        <a
          href={chatwootUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors rounded-lg text-sm font-medium"
        >
          Open in new tab ↗
        </a>
      </div>
      <iframe
        src={chatwootUrl}
        className="flex-1 w-full border-0"
        title="Support Inbox"
        allow="microphone; camera"
      />
    </div>
  )
}
