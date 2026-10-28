'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { 
  HelpCircle, Plus, Search, Trash2, Edit2, Check, X, 
  ShieldCheck, Globe, Bot, Zap, RefreshCw, AlertCircle,
  FileCheck, ArrowRight
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export type ManualQAPair = {
  id: string
  client_id: string
  bot_id: string | null
  question: string
  answer: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface FaqOverridesTabProps {
  botId: string
  clientId?: string
}

export function FaqOverridesTab({ botId, clientId }: FaqOverridesTabProps) {
  const [pairs, setPairs] = useState<ManualQAPair[]>([])
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form State
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [scope, setScope] = useState<'bot' | 'global'>('bot')

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'bot' | 'global'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Edit in Place State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    question: string
    answer: string
    scope: 'bot' | 'global'
    is_active: boolean
  }>({ question: '', answer: '', scope: 'bot', is_active: true })
  const [isUpdating, setIsUpdating] = useState(false)

  // Load FAQ Pairs
  async function loadPairs() {
    if (!clientId && !botId) return
    setLoading(true)
    try {
      const queryParams = new URLSearchParams()
      if (clientId) queryParams.set('client_id', clientId)
      if (botId) queryParams.set('bot_id', botId)
      queryParams.set('include_global', 'true')

      const res = await fetch(`/api/manual-qa?${queryParams.toString()}`)
      const data = await res.json()
      if (res.ok) {
        setPairs(data.qa_pairs || [])
      } else {
        toast.error(data.error || 'Failed to load FAQ overrides')
      }
    } catch (err) {
      toast.error('Network error loading FAQ overrides')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPairs()
  }, [botId, clientId])

  // Create FAQ Pair
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) {
      toast.error('Client ID is missing. Please refresh the page.')
      return
    }
    if (!question.trim()) {
      toast.error('Please enter a question')
      return
    }
    if (!answer.trim()) {
      toast.error('Please enter an authoritative answer')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/manual-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          bot_id: scope === 'bot' ? botId : null,
          question: question.trim(),
          answer: answer.trim(),
          is_active: true,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success('Manual FAQ Override created & cached!')
        setQuestion('')
        setAnswer('')
        setScope('bot')
        setPairs(prev => [data.qa_pair, ...prev])
      } else {
        toast.error(data.error || 'Failed to create FAQ override')
      }
    } catch (err) {
      toast.error('Network error saving FAQ override')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Toggle active status
  async function handleToggleActive(pair: ManualQAPair) {
    const updatedStatus = !pair.is_active
    setPairs(prev => prev.map(p => (p.id === pair.id ? { ...p, is_active: updatedStatus } : p)))

    try {
      const res = await fetch('/api/manual-qa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pair.id,
          is_active: updatedStatus,
        }),
      })
      if (!res.ok) {
        // revert on failure
        setPairs(prev => prev.map(p => (p.id === pair.id ? { ...p, is_active: pair.is_active } : p)))
        toast.error('Failed to update status')
      } else {
        toast.success(updatedStatus ? 'Override enabled' : 'Override paused')
      }
    } catch {
      setPairs(prev => prev.map(p => (p.id === pair.id ? { ...p, is_active: pair.is_active } : p)))
      toast.error('Network error updating status')
    }
  }

  // Start Editing
  function startEditing(pair: ManualQAPair) {
    setEditingId(pair.id)
    setEditForm({
      question: pair.question,
      answer: pair.answer,
      scope: pair.bot_id ? 'bot' : 'global',
      is_active: pair.is_active,
    })
  }

  // Save Edit
  async function handleSaveEdit(id: string) {
    if (!editForm.question.trim() || !editForm.answer.trim()) {
      toast.error('Question and Answer cannot be empty')
      return
    }

    setIsUpdating(true)
    try {
      const res = await fetch('/api/manual-qa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          question: editForm.question.trim(),
          answer: editForm.answer.trim(),
          bot_id: editForm.scope === 'bot' ? botId : null,
          is_active: editForm.is_active,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success('FAQ override updated & cache invalidated!')
        setPairs(prev => prev.map(p => (p.id === id ? data.qa_pair : p)))
        setEditingId(null)
      } else {
        toast.error(data.error || 'Failed to update FAQ override')
      }
    } catch {
      toast.error('Network error updating FAQ override')
    } finally {
      setIsUpdating(false)
    }
  }

  // Delete Pair
  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this FAQ override? Any cached responses will also be purged.')) {
      return
    }

    try {
      const res = await fetch(`/api/manual-qa?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('FAQ override deleted')
        setPairs(prev => prev.filter(p => p.id !== id))
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete FAQ override')
      }
    } catch {
      toast.error('Network error deleting FAQ override')
    }
  }

  // Filtered List
  const filteredPairs = useMemo(() => {
    return pairs.filter(p => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        p.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.answer.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesScope =
        scopeFilter === 'all' ||
        (scopeFilter === 'bot' && p.bot_id !== null) ||
        (scopeFilter === 'global' && p.bot_id === null)

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && p.is_active) ||
        (statusFilter === 'inactive' && !p.is_active)

      return matchesSearch && matchesScope && matchesStatus
    })
  }, [pairs, searchQuery, scopeFilter, statusFilter])

  // Stats
  const activeCount = pairs.filter(p => p.is_active).length
  const botCount = pairs.filter(p => p.bot_id !== null).length
  const globalCount = pairs.filter(p => p.bot_id === null).length

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
      {/* Header Banner */}
      <div className="border-b border-surface-border pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-ink">Manual FAQ Overrides</h2>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" /> Guaranteed Correctness
            </span>
          </div>
          <p className="text-sm text-ink-secondary mt-1 max-w-3xl">
            Authoritative, verbatim answers for pricing, legal policy, guarantees, and exact FAQs.
            When a visitor asks a matching question, the stored answer is delivered <strong>verbatim without LLM paraphrasing</strong> in <strong>&lt;10ms</strong> with zero token cost.
          </p>
        </div>

        {/* Action / Refresh */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={loadPairs}
            disabled={loading}
            className="h-8 text-xs border-surface-border hover:bg-surface-muted transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-surface-muted/40 border border-surface-border rounded-xl">
          <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Total Overrides</p>
          <p className="text-xl font-bold text-ink mt-0.5">{pairs.length}</p>
        </div>
        <div className="p-3.5 bg-emerald-50/50 border border-emerald-200/60 rounded-xl">
          <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Active & Serving</p>
          <p className="text-xl font-bold text-emerald-700 mt-0.5">{activeCount}</p>
        </div>
        <div className="p-3.5 bg-purple-50/50 border border-purple-200/60 rounded-xl">
          <p className="text-[11px] font-semibold text-purple-800 uppercase tracking-wider">This Bot Only</p>
          <p className="text-xl font-bold text-purple-700 mt-0.5">{botCount}</p>
        </div>
        <div className="p-3.5 bg-blue-50/50 border border-blue-200/60 rounded-xl">
          <p className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">Global (All Bots)</p>
          <p className="text-xl font-bold text-blue-700 mt-0.5">{globalCount}</p>
        </div>
      </div>

      {/* Creation Card */}
      <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border bg-gradient-to-r from-accent/5 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
              <Plus className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-ink">Add Authoritative Q&A Pair</h3>
              <p className="text-[11px] text-ink-muted">Saved answers bypass the LLM and return instantly via SSE streaming.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleCreate} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Question Field */}
            <div className="md:col-span-8 space-y-1.5">
              <Label className="text-xs font-semibold text-ink flex items-center justify-between">
                <span>Customer Question (Exact or Semantic)</span>
                <span className="text-[10px] text-ink-muted font-normal">Matched at &ge;0.95 similarity</span>
              </Label>
              <Input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="e.g. What is your return policy?"
                className="h-9 text-xs bg-surface shadow-xs"
                disabled={isSubmitting}
              />
            </div>

            {/* Scope Field */}
            <div className="md:col-span-4 space-y-1.5">
              <Label className="text-xs font-semibold text-ink">Override Scope</Label>
              <Select
                value={scope}
                onValueChange={(val: 'bot' | 'global') => setScope(val)}
                disabled={isSubmitting}
              >
                <SelectTrigger className="h-9 text-xs bg-surface shadow-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bot">This Bot Only (Scoped)</SelectItem>
                  <SelectItem value="global">All Bots for Client (Global)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Answer Field */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-ink flex items-center justify-between">
              <span>Authoritative Answer (Returned 100% Verbatim)</span>
              <span className="text-[10px] text-accent font-medium">Never rephrased or summarized</span>
            </Label>
            <Textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              rows={3}
              placeholder="e.g. We offer a full 30-day money-back guarantee with free prepaid return shipping labels for all unused items."
              className="text-xs bg-surface shadow-xs resize-y"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-ink-muted flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-500" /> Vector embeddings & cache invalidation happen automatically on save.
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !question.trim() || !answer.trim()}
              className="bg-ink hover:bg-ink-secondary text-white text-xs h-8 px-4 font-medium shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add FAQ Override
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-surface-muted/30 p-2.5 rounded-xl border border-surface-border">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search questions or answers..."
            className="pl-8 h-8 text-xs bg-white shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Select
            value={scopeFilter}
            onValueChange={(v: 'all' | 'bot' | 'global') => setScopeFilter(v)}
          >
            <SelectTrigger className="h-8 text-xs bg-white w-32 shadow-xs">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scopes</SelectItem>
              <SelectItem value="bot">This Bot Only</SelectItem>
              <SelectItem value="global">Global Only</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(v: 'all' | 'active' | 'inactive') => setStatusFilter(v)}
          >
            <SelectTrigger className="h-8 text-xs bg-white w-28 shadow-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="inactive">Paused Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List of Existing Pairs */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-ink-muted flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-accent" />
            <p className="text-xs">Loading FAQ overrides...</p>
          </div>
        ) : filteredPairs.length === 0 ? (
          <div className="p-12 text-center bg-white border border-dashed border-surface-border rounded-2xl flex flex-col items-center justify-center">
            <FileCheck className="w-10 h-10 text-ink-muted/40 mb-2" />
            <h4 className="text-sm font-semibold text-ink">No FAQ overrides found</h4>
            <p className="text-xs text-ink-muted max-w-sm mt-1">
              {searchQuery || scopeFilter !== 'all' || statusFilter !== 'all'
                ? 'No overrides match your filter criteria. Try resetting filters.'
                : 'Add common pricing, support, or legal questions above to give visitors instant, authoritative answers.'}
            </p>
          </div>
        ) : (
          filteredPairs.map(pair => {
            const isEditing = editingId === pair.id

            if (isEditing) {
              return (
                <div
                  key={pair.id}
                  className="p-5 bg-white border-2 border-accent/40 rounded-2xl shadow-sm space-y-4 animate-in fade-in duration-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <Edit2 className="w-3.5 h-3.5 text-accent" /> Edit Override
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-muted">Active:</span>
                      <Switch
                        checked={editForm.is_active}
                        onCheckedChange={val => setEditForm({ ...editForm, is_active: val })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-8 space-y-1">
                      <Label className="text-[11px] font-semibold">Question</Label>
                      <Input
                        value={editForm.question}
                        onChange={e => setEditForm({ ...editForm, question: e.target.value })}
                        className="h-8 text-xs bg-surface"
                      />
                    </div>
                    <div className="md:col-span-4 space-y-1">
                      <Label className="text-[11px] font-semibold">Scope</Label>
                      <Select
                        value={editForm.scope}
                        onValueChange={(val: 'bot' | 'global') => setEditForm({ ...editForm, scope: val })}
                      >
                        <SelectTrigger className="h-8 text-xs bg-surface">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bot">This Bot Only</SelectItem>
                          <SelectItem value="global">All Bots (Global)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Authoritative Answer</Label>
                    <Textarea
                      value={editForm.answer}
                      onChange={e => setEditForm({ ...editForm, answer: e.target.value })}
                      rows={3}
                      className="text-xs bg-surface"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-surface-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                      disabled={isUpdating}
                      className="h-8 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(pair.id)}
                      disabled={isUpdating}
                      className="bg-accent text-white hover:bg-accent/90 h-8 text-xs px-4"
                    >
                      {isUpdating ? 'Saving...' : 'Save & Invalidate Cache'}
                    </Button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={pair.id}
                className={cn(
                  "p-4 bg-white border rounded-2xl shadow-xs transition-all hover:border-surface-border/80 flex flex-col md:flex-row md:items-start justify-between gap-4 group",
                  pair.is_active ? "border-surface-border" : "border-surface-border/50 opacity-70 bg-surface-muted/20"
                )}
              >
                <div className="space-y-2 flex-1">
                  {/* Top Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    {pair.bot_id ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md">
                        <Bot className="w-3 h-3" /> Bot Specific
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md">
                        <Globe className="w-3 h-3" /> Global Override
                      </span>
                    )}

                    <span className="text-[10px] text-ink-muted">
                      Updated {new Date(pair.updated_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Question */}
                  <h4 className="text-sm font-bold text-ink leading-snug">
                    {pair.question}
                  </h4>

                  {/* Answer */}
                  <p className="text-xs text-ink-secondary bg-surface-muted/40 p-3 rounded-xl border border-surface-border/60 whitespace-pre-wrap leading-relaxed">
                    {pair.answer}
                  </p>
                </div>

                {/* Right Actions */}
                <div className="flex md:flex-col items-center md:items-end justify-between md:justify-start gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-surface-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-ink-muted">
                      {pair.is_active ? 'Active' : 'Paused'}
                    </span>
                    <Switch
                      checked={pair.is_active}
                      onCheckedChange={() => handleToggleActive(pair)}
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditing(pair)}
                      className="h-7 w-7 p-0 text-ink-muted hover:text-ink hover:bg-surface-muted"
                      title="Edit pair"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(pair.id)}
                      className="h-7 w-7 p-0 text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Delete pair"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
