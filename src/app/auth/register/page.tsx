'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function googleSignIn() {
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback?next=/waitlist`, queryParams: { access_type: 'offline', prompt: 'consent' } } })
    if (error) { setError(error.message); setLoading(false) }
  }

  const strength = (() => {
    if (password.length === 0) return { level: 0, text: '', color: '' }
    if (password.length < 6) return { level: 1, text: 'Weak', color: 'bg-red-500' }
    if (password.length < 8) return { level: 2, text: 'Fair', color: 'bg-orange-400' }
    const hasUpper = /[A-Z]/.test(password)
    const hasNum = /\d/.test(password)
    const hasSym = /[^A-Za-z0-9]/.test(password)
    const score = [hasUpper, hasNum, hasSym].filter(Boolean).length
    if (score >= 2 && password.length >= 10) return { level: 4, text: 'Strong', color: 'bg-emerald-400' }
    if (score >= 1) return { level: 3, text: 'Good', color: 'bg-yellow-400' }
    return { level: 2, text: 'Fair', color: 'bg-orange-400' }
  })()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password.trim()) { setError('All fields are required'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }

    setLoading(true); setError('')

    // 1. Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
      options: { data: { full_name: name.trim() } }
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // 2. Create organization + user record via API
    let destination = authData.session ? '/waitlist' : '/auth/login?message=verify_email'
    if (authData.user && authData.session) {
      const setup = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authData.session?.access_token
            ? { Authorization: `Bearer ${authData.session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
        }),
      })
      const result = await setup.json().catch(() => ({}))
      if (!setup.ok) { setError(result.error || 'Unable to submit your access request.'); setLoading(false); return }
      destination = result.destination || '/waitlist'
    }
    router.push(destination)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-surface-primary flex">
      {/* ── Left Panel ── */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-700 via-brand to-brand-cyan animate-gradient opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(0,210,255,0.3),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(108,92,231,0.4),transparent_70%)]" />

        <div className="relative z-10 px-12 max-w-lg">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">Vittain AI</span>
          </div>

          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            Your AI chatbot<br />
            <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">empire starts here.</span>
          </h2>

          <p className="text-white/60 text-sm leading-relaxed mb-10">
            Create your account, add your first client, and deploy a production-ready AI chatbot in under 5 minutes.
          </p>

          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              {['bg-purple-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-orange-500'].map((c, i) => (
                <div key={i} className={`w-8 h-8 rounded-full ${c} border-2 border-surface-primary flex items-center justify-center text-white text-xs font-bold`}>
                  {['V', 'A', 'S', 'K'][i]}
                </div>
              ))}
            </div>
            <p className="text-white/50 text-xs">Join agencies already building with Vittain</p>
          </div>
        </div>
      </div>

      {/* ── Right Panel: Form ── */}
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

          <h1 className="text-2xl font-bold text-white mb-2">Create your account</h1>
          <p className="text-[var(--text-tertiary)] text-sm mb-8">Start building AI chatbots today</p>

          <form onSubmit={handleRegister} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Full Name</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="John Doe" autoComplete="name" autoFocus
                className="w-full bg-surface-quaternary border border-[var(--border-subtle)] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[var(--text-disabled)] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-light transition-all"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Work Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com" autoComplete="email"
                className="w-full bg-surface-quaternary border border-[var(--border-subtle)] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[var(--text-disabled)] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-light transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters" autoComplete="new-password"
                className="w-full bg-surface-quaternary border border-[var(--border-subtle)] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[var(--text-disabled)] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-light transition-all"
              />
              {/* Strength Indicator */}
              {password.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength.level ? strength.color : 'bg-white/10'}`} />
                    ))}
                  </div>
                  <span className={`text-xs ${strength.level >= 3 ? 'text-emerald-400' : strength.level >= 2 ? 'text-orange-400' : 'text-red-400'}`}>
                    {strength.text}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Confirm Password</label>
              <input
                type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••" autoComplete="new-password"
                className="w-full bg-surface-quaternary border border-[var(--border-subtle)] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[var(--text-disabled)] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-light transition-all"
              />
              {confirm.length > 0 && password !== confirm && (
                <p className="text-red-400 text-xs mt-1">Passwords don&apos;t match</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-[var(--status-error-bg)] border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading || !name.trim() || !email.trim() || !password.trim() || password !== confirm}
              className="w-full bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl text-sm transition-all hover:shadow-glow hover:-translate-y-0.5 active:translate-y-0 mt-2">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Creating account...
                </span>
              ) : 'Create Account →'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-[var(--text-tertiary)]"><span className="h-px flex-1 bg-white/10"/>or<span className="h-px flex-1 bg-white/10"/></div>
          <button type="button" disabled={loading} onClick={googleSignIn} className="w-full rounded-xl border border-[var(--border-subtle)] bg-surface-quaternary py-3.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40">Continue with Google</button>

          <p className="text-center text-sm text-[var(--text-tertiary)] mt-8">
            Already have an account?{' '}
            <button onClick={() => router.push('/auth/login')}
              className="text-brand hover:text-brand-hover font-medium transition-colors">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
