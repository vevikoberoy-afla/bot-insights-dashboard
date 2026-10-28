'use client'

import React from 'react'
import { FlowMessage, type StructuredMessage } from './FlowMessage'

export interface DashboardFlowCardProps {
  message: {
    id?: string
    role?: string
    content?: string
    message_type?: string | null
    metadata?: any
    created_at?: string
    type?: string
    payload?: any
    source_url?: string | null
  }
  nextMessage?: {
    id?: string
    role?: string
    content?: string
  }
  botId?: string
  contextId?: string
  sessionId?: string
  className?: string
}

/**
 * Determines whether a message contains or represents a rich flow UI component
 * that was displayed to the customer in the web chatbot.
 */
export function isFlowCard(msg: any): boolean {
  if (!msg) return false

  const type = msg.message_type || msg.metadata?.type || msg.type
  if (type && type !== 'chat' && type !== 'text') {
    return true
  }

  const payload = msg.metadata?.payload || msg.payload
  if (payload && typeof payload === 'object' && Object.keys(payload).length > 0) {
    return true
  }

  if (msg.metadata?.flowId) {
    return true
  }

  // Detect fallback structured text (e.g. numbered choices from historical flow responses)
  if (typeof msg.content === 'string') {
    const lines = msg.content.trim().split('\n').map((l: string) => l.trim()).filter(Boolean)
    const numbered = lines.filter((l: string) => /^\d+\.\s+/.test(l))
    if (numbered.length >= 2) {
      return true
    }
  }

  return false
}

/**
 * Normalizes a message (from Postgres, Redis, or API) into a StructuredMessage
 * for FlowMessage rendering, resolving customer selections and locked states.
 */
export function toStructuredMessage(msg: any, nextUserMsg?: any): StructuredMessage {
  const meta = msg.metadata || {}
  const rawPayload = meta.payload || msg.payload || {}
  let type = (msg.message_type || meta.type || msg.type || 'text') as string
  let payload = { ...rawPayload }

  let selectedValue = meta.selectedValue ?? msg.selectedValue ?? payload.selectedValue
  let selectedLabel = meta.selectedLabel ?? msg.selectedLabel ?? payload.selectedLabel

  // If this is a historical plain text message with numbered options, synthesize a quick_replies card
  if ((type === 'chat' || type === 'text') && typeof msg.content === 'string') {
    const lines = msg.content.trim().split('\n').map((l: string) => l.trim()).filter(Boolean)
    const numbered = lines.filter((l: string) => /^\d+\.\s+/.test(l))
    if (numbered.length >= 2) {
      type = 'quick_replies'
      const title = lines.find((l: string) => !/^\d+\.\s+/.test(l)) || 'Please choose an option:'
      const choices = numbered.map((l: string) => l.replace(/^\d+\.\s+/, '').trim())
      payload = { title, choices, ...payload }
    }
  }

  // If the user's next message corresponds to an answer for this card, infer the selection
  if ((selectedValue == null || selectedValue === '') && nextUserMsg && nextUserMsg.role === 'user' && typeof nextUserMsg.content === 'string') {
    const userAns = nextUserMsg.content.trim()

    // 1. Check against choices (for quick_replies / choice_chips)
    if (payload.choices || payload.options) {
      const choices = payload.choices || payload.options || []
      const match = choices.find((c: any) => {
        const str = typeof c === 'string' ? c : c.label || c.value
        return str && (str.toLowerCase() === userAns.toLowerCase() || userAns.toLowerCase().includes(str.toLowerCase()))
      })
      if (match) {
        selectedValue = typeof match === 'string' ? match : (match.value || match.label)
        selectedLabel = typeof match === 'string' ? match : (match.label || match.value)
      } else if (/^\d+$/.test(userAns)) {
        const idx = parseInt(userAns, 10) - 1
        if (choices[idx]) {
          const matchNum = choices[idx]
          selectedValue = typeof matchNum === 'string' ? matchNum : (matchNum.value || matchNum.label)
          selectedLabel = typeof matchNum === 'string' ? matchNum : (matchNum.label || matchNum.value)
        }
      }
    }

    // 2. Check against services / staff / branches
    const pickerItems = payload.services || payload.staff || payload.branches || []
    if (pickerItems.length > 0) {
      const itemMatch = pickerItems.find((item: any) => {
        const name = (item.name || item.label || '').toLowerCase()
        return name && (name === userAns.toLowerCase() || userAns.toLowerCase().includes(name))
      })
      if (itemMatch) {
        selectedValue = itemMatch.value || itemMatch.id
        selectedLabel = itemMatch.label || itemMatch.name
      }
    }

    // 3. Fallback to raw user text if not resolved
    if (!selectedValue && (type === 'quick_replies' || type === 'branch_picker' || type === 'service_picker')) {
      selectedValue = userAns
      selectedLabel = userAns
    }
  }

  return {
    id: String(msg.id || `card-${Date.now()}`),
    role: 'assistant',
    content: msg.content || payload.title || payload.text || '',
    type,
    flowId: meta.flowId || msg.flowId || payload.flowId || 'flow',
    stepId: meta.stepId || msg.stepId || payload.stepId || 'step',
    interactive: false,
    payload,
    created_at: msg.created_at || new Date().toISOString(),
    locked: true,
    selectedValue,
    selectedLabel,
  }
}

export function DashboardFlowCard({
  message,
  nextMessage,
  botId = '',
  contextId = '',
  sessionId = '',
  className = '',
}: DashboardFlowCardProps) {
  const structured = toStructuredMessage(message, nextMessage)

  return (
    <div className={`dashboard-flow-card w-full max-w-[360px] text-left transition-all ${className}`}>
      <FlowMessage
        message={structured}
        disabled={true}
        apiBase=""
        botId={botId}
        contextId={contextId}
        sessionId={sessionId}
        onInput={() => {}}
      />
    </div>
  )
}
