'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function WaitlistPage() {
  const [form, setForm] = useState({ company_name: '', website_url: '', use_case: '', requested_seats: 1 })
  const [status, setStatus] = useState('waitlisted'), [busy, setBusy] = useState(true), [message, setMessage] = useState('')
  useEffect(() => { fetch('/api/auth/onboarding', { cache: 'no-store' }).then(async r => ({ ok: r.ok, body: await r.json() })).then(({ ok, body }) => {
    if (!ok) throw new Error(body.error)
    if (body.onboarding.status === 'approved') { window.location.replace('/overview'); return }
    setStatus(body.onboarding.status); setForm({ company_name: body.onboarding.company_name || '', website_url: body.onboarding.website_url || '', use_case: body.onboarding.use_case || '', requested_seats: body.onboarding.requested_seats || 1 })
  }).catch(e => setMessage(e.message)).finally(() => setBusy(false)) }, [])
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('')
    const r = await fetch('/api/auth/onboarding', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }), body = await r.json()
    setMessage(r.ok ? 'Your request details are saved.' : body.error || 'Unable to save.'); setBusy(false)
  }
  async function signOut() { await createClient().auth.signOut(); window.location.replace('/auth/login') }
  return <main className="min-h-screen bg-slate-950 px-5 py-12 text-white"><section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[.06] p-7 shadow-2xl backdrop-blur-xl sm:p-10">
    <div className="mb-7 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.22em] text-blue-300">Vittain access</p><h1 className="mt-3 text-3xl font-semibold">Your workspace request is queued</h1><p className="mt-3 text-sm leading-6 text-slate-300">We verify new workspaces before enabling customer data, bots, and integrations. You can safely update the request below.</p></div><span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-medium capitalize text-amber-300">{status}</span></div>
    <form onSubmit={save} className="space-y-4">
      <label className="block text-xs text-slate-300">Company name<input required minLength={2} maxLength={200} value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-blue-400" /></label>
      <label className="block text-xs text-slate-300">Website (optional)<input type="url" value={form.website_url} onChange={e => setForm({ ...form, website_url: e.target.value })} placeholder="https://example.com" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-blue-400" /></label>
      <label className="block text-xs text-slate-300">What will your team use Vittain for?<textarea maxLength={2000} rows={4} value={form.use_case} onChange={e => setForm({ ...form, use_case: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-blue-400" /></label>
      <label className="block text-xs text-slate-300">Expected team size<input required type="number" min={1} max={500} value={form.requested_seats} onChange={e => setForm({ ...form, requested_seats: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-blue-400" /></label>
      {message && <p role="status" className="rounded-xl bg-white/[.06] p-3 text-sm text-slate-200">{message}</p>}
      <div className="flex gap-3"><button disabled={busy} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold disabled:opacity-50">{busy ? 'Checking…' : 'Save request'}</button><button type="button" onClick={signOut} className="rounded-xl border border-white/15 px-4 py-3 text-sm">Sign out</button></div>
    </form>
  </section></main>
}
