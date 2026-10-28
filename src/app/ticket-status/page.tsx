'use client'
import { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, RefreshCw, ShieldCheck, Ticket } from 'lucide-react'

export default function PublicTicketStatusPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) { setError('This ticket link is incomplete.'); return }
    fetch(`/api/ticket-status?token=${encodeURIComponent(token)}`).then(async res => {
      const body = await res.json(); if (res.ok) setData(body); else setError(body.error || 'Could not load ticket')
    }).catch(() => setError('Could not load ticket'))
  }, [])
  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-5"><div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
    <div className="p-6 border-b border-slate-200 flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Ticket className="w-5 h-5" /></div><div><h1 className="font-bold text-slate-900">Ticket status</h1><p className="text-xs text-slate-500 mt-0.5">Secure customer support update</p></div></div>
    {!data && !error && <div className="p-12 text-center text-sm text-slate-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Verifying your link…</div>}
    {error && <div className="p-10 text-center"><ShieldCheck className="w-8 h-8 text-slate-400 mx-auto mb-3" /><p className="font-semibold text-slate-900">Link unavailable</p><p className="text-sm text-slate-500 mt-2">{error}</p></div>}
    {data && <div className="p-6"><p className="text-xs font-mono font-bold text-blue-600">{data.ticket_number}</p><h2 className="text-lg font-bold text-slate-900 mt-1">{data.subject}</h2><div className="mt-6 p-4 bg-slate-50 rounded-xl flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Current status</p><p className="font-bold text-slate-900 capitalize mt-1">{String(data.status).replace('_',' ')}</p></div>{['resolved','solved','closed'].includes(data.status) ? <CheckCircle2 className="w-7 h-7 text-emerald-500" /> : <Clock3 className="w-7 h-7 text-blue-500" />}</div><p className="text-xs text-slate-500 mt-4">Last updated {new Date(data.updated_at).toLocaleString()}</p></div>}
  </div></main>
}
