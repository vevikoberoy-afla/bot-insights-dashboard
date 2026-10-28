'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'

type Channel = 'website' | 'whatsapp' | 'email'
type KbSource = 'url' | 'text' | 'file' | 'database'

export default function NewClientPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const existingClientId = searchParams.get('client_id') // pre-fill if adding bot to existing client
  const kbFileRef = useRef<HTMLInputElement>(null)

  const [token, setToken] = useState('')
  const [step, setStep] = useState(existingClientId ? 2 : 1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [createdClientId, setCreatedClientId] = useState(existingClientId || '')

  // Step 1 — Company
  const [companyName, setCompanyName] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [industry, setIndustry] = useState('')
  const [notes, setNotes] = useState('')

  // Step 2 — Channel
  const [channel, setChannel] = useState<Channel>('website')
  const [botName, setBotName] = useState('')
  const [botPurpose, setBotPurpose] = useState('support')
  const [welcomeMsg, setWelcomeMsg] = useState('Hi! How can I help you today?')
  const [waPhoneId, setWaPhoneId] = useState('')
  const [waToken, setWaToken] = useState('')
  const [emailAddr, setEmailAddr] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [createdBot, setCreatedBot] = useState<any>(null)

  // Step 3 — Knowledge
  const [kbSources, setKbSources] = useState<KbSource[]>([])
  const [siteUrls, setSiteUrls] = useState<string[]>([''])
  const [maxPages, setMaxPages] = useState(50)
  const [manualTexts, setManualTexts] = useState<string[]>([''])
  const [kbFiles, setKbFiles] = useState<File[]>([])
  const [dbUrls, setDbUrls] = useState<string[]>([''])

  // Step 4 — Contacts
  const [contactsFile, setContactsFile] = useState<File | null>(null)
  const contactsFileRef = useRef<HTMLInputElement>(null)
  const [sheetUrl, setSheetUrl] = useState('')

  useEffect(() => {
    getVerifiedAccessToken(supabase).then(accessToken => {
      if (!accessToken) { router.push('/auth/login'); return }
      setToken(accessToken)
    })
  }, [])

  function toggleKb(s: KbSource) {
    setKbSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function handleFinish() {
    setSubmitting(true); setError('')
    try {
      let clientId = createdClientId

      // Step 1: Create company if new
      if (!clientId) {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            name: companyName.trim(), email: companyEmail.trim() || null,
            notes: notes.trim() || null,
            website_url: kbSources.includes('url') && siteUrls[0] ? siteUrls[0].trim() : null,
            start_crawl: false,
            max_pages: maxPages,
          }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error)
        clientId = d.client.id
        setCreatedClientId(clientId)
      }

      // Step 2: Create the bot
      const botRes = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          client_id: clientId,
          name: botName.trim() || `${channel.charAt(0).toUpperCase() + channel.slice(1)} Bot`,
          purpose: botPurpose,
          welcome_message: welcomeMsg.trim() || 'Hi! How can I help you today?',
          channel,
          ...(channel === 'whatsapp' ? { phone_number_id: waPhoneId, access_token: waToken } : {}),
          ...(channel === 'email' ? { email_address: emailAddr, smtp_host: smtpHost, smtp_port: Number(smtpPort), smtp_user: smtpUser, smtp_pass: smtpPass } : {}),
        }),
      })
      const botData = await botRes.json()
      if (!botRes.ok) throw new Error(botData.error || 'Failed to create bot')
      setCreatedBot(botData)

      // Step 3.0: URL Crawls
      if (kbSources.includes('url')) {
        for (const url of siteUrls) {
          if (url.trim()) {
            await fetch('/api/crawl/client', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ context_id: clientId, url: url.trim() }), // we pass clientId which maps to context via api logic
            }).catch(() => {})
          }
        }
      }

      // Step 3.1: Manual text knowledge
      if (kbSources.includes('text')) {
        for (const text of manualTexts) {
          if (text.trim()) {
            await fetch('/api/chunks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ client_id: clientId, title: 'Manual Addition', text: text.trim(), source_type: 'manual' }),
            })
          }
        }
      }

      // Step 3.2: File upload
      if (kbSources.includes('file') && kbFiles.length > 0) {
        const fd = new FormData()
        for (const file of kbFiles) {
          fd.append('files', file)
        }
        fd.append('client_id', clientId)
        await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd })
      }

      // Step 5: Contacts import
      if (contactsFile) {
        const fd = new FormData()
        fd.append('file', contactsFile)
        fd.append('client_id', clientId)
        await fetch('/api/contacts/import', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd })
      } else if (sheetUrl.trim()) {
        await fetch('/api/contacts/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ client_id: clientId, url: sheetUrl.trim() }),
        })
      }

      setDone(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
    setSubmitting(false)
  }

  const CHANNELS: { id: Channel; icon: string; label: string; desc: string }[] = [
    { id: 'website', icon: '🌐', label: 'Website Widget', desc: 'Embed an AI chat widget on any website. No site? No problem.' },
    { id: 'whatsapp', icon: '📱', label: 'WhatsApp Bot', desc: 'Auto-reply to WhatsApp Business inquiries 24/7.' },
    { id: 'email', icon: '📧', label: 'Email Bot', desc: 'Auto-reply to incoming email enquiries with AI.' },
  ]

  const KB_OPTIONS: { id: KbSource; icon: string; label: string; desc: string }[] = [
    { id: 'url', icon: '🌐', label: 'Crawl Website', desc: 'Automatically extract knowledge from any URL' },
    { id: 'text', icon: '📝', label: 'Paste Text', desc: 'FAQs, product info, policies — paste anything' },
    { id: 'file', icon: '📎', label: 'Upload File', desc: 'PDF, DOCX, TXT, CSV — upload documents' },
    { id: 'database', icon: '🗄️', label: 'Connect Database', desc: 'Google Sheets, REST API, or any JSON endpoint' },
  ]

  const INDUSTRIES = ['E-Commerce', 'Real Estate', 'Healthcare', 'Education', 'Finance', 'Hospitality', 'Logistics', 'Technology', 'Retail', 'Other']

  if (done) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const scriptTag = createdBot?.id ? `<script src="${origin}/widget.js?v=7" data-ctx="${createdClientId}" data-bot="${createdBot.id}" defer></script>` : ''
    const managerUrl = createdBot?.id ? `${origin}/manage/${createdClientId}` : ''
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="max-w-xl w-full space-y-6">
          <div className="text-center">
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-4xl mx-auto mb-4">🚀</div>
            <h2 className="text-2xl font-bold text-white">Bot Created!</h2>
            <p className="text-gray-400 mt-2 text-sm">Your <strong className="text-white">{createdBot?.name || channel}</strong> bot is live and ready.</p>
          </div>

          {channel === 'website' && scriptTag && (
            <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">📎 Embed Script</h3>
              <p className="text-xs text-gray-500 mb-2">Add this to the <code className="text-purple-400">&lt;head&gt;</code> of the client's website:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#0a0a0a] border border-white/[0.06] rounded-xl px-4 py-3 text-xs text-emerald-400 font-mono truncate">
                  {scriptTag}
                </code>
                <button onClick={() => navigator.clipboard.writeText(scriptTag)} className="flex-shrink-0 px-3 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-gray-400 hover:text-white transition-colors">Copy</button>
              </div>
            </div>
          )}

          <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">🔗 Client Manager URL</h3>
            <p className="text-xs text-gray-500 mb-2">Share this link with the client to view their bot analytics:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[#0a0a0a] border border-white/[0.06] rounded-xl px-4 py-3 text-xs text-blue-400 font-mono truncate">{managerUrl}</code>
              <button onClick={() => navigator.clipboard.writeText(managerUrl)} className="flex-shrink-0 px-3 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-gray-400 hover:text-white transition-colors">Copy</button>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setStep(2); setChannel('website'); setBotName(''); setBotPurpose('support'); setDone(false); setCreatedBot(null) }}
              className="flex-1 py-3 border border-white/10 text-white rounded-xl text-sm hover:bg-white/5 transition-colors">
              + Add Another Bot
            </button>
            <button onClick={() => router.push(`/admin/client/${createdClientId}?tab=bots`)}
              className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium transition-colors">
              View Bots Dashboard →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => step > (existingClientId ? 2 : 1) ? setStep(s => s - 1) : router.push('/admin')}
            className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{existingClientId ? 'Add New Bot' : 'New Client Setup'}</h1>
            <div className="flex gap-1 mt-2">
              {[1, 2, 3, 4].filter(s => existingClientId ? s >= 2 : true).map(s => (
                <div key={s} className={`h-1 flex-1 rounded-full transition-all ${step >= s ? 'bg-purple-500' : 'bg-white/10'}`} />
              ))}
            </div>
          </div>
          <span className="text-xs text-gray-600 tabular-nums">Step {existingClientId ? step - 1 : step} of {existingClientId ? 3 : 4}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">

        {/* Step 1 — Company */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-bold">Set up the company</h2>
              <p className="text-gray-400 mt-1 text-sm">This is the client you're building bots for. Fill in the basics.</p>
            </div>
            <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Company Name <span className="text-red-400">*</span></label>
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Corp"
                    className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Contact Email</label>
                  <input value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} placeholder="client@email.com" type="email"
                    className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Industry</label>
                <select value={industry} onChange={e => setIndustry(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50">
                  <option value="">Select industry...</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Internal Notes</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Visible only to you"
                  className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
              </div>
            </div>
            <button onClick={() => { if (!companyName.trim()) { setError('Company name required'); return }; setError(''); setStep(2) }}
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-2xl transition-colors">
              Continue →
            </button>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          </div>
        )}

        {/* Step 2 — Channel */}
        {step === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-bold">Choose a channel</h2>
              <p className="text-gray-400 mt-1 text-sm">Where should this bot live? You can add more channels later.</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {CHANNELS.map(c => (
                <button key={c.id} onClick={() => setChannel(c.id)}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${channel === c.id ? 'border-purple-500 bg-purple-500/10' : 'border-white/[0.06] bg-[#111] hover:border-white/20'}`}>
                  <div className="text-3xl mb-3">{c.icon}</div>
                  <p className="text-sm font-semibold text-white">{c.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{c.desc}</p>
                </button>
              ))}
            </div>
            <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Bot Name <span className="text-red-400">*</span></label>
                  <input value={botName} onChange={e => setBotName(e.target.value)} placeholder={`e.g. "Support Bot"`}
                    className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Bot Purpose</label>
                  <select value={botPurpose} onChange={e => setBotPurpose(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50">
                    <option value="support">Customer Support</option>
                    <option value="sales">Sales & Lead Gen</option>
                    <option value="hr">HR & Onboarding</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Welcome Message</label>
                <input value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value)} placeholder="Hi! How can I help you today?"
                  className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
              </div>
              {channel === 'whatsapp' && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">WhatsApp Phone Number ID</label>
                    <input value={waPhoneId} onChange={e => setWaPhoneId(e.target.value)} placeholder="From Meta Business Manager"
                      className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Access Token</label>
                    <input value={waToken} onChange={e => setWaToken(e.target.value)} placeholder="Bearer token from Meta"
                      type="password"
                      className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50 font-mono" />
                  </div>
                </>
              )}
              {channel === 'email' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">Email Address</label>
                      <input value={emailAddr} onChange={e => setEmailAddr(e.target.value)} placeholder="support@yourcompany.com" type="email"
                        className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">From Name</label>
                      <input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="Acme Support"
                        className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1.5">SMTP Host</label>
                      <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com"
                        className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">Port</label>
                      <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587"
                        className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">SMTP Password</label>
                    <input value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="App password" type="password"
                      className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
                  </div>
                </>
              )}
            </div>
            <button onClick={() => { if (!botName.trim()) { setError('Bot name is required'); return }; setError(''); setStep(3) }}
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-2xl transition-colors">
              Continue →
            </button>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          </div>
        )}

        {/* Step 3 — Knowledge */}
        {step === 3 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-bold">Add knowledge</h2>
              <p className="text-gray-400 mt-1 text-sm">Pick one or more sources. The bot will use this to answer questions.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {KB_OPTIONS.map(o => (
                <button key={o.id} onClick={() => toggleKb(o.id)}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${kbSources.includes(o.id) ? 'border-purple-500 bg-purple-500/10' : 'border-white/[0.06] bg-[#111] hover:border-white/20'}`}>
                  <div className="text-2xl mb-2">{o.icon}</div>
                  <p className="text-sm font-semibold text-white">{o.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{o.desc}</p>
                </button>
              ))}
            </div>
            {kbSources.includes('url') && (
              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-semibold text-white">🌐 Website Crawl</h3>
                <div className="space-y-3">
                  {siteUrls.map((url, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={url} onChange={e => { const newUrls = [...siteUrls]; newUrls[i] = e.target.value; setSiteUrls(newUrls); }} placeholder="https://example.com"
                        className="flex-1 bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
                      {i === siteUrls.length - 1 && (
                        <button onClick={() => setSiteUrls([...siteUrls, ''])} className="px-4 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-xl transition-colors font-bold text-lg">+</button>
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs text-gray-500">Max Pages (Per URL)</label>
                    <span className="text-xs font-semibold text-white tabular-nums">{maxPages}</span>
                  </div>
                  <input type="range" min={5} max={200} step={5} value={maxPages} onChange={e => setMaxPages(Number(e.target.value))}
                    className="w-full accent-purple-500" />
                </div>
              </div>
            )}
            {kbSources.includes('text') && (
              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white mb-3">📝 Manual Text</h3>
                <div className="space-y-3">
                  {manualTexts.map((text, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <textarea value={text} onChange={e => { const newTexts = [...manualTexts]; newTexts[i] = e.target.value; setManualTexts(newTexts); }} rows={3}
                        placeholder="Paste FAQs, product info, policies, pricing..."
                        className="flex-1 bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none resize-none" />
                      {i === manualTexts.length - 1 && (
                        <button onClick={() => setManualTexts([...manualTexts, ''])} className="px-4 py-3 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-xl transition-colors font-bold text-lg h-[86px]">+</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {kbSources.includes('file') && (
              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white mb-3">📎 File Upload</h3>
                <input ref={kbFileRef} type="file" multiple accept=".pdf,.docx,.txt,.csv" onChange={e => setKbFiles(prev => [...prev, ...Array.from(e.target.files || [])])} className="hidden" />
                <div className="space-y-3 mb-4">
                  {kbFiles.map((file, i) => (
                    <div key={i} className="flex justify-between items-center bg-[#0a0a0a] border border-white/[0.08] px-4 py-3 rounded-xl text-sm">
                      <span className="text-white truncate max-w-[80%]">{file.name}</span>
                      <button onClick={() => setKbFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300">✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => kbFileRef.current?.click()}
                  className="w-full py-4 border-2 border-dashed border-white/[0.08] hover:border-purple-500/40 text-gray-400 hover:text-white rounded-xl text-sm transition-colors flex justify-center items-center gap-2">
                  <span className="text-lg font-bold text-purple-400">+</span> Choose PDF, DOCX, TXT or CSV
                </button>
              </div>
            )}
            {kbSources.includes('database') && (
              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white mb-3">🗄️ Database / API</h3>
                <div className="space-y-3">
                  {dbUrls.map((url, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={url} onChange={e => { const newUrls = [...dbUrls]; newUrls[i] = e.target.value; setDbUrls(newUrls); }} placeholder="https://docs.google.com/spreadsheets/... or REST API endpoint"
                        className="flex-1 bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
                      {i === dbUrls.length - 1 && (
                        <button onClick={() => setDbUrls([...dbUrls, ''])} className="px-4 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-xl transition-colors font-bold text-lg">+</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setStep(4)}
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-2xl transition-colors">
              Continue →
            </button>
            <button onClick={() => setStep(4)} className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors">
              Skip for now →
            </button>
          </div>
        )}

        {/* Step 4 — Contacts */}
        {step === 4 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-bold">Import contacts</h2>
              <p className="text-gray-400 mt-1 text-sm">Saved contacts can be used for outbound campaigns. You can always add more later.</p>
            </div>
            <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6 space-y-5">
              <div>
                <label className="block text-xs text-gray-500 mb-3">Upload CSV / Excel</label>
                <input ref={contactsFileRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => setContactsFile(e.target.files?.[0] || null)} className="hidden" />
                <button onClick={() => contactsFileRef.current?.click()}
                  className="w-full py-4 border-2 border-dashed border-white/[0.08] hover:border-purple-500/40 text-gray-400 hover:text-white rounded-xl text-sm transition-colors">
                  {contactsFile ? `📎 ${contactsFile.name}` : '+ Upload contacts file (CSV, XLSX)'}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-xs text-gray-600">or</span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Google Sheets / Spreadsheet URL</label>
                <input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50" />
              </div>
            </div>

            {error && <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl py-3 px-4">{error}</p>}

            <button onClick={handleFinish} disabled={submitting}
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-3">
              {submitting ? (
                <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Building Bot...</>
              ) : 'Launch Bot 🚀'}
            </button>
            <button onClick={handleFinish} disabled={submitting} className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors">
              Skip contacts & launch →
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
