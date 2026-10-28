'use client'

export default function CampaignsPage() {
  const dittofeedUrl = process.env.NEXT_PUBLIC_DITTOFEED_URL

  if (!dittofeedUrl) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <p>Campaigns not configured. Add NEXT_PUBLIC_DITTOFEED_URL to your environment.</p>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Campaign Builder</h2>
          <p className="text-sm text-gray-500">
            Create WhatsApp and Email campaigns, segments, and automated journeys
          </p>
        </div>
        <a
          href={dittofeedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline"
        >
          Open in new tab ↗
        </a>
      </div>
      <iframe
        src={dittofeedUrl}
        className="flex-1 w-full border-0"
        title="Campaign Builder"
      />
    </div>
  )
}
