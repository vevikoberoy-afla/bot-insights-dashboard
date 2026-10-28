'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChatWidget } from '@/components/chat/ChatWidget'

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await res.json()

      if (res.ok) {
        setStatus('success')
        setEmail('')
        setMessage('You are on the list! We will be in touch soon.')
      } else {
        setStatus('error')
        setMessage(data.error || 'Failed to join waitlist. Please try again.')
      }
    } catch (err) {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-hidden relative selection:bg-purple-500/30">
      {/* Background gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/20 blur-[120px] pointer-events-none" />

      {/* Navigation */}
      <nav className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight">Vittain AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/widget" className="text-sm px-3.5 py-1.5 rounded-full bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 border border-purple-500/30 transition-colors font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Widget
          </Link>
          <Link href="/auth/login" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Login
          </Link>
          <Link href="/auth/register" className="text-sm px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
            Sign Up
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-32 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          The future of conversational AI
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
          Supercharge your <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">
            customer experience.
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mb-12 leading-relaxed">
          Embed an intelligent, multi-language RAG chatbot on your website in minutes. Turn your static knowledge base into dynamic, personalized conversations.
        </p>

        {/* Waitlist Form */}
        <div className="w-full max-w-md bg-white/5 border border-white/10 p-2 rounded-2xl backdrop-blur-md shadow-2xl">
          <form onSubmit={handleJoinWaitlist} className="flex gap-2 relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address..."
              required
              disabled={status === 'loading'}
              className="flex-1 bg-transparent border-none text-white px-4 py-3 focus:outline-none placeholder:text-zinc-600 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {status === 'loading' ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Joining...
                </>
              ) : 'Join Waitlist'}
            </button>
          </form>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`mt-4 text-sm font-medium ${status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message}
          </div>
        )}

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 text-left w-full">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Native Localization</h3>
            <p className="text-sm text-zinc-400">Instantly detects your visitor's browser language and responds fluently in that language, breaking global barriers.</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">AI Topic Modeling</h3>
            <p className="text-sm text-zinc-400">Discover exactly what your customers are asking with AI-generated insight reports summarizing the top conversation topics.</p>
          </div>

          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Total White-labeling</h3>
            <p className="text-sm text-zinc-400">Customize the chat widget to match your brand identity perfectly. Custom colors, greetings, and dynamic styling.</p>
          </div>
        </div>

        {/* Embedded Live Widget Showcase */}
        <div className="mt-28 w-full flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-xs font-medium mb-6 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Web Widget Showcase
          </div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-center">
            The New Frosted Glass Experience
          </h2>
          <p className="text-sm md:text-base text-zinc-400 max-w-xl text-center mb-10">
            Powered by modern glassmorphism, animated timeline rail, glowing radial halo badge, and instant SSE streaming.
          </p>
          <div className="w-full max-w-[480px]">
            <ChatWidget mode="embedded" initialOpen={true} />
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-8 text-center text-sm text-zinc-500">
        &copy; {new Date().getFullYear()} Vittain AI. All rights reserved.
      </footer>

      {/* Frosted Glass Floating Chat Widget (Isolated session to prevent duplicate active sessions on homepage) */}
      <ChatWidget mode="floating" initialOpen={false} sessionId="homepage_floating_preview" />
    </div>
  )
}
