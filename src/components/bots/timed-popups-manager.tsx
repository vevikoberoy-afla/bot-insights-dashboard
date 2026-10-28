'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Clock, Plus, Trash2, Zap, Sparkles, MessageCircle, AlertCircle,
  Eye, Check, ChevronDown, ChevronUp, Copy, ExternalLink
} from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface TimedPopupItem {
  id: string
  message: string
  delay_seconds: number
  popup_style: 'callout' | 'banner' | 'modal'
  tag?: string
  cta_text?: string
  cta_url?: string
  auto_dismiss_seconds?: number
  enabled: boolean
}

interface TimedPopupsManagerProps {
  popups: TimedPopupItem[]
  onChange: (popups: TimedPopupItem[]) => void
  themeColor?: string
  botName?: string
  className?: string
}

export function TimedPopupsManager({
  popups,
  onChange,
  themeColor = '#7c3aed',
  botName = 'AI Assistant',
  className,
}: TimedPopupsManagerProps) {
  const [activePreviewId, setActivePreviewId] = useState<string | null>(popups[0]?.id || null)

  const handleAddPopup = (preset?: Partial<TimedPopupItem>) => {
    const nextDelay = popups.length > 0 
      ? Math.max(...popups.map(p => p.delay_seconds || 0)) + 20 
      : 15

    const newPopup: TimedPopupItem = {
      id: 'popup_' + Math.random().toString(36).substring(2, 9),
      message: preset?.message || 'Still looking around? Let me know if you have any questions!',
      delay_seconds: preset?.delay_seconds ?? nextDelay,
      popup_style: preset?.popup_style || 'callout',
      tag: preset?.tag || 'Help & Support',
      cta_text: preset?.cta_text || 'Chat with us',
      cta_url: preset?.cta_url || '',
      auto_dismiss_seconds: preset?.auto_dismiss_seconds ?? 0,
      enabled: true,
    }

    const updated = [...popups, newPopup].sort((a, b) => a.delay_seconds - b.delay_seconds)
    onChange(updated)
    setActivePreviewId(newPopup.id)
  }

  const handleUpdate = (id: string, updates: Partial<TimedPopupItem>) => {
    const updated = popups.map(p => (p.id === id ? { ...p, ...updates } : p))
    onChange(updated)
  }

  const handleDelete = (id: string) => {
    const updated = popups.filter(p => p.id !== id)
    onChange(updated)
    if (activePreviewId === id) {
      setActivePreviewId(updated[0]?.id || null)
    }
  }

  const handleAddChip = (id: string, chip: string) => {
    const item = popups.find(p => p.id === id)
    if (!item) return
    const newMsg = (item.message ? item.message + ' ' : '') + chip
    handleUpdate(id, { message: newMsg })
  }

  const activePreviewItem = popups.find(p => p.id === activePreviewId) || popups[0]

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="bg-white border border-surface-border rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 mt-0.5">
              <Clock className="w-5 h-5 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-ink text-base">Timed Follow-up Popups & Nudges</h3>
                <span className="text-[11px] font-semibold bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                  {popups.filter(p => p.enabled).length} Active
                </span>
              </div>
              <p className="text-xs text-ink-secondary mt-0.5 max-w-xl">
                Display sequential proactive popups after a visitor spends time on your site. Trigger nudges, offers, or guidance to increase conversions.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => handleAddPopup()}
            className="bg-accent text-white hover:bg-accent/90 shadow-sm shrink-0 h-8 text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Timed Popup
          </Button>
        </div>

        {/* Quick Templates if empty */}
        {popups.length === 0 && (
          <div className="mt-6 p-8 border border-dashed border-surface-border rounded-xl bg-surface-muted/30 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-accent" />
            </div>
            <h4 className="text-sm font-semibold text-ink mb-1">No timed popups configured yet</h4>
            <p className="text-xs text-ink-secondary max-w-md mx-auto mb-4">
              Engage visitors who hesitate or browse without clicking. Add follow-up messages that appear after 15s, 30s, or 60s.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddPopup({
                  delay_seconds: 15,
                  message: '👋 Finding everything okay? I can help you search or answer any questions!',
                  tag: 'Assistance',
                  cta_text: 'Ask a question'
                })}
                className="text-xs h-8 border-surface-border"
              >
                + Helpful Assistant (15s)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddPopup({
                  delay_seconds: 40,
                  message: '🎁 Here is an exclusive offer! Use code WELCOME10 for 10% off your first order.',
                  tag: 'Special Offer',
                  cta_text: 'Claim Discount'
                })}
                className="text-xs h-8 border-surface-border"
              >
                + Discount Offer (40s)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddPopup({
                  delay_seconds: 75,
                  message: 'Need help choosing the best plan or product? Chat with me for personalized recommendations!',
                  tag: 'Product Advisor',
                  cta_text: 'Get Advice'
                })}
                className="text-xs h-8 border-surface-border"
              >
                + Product Recommender (75s)
              </Button>
            </div>
          </div>
        )}
      </div>

      {popups.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: List of Popups */}
          <div className="lg:col-span-7 space-y-4">
            {popups.map((item, index) => {
              const isSelected = activePreviewId === item.id

              return (
                <div
                  key={item.id}
                  className={cn(
                    "bg-white border rounded-2xl p-4 md:p-5 transition-all shadow-sm",
                    isSelected ? "border-accent ring-1 ring-accent/30" : "border-surface-border hover:border-surface-border/80",
                    !item.enabled && "opacity-70 bg-surface-muted/20"
                  )}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-surface-border">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-surface-muted text-ink-secondary text-xs font-bold flex items-center justify-center border border-surface-border">
                        #{index + 1}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-ink">Trigger at</span>
                        <span className="text-xs font-mono font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                          {item.delay_seconds}s
                        </span>
                        <span className="text-[11px] text-ink-muted">({item.popup_style})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-ink-muted">Active</span>
                        <Switch
                          checked={item.enabled}
                          onCheckedChange={v => handleUpdate(item.id, { enabled: v })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setActivePreviewId(item.id)}
                        className={cn("h-7 px-2 text-xs", isSelected ? "text-accent bg-accent/10" : "text-ink-muted hover:text-ink")}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> Preview
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.id)}
                        className="h-7 w-7 text-ink-muted hover:text-red-600"
                        aria-label="Delete popup"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="pt-3.5 space-y-4">
                    {/* Delay & Style Selectors */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-ink-secondary flex items-center gap-1">
                          <Clock className="w-3 h-3 text-ink-muted" /> Display Delay (Seconds)
                        </Label>
                        <div className="flex gap-1.5">
                          <Input
                            type="number"
                            min={1}
                            max={600}
                            value={item.delay_seconds}
                            onChange={e => handleUpdate(item.id, { delay_seconds: parseInt(e.target.value, 10) || 0 })}
                            className="h-8 text-xs font-mono bg-surface"
                          />
                          {[15, 30, 60].map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => handleUpdate(item.id, { delay_seconds: s })}
                              className={cn(
                                "text-[10px] font-mono px-2 py-1 rounded border transition-colors",
                                item.delay_seconds === s 
                                  ? "bg-accent text-white border-accent" 
                                  : "bg-surface-muted text-ink-secondary border-surface-border hover:bg-surface-border"
                              )}
                            >
                              {s}s
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-ink-secondary">Popup Format</Label>
                        <Select
                          value={item.popup_style}
                          onValueChange={(val: 'callout' | 'banner' | 'modal') => handleUpdate(item.id, { popup_style: val })}
                        >
                          <SelectTrigger className="h-8 text-xs bg-surface"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="callout">💬 Floating Callout Bubble</SelectItem>
                            <SelectItem value="banner">📢 Top Sticky Banner</SelectItem>
                            <SelectItem value="modal">🪟 Centered Lightbox Modal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Message */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-ink-secondary">Popup Message Content</Label>
                      <Textarea
                        rows={2}
                        value={item.message}
                        onChange={e => handleUpdate(item.id, { message: e.target.value })}
                        className="text-xs bg-surface resize-none"
                        placeholder="Type the message that pops up on screen..."
                      />
                      <div className="flex gap-1.5 flex-wrap pt-0.5">
                        {['{{store_name}}', '{{customer_name}}', '{{cart_value}}'].map(chip => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => handleAddChip(item.id, chip)}
                            className="text-[10px] font-mono bg-surface-muted text-ink-secondary px-1.5 py-0.5 rounded border border-surface-border hover:bg-surface-border transition-colors"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Optional Tag, CTA Button & Auto-dismiss */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-ink-secondary">Badge Tag (Optional)</Label>
                        <Input
                          value={item.tag || ''}
                          onChange={e => handleUpdate(item.id, { tag: e.target.value })}
                          placeholder="e.g. Special Offer"
                          className="h-7 text-xs bg-surface"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-ink-secondary">Button CTA Text</Label>
                        <Input
                          value={item.cta_text || ''}
                          onChange={e => handleUpdate(item.id, { cta_text: e.target.value })}
                          placeholder="e.g. Chat with us"
                          className="h-7 text-xs bg-surface"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-ink-secondary">Auto-Dismiss</Label>
                        <Select
                          value={String(item.auto_dismiss_seconds ?? 0)}
                          onValueChange={v => handleUpdate(item.id, { auto_dismiss_seconds: parseInt(v, 10) })}
                        >
                          <SelectTrigger className="h-7 text-[11px] bg-surface"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Stay until dismissed</SelectItem>
                            <SelectItem value="6">Dismiss after 6s</SelectItem>
                            <SelectItem value="10">Dismiss after 10s</SelectItem>
                            <SelectItem value="15">Dismiss after 15s</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAddPopup()}
              className="w-full border-dashed border-surface-border text-ink-secondary hover:text-ink hover:border-accent h-9 text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Another Timed Popup Message
            </Button>
          </div>

          {/* Right Column: Live Mockup Preview */}
          <div className="lg:col-span-5">
            <div className="bg-white border border-surface-border rounded-2xl p-5 shadow-sm sticky top-8 space-y-4">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-accent" />
                  <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Live Popup Preview</h4>
                </div>
                {activePreviewItem && (
                  <span className="text-[10px] font-mono text-ink-secondary bg-surface-muted px-2 py-0.5 rounded-full border border-surface-border">
                    {activePreviewItem.popup_style.toUpperCase()} @ {activePreviewItem.delay_seconds}s
                  </span>
                )}
              </div>

              {activePreviewItem ? (
                <div className="space-y-3">
                  {/* Visual Simulation Canvas */}
                  <div className="p-4 bg-[#09090b] rounded-xl relative overflow-hidden min-h-[220px] flex flex-col justify-end items-end border border-white/10 shadow-inner">
                    {/* Simulated website background elements */}
                    <div className="absolute top-3 left-3 flex gap-1.5 opacity-30">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                    </div>
                    <div className="absolute top-8 left-3 right-3 space-y-1 opacity-20">
                      <div className="h-2 w-1/3 bg-white rounded"></div>
                      <div className="h-2 w-2/3 bg-white rounded"></div>
                    </div>

                    {/* Rendering based on active style */}
                    {activePreviewItem.popup_style === 'callout' && (
                      <div className="flex flex-col items-end gap-2 w-full max-w-[280px] z-10 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-[#18181b] border border-white/15 text-white p-3.5 rounded-2xl w-full shadow-2xl relative text-left">
                          {/* Close X */}
                          <div className="absolute top-2.5 right-2.5 text-zinc-400 text-xs">✕</div>
                          {/* Tag */}
                          {activePreviewItem.tag && (
                            <div className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1.5 mb-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              {activePreviewItem.tag}
                            </div>
                          )}
                          {/* Message */}
                          <p className="text-xs text-zinc-100 leading-relaxed pr-3">
                            {activePreviewItem.message || 'Popup message will appear here...'}
                          </p>
                          {/* CTA */}
                          {activePreviewItem.cta_text && (
                            <div 
                              className="mt-2.5 text-[11px] font-semibold text-white px-3 py-1.5 rounded-lg text-center shadow-sm cursor-pointer"
                              style={{ backgroundColor: themeColor }}
                            >
                              {activePreviewItem.cta_text}
                            </div>
                          )}
                          {/* Tail */}
                          <div className="absolute -bottom-1.5 right-4 w-3 h-3 bg-[#18181b] border-r border-b border-white/15 transform rotate-45"></div>
                        </div>

                        {/* Widget Launcher Bubble */}
                        <div 
                          className="w-11 h-11 rounded-full flex items-center justify-center text-white shadow-lg relative cursor-pointer"
                          style={{ backgroundColor: themeColor }}
                        >
                          <MessageCircle className="w-5 h-5" />
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                            1
                          </span>
                        </div>
                      </div>
                    )}

                    {activePreviewItem.popup_style === 'banner' && (
                      <div className="w-full z-10 animate-in fade-in slide-in-from-top-2 duration-200 self-stretch my-auto">
                        <div className="bg-[#18181b] border border-white/20 text-white px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 shadow-xl">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-sm">📢</span>
                            <span className="text-xs text-zinc-100 truncate">{activePreviewItem.message}</span>
                          </div>
                          {activePreviewItem.cta_text && (
                            <div 
                              className="text-[10px] font-bold text-white px-2.5 py-1 rounded shadow-sm shrink-0"
                              style={{ backgroundColor: themeColor }}
                            >
                              {activePreviewItem.cta_text}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {activePreviewItem.popup_style === 'modal' && (
                      <div className="w-full z-10 animate-in fade-in zoom-in-95 duration-200 self-stretch my-auto">
                        <div className="bg-[#18181b] border border-white/20 text-white p-4 rounded-xl shadow-2xl text-center space-y-2">
                          {activePreviewItem.tag && (
                            <div className="text-[10px] font-bold uppercase tracking-wider text-accent">
                              {activePreviewItem.tag}
                            </div>
                          )}
                          <p className="text-xs text-zinc-100">{activePreviewItem.message}</p>
                          {activePreviewItem.cta_text && (
                            <div 
                              className="text-xs font-semibold text-white py-1.5 px-4 rounded-lg shadow-sm inline-block"
                              style={{ backgroundColor: themeColor }}
                            >
                              {activePreviewItem.cta_text}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-surface-muted/50 rounded-xl border border-surface-border text-[11px] text-ink-secondary space-y-1">
                    <p className="font-semibold text-ink flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-accent" /> Sequential Execution Note:
                    </p>
                    <p>
                      When a visitor browses the page without opening the chat, popups will trigger in chronological order according to their delay. If the visitor opens the chatbot, popups automatically pause so conversation is not interrupted.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-xs text-ink-muted">
                  Add a timed popup to preview its behavior.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
