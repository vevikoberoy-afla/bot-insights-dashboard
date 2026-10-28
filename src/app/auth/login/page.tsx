'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function googleSignIn() {
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { access_type: 'offline', prompt: 'consent' } } })
    if (error) { setError(error.message); setLoading(false) }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setLoading(true); setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    })

    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Invalid email or password'
        : authError.message
      )
      setLoading(false)
      return
    }



    const response=await fetch('/api/auth/destination',{cache:'no-store'})
    const destination=await response.json()
    router.push(response.ok && ['/master-admin','/overview','/waitlist','/suspended'].includes(destination.destination) ? destination.destination : '/waitlist')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-surface-primary flex">
      {/* ── Left Panel: Animated Brand ── */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden items-center justify-center">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand via-brand-cyan to-purple-700 animate-gradient opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(0,210,255,0.3),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(108,92,231,0.4),transparent_70%)]" />

        {/* Content */}
        <div className="relative z-10 px-12 max-w-lg">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">Vittain AI</span>
          </div>

          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            Build AI chatbots<br />
            <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">in minutes, not months.</span>
          </h2>

          <p className="text-white/60 text-sm leading-relaxed mb-10">
            Scrape any website, connect live databases, and deploy an intelligent chatbot — all from one dashboard.
          </p>

          {/* Feature Cards */}
          <div className="space-y-3">
            {[
              { icon: '⚡', text: 'One-click website crawling & embedding' },
              { icon: '🔗', text: 'Live database lookups (Google Sheets, APIs)' },
              { icon: '🤖', text: 'AI-powered RAG with custom prompts' },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
                <span className="text-lg">{f.icon}</span>
                <span className="text-white/80 text-sm">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Panel: Login Form ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-white">Vittain AI</span>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Welcome back</h1>
          <p className="text-[var(--text-tertiary)] text-sm mb-8">Sign in to your dashboard</p>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com" autoComplete="email" autoFocus
                className="w-full bg-surface-quaternary border border-[var(--border-subtle)] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[var(--text-disabled)] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-light transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password"
                  className="w-full bg-surface-quaternary border border-[var(--border-subtle)] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[var(--text-disabled)] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-light transition-all pr-12"
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-white transition-colors p-1">
                  {showPw ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-[var(--status-error-bg)] border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading || !email.trim() || !password.trim()}
              className="w-full bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl text-sm transition-all hover:shadow-glow hover:-translate-y-0.5 active:translate-y-0 mt-2">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In →'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-[var(--text-tertiary)]"><span className="h-px flex-1 bg-white/10"/>or<span className="h-px flex-1 bg-white/10"/></div>
          <button type="button" disabled={loading} onClick={googleSignIn} className="w-full rounded-xl border border-[var(--border-subtle)] bg-surface-quaternary py-3.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40">Continue with Google</button>

          {/* Register link */}
          <p className="text-center text-sm text-[var(--text-tertiary)] mt-8">
            Don&apos;t have an account?{' '}
            <button onClick={() => router.push('/auth/register')}
              className="text-brand hover:text-brand-hover font-medium transition-colors">
              Create one
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
