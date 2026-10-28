'use client'
import { useState } from 'react'
import { CheckCircle2, Send, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export default function TicketFeedbackPage() {
  const [rating, setRating] = useState(0); const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false); const [done, setDone] = useState(false); const [error, setError] = useState('')
  const submit = async () => {
    const token = new URLSearchParams(window.location.search).get('token'); if (!token || !rating) return
    setSaving(true); const res = await fetch('/api/csat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, rating, comment }) })
    const body = await res.json(); setSaving(false); if (!res.ok) return setError(body.error || 'Could not submit feedback'); setDone(true)
  }
  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-5"><div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-sm p-7 text-center">
    {done ? <><CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" /><h1 className="text-xl font-bold text-slate-900 mt-4">Thank you</h1><p className="text-sm text-slate-500 mt-2">Your feedback has been recorded.</p></> : <><div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto"><Star className="w-6 h-6" /></div><h1 className="text-xl font-bold text-slate-900 mt-4">How did we do?</h1><p className="text-sm text-slate-500 mt-2">Rate your support experience from 1 to 5.</p><div className="flex justify-center gap-2 my-6">{[1,2,3,4,5].map(value => <button key={value} onClick={() => setRating(value)} aria-label={`${value} stars`}><Star className={`w-8 h-8 transition-colors ${value <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} /></button>)}</div><Textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={2000} placeholder="Optional: tell us what went well or what we can improve…" className="min-h-24 text-left" />{error && <p className="text-xs text-red-600 mt-3">{error}</p>}<Button onClick={submit} disabled={!rating || saving} className="w-full mt-4 bg-slate-900 text-white hover:bg-slate-800"><Send />{saving ? 'Submitting…' : 'Submit feedback'}</Button></>}
  </div></main>
}
