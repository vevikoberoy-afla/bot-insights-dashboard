'use client'

import React, { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const ChatWidget = dynamic(
  () => import('@/components/chat/ChatWidget').then((mod) => mod.ChatWidget),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-white text-slate-400">
        <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
      </div>
    ),
  }
)

function WidgetView() {
  const searchParams = useSearchParams()
  const botId = searchParams.get('bot') || searchParams.get('botId') || searchParams.get('bot_id') || searchParams.get('id') || undefined
  const contextId = searchParams.get('ctx') || searchParams.get('contextId') || searchParams.get('context_id') || searchParams.get('clientId') || searchParams.get('client_id') || undefined
  const sessionId = searchParams.get('session_id') || searchParams.get('sessionId') || undefined
  const modeParam = searchParams.get('mode') as 'floating' | 'embedded' | 'fullscreen' | null
  const mode = modeParam || 'embedded'
  const [isInIframe, setIsInIframe] = React.useState(false)

  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const frameCheck = window.self !== window.top || searchParams.get('iframe') === 'true' || searchParams.get('embed') === 'true'
        setIsInIframe(frameCheck)
      }
    } catch {
      setIsInIframe(true)
    }
  }, [searchParams])

  if (isInIframe || mode === 'fullscreen') {
    return (
      <div className="w-full h-screen h-[100dvh] overflow-hidden bg-white p-0 m-0 flex flex-col font-sans antialiased selection:bg-blue-500/20">
        <ChatWidget
          botId={botId}
          contextId={contextId}
          sessionId={sessionId}
          mode="fullscreen"
          isIframe={true}
          initialOpen={true}
          photoUploadEnabled={true}
          className="w-full h-full flex-1"
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#edf5ff] via-[#fafcff] to-[#fff6f3] flex items-center justify-center p-2 sm:p-6 font-sans antialiased selection:bg-blue-500/20">
      {/* Background Ambience / Glow Orbs */}
      <div className="fixed top-[-15%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-300/20 blur-[140px] pointer-events-none" />
      <div className="fixed bottom-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full bg-rose-200/20 blur-[140px] pointer-events-none" />

      {/* Primary React Chat Widget */}
      <ChatWidget
        botId={botId}
        contextId={contextId}
        sessionId={sessionId}
        mode={mode}
        initialOpen={true}
        photoUploadEnabled={true}
      />
    </div>
  )
}

export default function WidgetPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center text-slate-400">
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
      </div>
    }>
      <WidgetView />
    </Suspense>
  )
}
