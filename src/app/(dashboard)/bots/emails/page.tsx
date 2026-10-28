'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'

import React, { useState, useEffect, useCallback, useDeferredValue, useMemo } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { 
  Mail, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  Send, 
  RefreshCw, 
  Search, 
  Bot, 
  User, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Edit3, 
  MessageSquare,
  ShieldCheck,
  ArrowRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { fetchDashboardData, invalidateDashboardData, readDashboardData } from '@/lib/client/featureDataCache'

type EmailTab = 'draft_pending' | 'needs_human' | 'auto_replied' | 'spam' | 'all'

interface EmailSession {
  id: string
  session_id: string
  client_id: string
  bot_id: string
  contact_id: string | null
  visitor_name: string | null
  mode: string
  status: string
  email_status: 'draft_pending' | 'needs_human' | 'auto_replied' | 'spam' | null
  email_subject: string | null
  email_summary: string | null
  reply_summary: string | null
  draft_reply: string | null
  spam_reason: string | null
  created_at: string
  last_message_at: string
  contacts?: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
  } | null
  bots?: {
    id: string
    name: string | null
  } | null
}

interface ThreadMessage {
  id: string | number
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

export default function BotEmailsPage() {
  const [clientId] = useState(() => activeWorkspaceId('') || null)
  const [activeTab, setActiveTab] = useState<EmailTab>('draft_pending')
  const [sessions, setSessions] = useState<EmailSession[]>([])
  const [counts, setCounts] = useState({
    all: 0,
    draft_pending: 0,
    needs_human: 0,
    auto_replied: 0,
    spam: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [selectedBotId, setSelectedBotId] = useState('all')
  const [emailBots, setEmailBots] = useState<Array<{id:string,name:string,purpose?:string}>>([])

  // Expanded thread histories: sessionId -> ThreadMessage[]
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({})
  const [threadMessages, setThreadMessages] = useState<Record<string, ThreadMessage[]>>({})
  const [loadingThreads, setLoadingThreads] = useState<Record<string, boolean>>({})

  // Editable replies: sessionId -> string
  const [editedDrafts, setEditedDrafts] = useState<Record<string, string>>({})
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)

  // Action sending states: sessionId -> boolean
  const [submittingAction, setSubmittingAction] = useState<Record<string, boolean>>({})

  // The dashboard session already resolved the active workspace. Reusing it
  // avoids another Supabase client and a long-lived auth subscription here.
  useEffect(() => {
    if (!clientId) return
    const url = `/api/bots?client_id=${encodeURIComponent(clientId)}`
    const cached = readDashboardData<any[]>(url)
    if (cached) setEmailBots(cached)
    fetchDashboardData<any[]>(url).then(data => setEmailBots(Array.isArray(data) ? data : [])).catch(() => {})
  }, [clientId])

  // Fetch sessions
  const loadEmails = useCallback(async (showLoading = true, force = false) => {
    if (!clientId) return
    const botFilter = selectedBotId === 'all' ? '' : `&bot_id=${encodeURIComponent(selectedBotId)}`
    const url = `/api/bots/emails?client_id=${encodeURIComponent(clientId)}&status=${activeTab}${botFilter}`
    const cached = readDashboardData<{sessions:EmailSession[];counts:typeof counts}>(url)
    if (cached) {
      setSessions(cached.sessions || [])
      if (cached.counts) setCounts(cached.counts)
      setIsLoading(false)
    } else if (showLoading) setIsLoading(true)
    try {
      const data = await fetchDashboardData<{sessions:EmailSession[];counts:typeof counts}>(url, { force })
      setSessions(data.sessions || [])
      if (data.counts) {
        setCounts(data.counts)
      }
    } catch (err: any) {
      console.error('[loadEmails error]:', err)
      toast.error('Network error loading emails')
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [clientId, activeTab, selectedBotId])

  useEffect(() => {
    if (clientId) {
      loadEmails()
    }
  }, [clientId, activeTab, loadEmails])

  // Toggle thread view
  const toggleThread = async (sid: string) => {
    const nextState = !expandedThreads[sid]
    setExpandedThreads(prev => ({ ...prev, [sid]: nextState }))

    if (nextState && !threadMessages[sid]) {
      setLoadingThreads(prev => ({ ...prev, [sid]: true }))
      try {
        const data = await fetchDashboardData<ThreadMessage[]>(`/api/inbox/${sid}?action=messages`)
        setThreadMessages(prev => ({ ...prev, [sid]: data || [] }))
      } catch (e) {
        console.error('Failed to fetch thread messages:', e)
      } finally {
        setLoadingThreads(prev => ({ ...prev, [sid]: false }))
      }
    }
  }

  // Approve & Send draft reply
  const handleApproveDraft = async (session: EmailSession) => {
    const sid = session.session_id || session.id
    const replyToSend = editedDrafts[sid] !== undefined ? editedDrafts[sid] : (session.draft_reply || '')

    if (!replyToSend.trim()) {
      toast.error('Reply text cannot be empty')
      return
    }

    setSubmittingAction(prev => ({ ...prev, [sid]: true }))
    try {
      const res = await fetch('/api/bots/emails', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_draft',
          sessionId: sid,
          replyText: replyToSend,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Approved reply sent to customer via email!')
        // Optimistically remove from pending or update status
        setSessions(prev => prev.filter(s => (s.session_id || s.id) !== sid))
        setCounts(prev => ({
          ...prev,
          draft_pending: Math.max(0, prev.draft_pending - 1),
          auto_replied: prev.auto_replied + 1,
        }))
        invalidateDashboardData('/api/bots/emails')
      } else {
        toast.error(data.error || 'Failed to dispatch email reply')
      }
    } catch (e: any) {
      toast.error(e.message || 'Error approving email draft')
    } finally {
      setSubmittingAction(prev => ({ ...prev, [sid]: false }))
    }
  }

  // Send manual reply for Needs Human
  const handleSendManualReply = async (session: EmailSession) => {
    const sid = session.session_id || session.id
    const replyToSend = (editedDrafts[sid] || '').trim()

    if (!replyToSend) {
      toast.error('Please write a reply before sending')
      return
    }

    setSubmittingAction(prev => ({ ...prev, [sid]: true }))
    try {
      const res = await fetch('/api/bots/emails', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_reply',
          sessionId: sid,
          replyText: replyToSend,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Email reply successfully sent!')
        setSessions(prev => prev.filter(s => (s.session_id || s.id) !== sid))
        setCounts(prev => ({
          ...prev,
          needs_human: Math.max(0, prev.needs_human - 1),
          auto_replied: prev.auto_replied + 1,
        }))
        setEditedDrafts(prev => ({ ...prev, [sid]: '' }))
        invalidateDashboardData('/api/bots/emails')
      } else {
        toast.error(data.error || 'Failed to send reply')
      }
    } catch (e: any) {
      toast.error(e.message || 'Error sending reply')
    } finally {
      setSubmittingAction(prev => ({ ...prev, [sid]: false }))
    }
  }

  // Mark as spam
  const handleMarkSpam = async (session: EmailSession) => {
    const sid = session.session_id || session.id
    setSubmittingAction(prev => ({ ...prev, [sid]: true }))
    try {
      const res = await fetch('/api/bots/emails', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_spam',
          sessionId: sid,
          spamReason: 'Flagged as spam by support operator',
        }),
      })
      if (res.ok) {
        toast.success('Moved to Spam')
        setSessions(prev => prev.filter(s => (s.session_id || s.id) !== sid))
        setCounts(prev => ({
          ...prev,
          draft_pending: activeTab === 'draft_pending' ? Math.max(0, prev.draft_pending - 1) : prev.draft_pending,
          needs_human: activeTab === 'needs_human' ? Math.max(0, prev.needs_human - 1) : prev.needs_human,
          spam: prev.spam + 1,
        }))
        invalidateDashboardData('/api/bots/emails')
      }
    } catch (e) {
      toast.error('Failed to mark as spam')
    } finally {
      setSubmittingAction(prev => ({ ...prev, [sid]: false }))
    }
  }

  // Unmark spam
  const handleUnmarkSpam = async (session: EmailSession) => {
    const sid = session.session_id || session.id
    setSubmittingAction(prev => ({ ...prev, [sid]: true }))
    try {
      const res = await fetch('/api/bots/emails', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unmark_spam',
          sessionId: sid,
        }),
      })
      if (res.ok) {
        toast.success('Restored from Spam')
        setSessions(prev => prev.filter(s => (s.session_id || s.id) !== sid))
        setCounts(prev => ({
          ...prev,
          spam: Math.max(0, prev.spam - 1),
          draft_pending: session.draft_reply ? prev.draft_pending + 1 : prev.draft_pending,
          needs_human: !session.draft_reply ? prev.needs_human + 1 : prev.needs_human,
        }))
        invalidateDashboardData('/api/bots/emails')
      }
    } catch (e) {
      toast.error('Failed to restore from spam')
    } finally {
      setSubmittingAction(prev => ({ ...prev, [sid]: false }))
    }
  }

  // Filtered by search query
  const filteredSessions = useMemo(() => {
    if (!deferredSearchQuery.trim()) return sessions
    const q = deferredSearchQuery.toLowerCase()
    return sessions.filter(s => {
      const subj = (s.email_subject || '').toLowerCase()
      const name = (s.visitor_name || s.contacts?.name || '').toLowerCase()
      const email = (s.contacts?.email || '').toLowerCase()
      const summary = (s.email_summary || '').toLowerCase()
      const replySum = (s.reply_summary || '').toLowerCase()
      return subj.includes(q) || name.includes(q) || email.includes(q) || summary.includes(q) || replySum.includes(q)
    })
  }, [sessions, deferredSearchQuery])

  const tabs: Array<{ id: EmailTab; label: string; count: number; color?: string }> = [
    { id: 'draft_pending', label: 'Pending Approval', count: counts.draft_pending, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200' },
    { id: 'needs_human', label: 'Needs Human', count: counts.needs_human, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200' },
    { id: 'auto_replied', label: 'Auto-Replied', count: counts.auto_replied, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200' },
    { id: 'spam', label: 'Spam Filtered', count: counts.spam, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-200' },
    { id: 'all', label: 'All Emails', count: counts.all },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2.5">
            <Mail className="w-6 h-6 text-rose-500" />
            Email Inquiries &amp; Triage
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Review AI draft replies for complex business inquiries, monitor automated FAQ resolutions, and manage spam protection.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)} className="h-8 rounded-lg border border-surface-border bg-white px-3 text-xs font-medium text-ink">
            <option value="all">All email bots</option>
            {emailBots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}{bot.purpose ? ` · ${bot.purpose}` : ''}</option>)}
          </select>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => loadEmails(true, true)}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs font-medium"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-surface-muted border border-surface-border rounded-xl">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  isActive
                    ? "bg-surface text-ink shadow-xs border border-surface-border"
                    : "text-ink-secondary hover:text-ink hover:bg-surface/50"
                )}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[10px] font-bold border",
                    tab.color || "bg-surface-muted text-ink-muted border-surface-border"
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            placeholder="Search subject, email, or summary..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 text-xs h-9 bg-surface"
          />
        </div>
      </div>

      {/* Content Section */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-6 bg-surface border border-surface-border rounded-2xl animate-pulse space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-4 bg-surface-muted rounded w-1/4" />
                <div className="h-4 bg-surface-muted rounded w-20" />
              </div>
              <div className="h-3 bg-surface-muted rounded w-3/4" />
              <div className="h-16 bg-surface-muted rounded w-full" />
            </div>
          ))}
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-16 px-4 bg-surface border border-dashed border-surface-border rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-surface-muted flex items-center justify-center mx-auto text-ink-muted">
            <Mail className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-ink">No emails in {tabs.find(t => t.id === activeTab)?.label}</h3>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            {activeTab === 'draft_pending'
              ? 'Great job! There are currently no complex business inquiries awaiting your review.'
              : activeTab === 'spam'
              ? 'No spam emails detected. Your incoming email stream is clean!'
              : activeTab === 'needs_human'
              ? 'No emails requiring manual agent composition right now.'
              : 'Incoming customer emails to your connected bot addresses will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSessions.map(session => {
            const sid = session.session_id || session.id
            const isSubmitting = submittingAction[sid] || false
            const isThreadExpanded = expandedThreads[sid] || false
            const msgs = threadMessages[sid] || []
            const isThreadLoading = loadingThreads[sid] || false

            const currentDraft = editedDrafts[sid] !== undefined ? editedDrafts[sid] : (session.draft_reply || '')
            const isEditing = editingDraftId === sid

            const customerEmail = session.contacts?.email || session.visitor_name || 'Customer'
            const customerName = session.contacts?.name || session.visitor_name || customerEmail.split('@')[0]
            const subject = session.email_subject || 'No Subject'

            return (
              <div
                key={sid}
                className={cn(
                  "dashboard-card bg-surface border rounded-2xl p-5 transition-all shadow-xs space-y-4",
                  session.email_status === 'draft_pending'
                    ? "border-amber-500/30 hover:border-amber-500/50"
                    : session.email_status === 'spam'
                    ? "border-rose-500/20 bg-rose-500/[0.01]"
                    : "border-surface-border"
                )}
              >
                {/* Top Info Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-surface-muted border border-surface-border flex items-center justify-center text-xs font-bold text-ink uppercase">
                      {customerName.substring(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-ink">{customerName}</span>
                        <span className="text-xs text-ink-muted">&lt;{customerEmail}&gt;</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-ink-muted">
                        <span>Subject: <strong className="text-ink font-semibold">{subject}</strong></span>
                        <span>•</span>
                        <span>{new Date(session.last_message_at || session.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status & Bot Badges */}
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    {session.bots?.name && (
                      <Badge variant="outline" className="text-[11px] gap-1 font-medium bg-surface-muted text-ink-secondary">
                        <Bot className="w-3 h-3" />
                        {session.bots.name}
                      </Badge>
                    )}

                    {session.email_status === 'draft_pending' && (
                      <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[11px] font-semibold gap-1">
                        <Sparkles className="w-3 h-3" />
                        Pending Approval
                      </Badge>
                    )}

                    {session.email_status === 'auto_replied' && (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[11px] font-semibold gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Auto-Replied
                      </Badge>
                    )}

                    {session.email_status === 'needs_human' && (
                      <Badge className="bg-blue-500/10 text-blue-600 border border-blue-500/20 text-[11px] font-semibold gap-1">
                        <User className="w-3 h-3" />
                        Needs Human
                      </Badge>
                    )}

                    {session.email_status === 'spam' && (
                      <Badge className="bg-rose-500/10 text-rose-600 border border-rose-500/20 text-[11px] font-semibold gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        Spam
                      </Badge>
                    )}
                  </div>
                </div>

                {/* ── INTELLIGENT 1-LINER SUMMARIES (Core Requirement) ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* 1-line Customer Request Summary */}
                  {session.email_summary && (
                    <div className="p-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                        <Mail className="w-3 h-3" />
                        Customer Request (1-liner)
                      </div>
                      <p className="text-xs text-ink leading-relaxed font-medium">
                        {session.email_summary}
                      </p>
                    </div>
                  )}

                  {/* 1-line Proposed Reply Summary */}
                  {session.reply_summary && (
                    <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                        <Sparkles className="w-3 h-3" />
                        Proposed Reply (1-liner)
                      </div>
                      <p className="text-xs text-ink leading-relaxed font-medium">
                        {session.reply_summary}
                      </p>
                    </div>
                  )}

                  {/* Spam Reason */}
                  {session.email_status === 'spam' && session.spam_reason && (
                    <div className="col-span-full p-3 bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider">
                        <ShieldAlert className="w-3 h-3" />
                        Spam Filter Reason
                      </div>
                      <p className="text-xs text-ink leading-relaxed">
                        {session.spam_reason}
                      </p>
                    </div>
                  )}
                </div>

                {/* ── DRAFT REVIEW & 1-CLICK DISPATCH BOX (Pending Approval) ── */}
                {session.email_status === 'draft_pending' && session.draft_reply && (
                  <div className="p-4 bg-surface-muted/70 border border-surface-border rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-accent" />
                        Proposed Email Draft for Review
                      </span>
                      <button
                        onClick={() => setEditingDraftId(isEditing ? null : sid)}
                        className="text-xs text-accent font-semibold hover:underline"
                      >
                        {isEditing ? 'Done Editing' : 'Edit Draft'}
                      </button>
                    </div>

                    {isEditing ? (
                      <Textarea
                        value={currentDraft}
                        onChange={e => setEditedDrafts(prev => ({ ...prev, [sid]: e.target.value }))}
                        className="text-xs font-mono min-h-[120px] bg-surface"
                      />
                    ) : (
                      <div className="p-3 bg-surface border border-surface-border rounded-lg text-xs text-ink-secondary whitespace-pre-wrap font-sans leading-relaxed">
                        {currentDraft}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-surface-border">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveDraft(session)}
                          disabled={isSubmitting}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5"
                        >
                          {isSubmitting ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          Approve &amp; Send Email
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkSpam(session)}
                          disabled={isSubmitting}
                          className="text-xs text-ink-muted hover:text-rose-600"
                        >
                          Mark as Spam
                        </Button>
                      </div>

                      <button
                        onClick={() => toggleThread(sid)}
                        className="text-xs text-ink-secondary hover:text-ink font-medium flex items-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {isThreadExpanded ? 'Hide Thread History' : 'View Full Email Thread'}
                        {isThreadExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── NEEDS HUMAN COMPOSER BOX ── */}
                {session.email_status === 'needs_human' && (
                  <div className="p-4 bg-surface-muted/60 border border-surface-border rounded-xl space-y-3">
                    <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-blue-500" />
                      Compose Support Reply
                    </span>
                    <Textarea
                      placeholder="Write your email reply to the customer here..."
                      value={editedDrafts[sid] || ''}
                      onChange={e => setEditedDrafts(prev => ({ ...prev, [sid]: e.target.value }))}
                      className="text-xs min-h-[100px] bg-surface"
                    />
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-surface-border">
                      <Button
                        size="sm"
                        onClick={() => handleSendManualReply(session)}
                        disabled={isSubmitting || !(editedDrafts[sid] || '').trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5"
                      >
                        {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Send Email Reply
                      </Button>

                      <button
                        onClick={() => toggleThread(sid)}
                        className="text-xs text-ink-secondary hover:text-ink font-medium flex items-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {isThreadExpanded ? 'Hide Thread' : 'View Full Email Thread'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── SPAM ACTION BAR ── */}
                {session.email_status === 'spam' && (
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnmarkSpam(session)}
                      disabled={isSubmitting}
                      className="text-xs text-ink-secondary hover:text-ink gap-1.5"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Not Spam (Move to Review)
                    </Button>

                    <button
                      onClick={() => toggleThread(sid)}
                      className="text-xs text-ink-secondary hover:text-ink font-medium flex items-center gap-1"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {isThreadExpanded ? 'Hide Thread' : 'Inspect Raw Email'}
                    </button>
                  </div>
                )}

                {/* ── AUTO-REPLIED ACTION BAR ── */}
                {session.email_status === 'auto_replied' && (
                  <div className="flex items-center justify-between pt-1 text-xs text-ink-muted">
                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Email dispatched successfully to {customerEmail}
                    </span>

                    <button
                      onClick={() => toggleThread(sid)}
                      className="text-xs text-ink-secondary hover:text-ink font-medium flex items-center gap-1"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {isThreadExpanded ? 'Hide Thread History' : 'View Full Conversation'}
                    </button>
                  </div>
                )}

                {/* ── EXPANDED THREAD MESSAGES ── */}
                {isThreadExpanded && (
                  <div className="pt-3 border-t border-surface-border space-y-2.5 animate-in fade-in duration-150">
                    <h5 className="text-[11px] font-bold text-ink uppercase tracking-wider">
                      Thread History
                    </h5>

                    {isThreadLoading ? (
                      <div className="py-4 text-center text-xs text-ink-muted flex items-center justify-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Loading conversation history...
                      </div>
                    ) : msgs.length === 0 ? (
                      <p className="text-xs text-ink-muted py-2">No previous messages found in thread.</p>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {msgs.map((m, idx) => {
                          const isUser = m.role === 'user'
                          return (
                            <div
                              key={m.id || idx}
                              className={cn(
                                "p-3 rounded-xl text-xs space-y-1 border",
                                isUser
                                  ? "bg-surface-muted/70 border-surface-border text-ink"
                                  : "bg-accent/5 border-accent/20 text-ink"
                              )}
                            >
                              <div className="flex items-center justify-between text-[10px] text-ink-muted">
                                <span className="font-semibold capitalize">
                                  {isUser ? customerName : 'Bot / Support Reply'}
                                </span>
                                <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                              </div>
                              <p className="whitespace-pre-wrap leading-relaxed font-sans">
                                {m.content}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
