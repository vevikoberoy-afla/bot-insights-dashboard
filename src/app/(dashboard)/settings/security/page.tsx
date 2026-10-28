'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader } from '@/components/shared/page-header'
import { ShieldCheck, Smartphone, LogOut, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

export default function SecurityPage() {
  const [email, setEmail] = useState('')
  const [mfa, setMfa] = useState(false)
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const client = createClient()
    Promise.all([
      client.auth.getUser().then(({ data }) => setEmail(data.user?.email || '')),
      client.auth.mfa.listFactors().then(({ data, error: mfaErr }) => {
        if (mfaErr) setError(mfaErr.message)
        else setMfa(!!data?.totp.some((f) => f.status === 'verified'))
      }),
    ]).finally(() => setLoading(false))
  }, [])

  const handleSignOutAll = async () => {
    setSigningOut(true)
    setError('')
    try {
      const client = createClient()
      const { error: signOutErr } = await client.auth.signOut({ scope: 'global' })
      if (signOutErr) throw signOutErr
      window.location.assign('/auth/login')
    } catch (err: any) {
      setError(err?.message || 'Failed to sign out of all sessions.')
      setSigningOut(false)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 md:p-8 max-w-4xl space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Account Security"
        description="Configure two-factor authentication, manage device credentials, and revoke active sessions."
      />

      {error && (
        <div role="alert" className="flex items-center gap-2.5 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Profile summary card */}
      <div className="rounded-xl border border-surface-border bg-surface p-5 shadow-2xs flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted font-semibold">Active Account</p>
          <p className="text-base font-medium text-ink mt-0.5">{email || 'Loading account details…'}</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-subtle text-xs font-medium text-ink-secondary border border-surface-border">
          <ShieldCheck className="w-3.5 h-3.5 text-accent" />
          <span>Protected Workspace</span>
        </div>
      </div>

      {/* Two-Factor Authentication Card */}
      <div className="rounded-xl border border-surface-border bg-surface overflow-hidden shadow-2xs">
        <div className="p-6 flex flex-col md:flex-row gap-6 items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-semibold text-ink">Two-Factor Authentication (MFA)</h2>
                {mfa ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    Recommended
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-ink-secondary leading-relaxed max-w-xl">
                Add an extra layer of security using an authenticator app (Google Authenticator, 1Password, or Authy). A temporary verification code will be required when logging in.
              </p>
            </div>
          </div>

          <div className="shrink-0 w-full md:w-auto">
            <Link
              href="/auth/mfa?next=/settings/security"
              className="w-full md:w-auto inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-accent/90 transition-colors"
            >
              {mfa ? 'Manage Authenticator' : 'Set Up Authenticator'}
            </Link>
          </div>
        </div>
      </div>

      {/* Session Invalidation Card */}
      <div className="rounded-xl border border-surface-border bg-surface overflow-hidden shadow-2xs">
        <div className="p-6 flex flex-col md:flex-row gap-6 items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-600 shrink-0">
              <LogOut className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">Global Session Termination</h2>
              <p className="mt-1.5 text-xs text-ink-secondary leading-relaxed max-w-xl">
                Immediately invalidate active sessions on all browsers and devices. You will be redirected to the login page and required to authenticate again.
              </p>
            </div>
          </div>

          <div className="shrink-0 w-full md:w-auto">
            <button
              disabled={signingOut}
              onClick={handleSignOutAll}
              className="w-full md:w-auto inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {signingOut ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Signing out…
                </>
              ) : (
                'Sign Out Everywhere'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
