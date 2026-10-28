'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  Sparkles,
  Paperclip,
  UploadCloud,
  X,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Heading2,
  Link2,
  Eye,
  Edit3,
  ShieldAlert,
  ShieldCheck,
  User,
  UserPlus,
  AlertCircle,
  Clock,
  Calendar,
  Tag as TagIcon,
  Users,
  Building,
  HelpCircle,
  FileText,
  File,
  Image as ImageIcon,
  Trash2,
  ChevronDown,
  ChevronRight,
  Lock,
  Plus,
  ExternalLink,
  RefreshCw,
  Send,
  Star,
  Globe,
  MessageSquare,
  Mail,
  Smartphone,
  Cpu,
  BookmarkCheck,
  Ticket
} from 'lucide-react'
import { toast } from 'sonner'
import { format, addHours, addDays, isPast } from 'date-fns'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { invalidateAllTicketsCache, getStoredClientId } from '@/lib/tickets-cache'

// Sub-categories mapped to Categories
const SUB_CATEGORIES: Record<string, string[]> = {
  order_issue: [
    'Item Missing from Package',
    'Wrong Item Shipped',
    'Delayed Delivery / In Transit',
    'Tracking Not Updating',
    'Damaged / Broken in Transit',
    'Package Marked Delivered but Not Received'
  ],
  refund: [
    'Duplicate / Double Charge',
    'Returned Item Refund Pending',
    'Order Cancelled Refund',
    'Discount / Coupon Not Applied',
    'Store Credit Issue'
  ],
  return: [
    'Size or Fit Issue',
    'Defective / Non-Functional Product',
    'Color / Style Discrepancy',
    'Changed Mind / Buyer Remorse',
    'Warranty Claim'
  ],
  technical: [
    'Website / App Glitch',
    'Account Login / OTP Issue',
    'Checkout / Gateway Failure',
    'Cart Sync Error',
    'API / Integration Issue'
  ],
  complaint: [
    'Staff / Agent Conduct',
    'Billing Overcharge Dispute',
    'Service Level Delay',
    'Policy Clarification'
  ],
  general: [
    'Product Specifications Inquiry',
    'Bulk / Wholesale Order',
    'Shipping Policy / International',
    'Partnership / Other'
  ]
}

const TEAMS_MAP: Record<string, string> = {
  order_issue: 'Customer Support',
  return: 'Customer Support',
  refund: 'Billing & Payments',
  complaint: 'Customer Support',
  technical: 'Technical Support',
  general: 'Customer Support'
}

const COMMON_TAG_SUGGESTIONS = [
  'vip',
  'escalated',
  'shipping',
  'high-value',
  'damaged',
  'replacement',
  'duplicate-charge',
  'fraud-check',
  'portal'
]

interface AttachmentItem {
  id: string
  file?: File
  name: string
  size: number
  type: string
  previewUrl?: string
}

interface CustomFieldItem {
  id: string
  key: string
  value: string
}

export default function NewTicketPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Tenant / Client State
  const [clientId, setClientId] = useState<string>(() => getStoredClientId())
  const [bots, setBots] = useState<any[]>([])
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [recentTickets, setRecentTickets] = useState<any[]>([])

  // Main Form State
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [showInternalNotes, setShowInternalNotes] = useState(false)
  const [editorMode, setEditorMode] = useState<'write' | 'preview'>('write')
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [isDraggingFile, setIsDraggingFile] = useState(false)

  // Requester State
  const [contactSearch, setContactSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState<any | null>(null)
  const [isSearchingContacts, setIsSearchingContacts] = useState(false)
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false)
  const [newCustName, setNewCustName] = useState('')
  const [newCustEmail, setNewCustEmail] = useState('')
  const [newCustPhone, setNewCustPhone] = useState('')
  const [creatingCustomer, setCreatingCustomer] = useState(false)

  // Sidebar Metadata State
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [status, setStatus] = useState<string>('open')
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [team, setTeam] = useState<string>('Customer Support')
  const [category, setCategory] = useState<string>('order_issue')
  const [subCategory, setSubCategory] = useState<string>('Item Missing from Package')
  const [tags, setTags] = useState<string[]>(['portal'])
  const [tagInput, setTagInput] = useState('')
  const [channel, setChannel] = useState<'web' | 'email' | 'chat' | 'phone' | 'api'>('web')
  const [botId, setBotId] = useState<string>('')
  const [orderNumber, setOrderNumber] = useState('')
  const [verificationStatus, setVerificationStatus] = useState<'unverified' | 'verified'>('unverified')
  const [dueDate, setDueDate] = useState<string>('')
  const [dueDateOverride, setDueDateOverride] = useState(false)
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [ccInput, setCcInput] = useState('')
  const [customFields, setCustomFields] = useState<CustomFieldItem[]>([])

  // Smart Assist & UX State
  const [aiSuggestion, setAiSuggestion] = useState<{
    category?: string
    priority?: 'low' | 'medium' | 'high' | 'urgent'
    team?: string
    reason?: string
  } | null>(null)
  const [duplicateTicket, setDuplicateTicket] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [draftStatus, setDraftStatus] = useState<'saved' | 'saving' | null>(null)
  const [lastDraftTime, setLastDraftTime] = useState<string>('')
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const contactDropdownRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 1. Initial Authentication & Data Loading
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const id = activeWorkspaceId(data.user?.id || '') || getStoredClientId() || ''
      if (id) {
        setClientId(id)

        // Fetch Bots
        fetch(`/api/bots?client_id=${id}`)
          .then(res => res.ok ? res.json() : [])
          .then(data => Array.isArray(data) && setBots(data))
          .catch(() => {})

        // Fetch Team Members
        fetch(`/api/team?client_id=${id}`)
          .then(res => res.ok ? res.json() : [])
          .then(data => Array.isArray(data) && setTeamMembers(data))
          .catch(() => {})

        // Fetch Contacts
        fetch(`/api/contacts?client_id=${id}`)
          .then(res => res.ok ? res.json() : [])
          .then(data => Array.isArray(data) && setContacts(data))
          .catch(() => {})

        // Fetch Recent Open Tickets for duplicate detection
        fetch(`/api/tickets?client_id=${id}&page_size=30`)
          .then(res => res.ok ? res.json() : [])
          .then(data => Array.isArray(data) && setRecentTickets(data))
          .catch(() => {})
      }
    })
  }, [supabase])

  // 2. Draft Auto-Save to LocalStorage
  const draftKey = useMemo(() => `ticket_draft_v2_${clientId || 'global'}`, [clientId])

  // Load draft on mount if available
  useEffect(() => {
    if (!clientId) return
    try {
      const raw = localStorage.getItem(draftKey)
      if (raw) {
        const draft = JSON.parse(raw)
        if (draft.subject || draft.description) {
          setSubject(draft.subject || '')
          setDescription(draft.description || '')
          if (draft.internalNotes) {
            setInternalNotes(draft.internalNotes)
            setShowInternalNotes(true)
          }
          if (draft.priority) setPriority(draft.priority)
          if (draft.status) setStatus(draft.status)
          if (draft.category) setCategory(draft.category)
          if (draft.subCategory) setSubCategory(draft.subCategory)
          if (draft.orderNumber) setOrderNumber(draft.orderNumber)
          if (draft.tags) setTags(draft.tags)
          if (draft.selectedContact) setSelectedContact(draft.selectedContact)
          setLastDraftTime(draft.savedAt || format(new Date(), 'h:mm a'))
          setDraftStatus('saved')
          toast.info('Restored saved ticket draft from your previous session')
        }
      }
    } catch (e) {}
  }, [clientId, draftKey])

  // Save draft debounced
  useEffect(() => {
    if (!clientId || (!subject.trim() && !description.trim())) return
    setHasUnsavedChanges(true)
    setDraftStatus('saving')
    const timer = setTimeout(() => {
      try {
        const nowStr = format(new Date(), 'h:mm a')
        localStorage.setItem(draftKey, JSON.stringify({
          subject,
          description,
          internalNotes,
          priority,
          status,
          category,
          subCategory,
          orderNumber,
          tags,
          selectedContact,
          savedAt: nowStr
        }))
        setDraftStatus('saved')
        setLastDraftTime(nowStr)
      } catch (e) {}
    }, 800)
    return () => clearTimeout(timer)
  }, [subject, description, internalNotes, priority, status, category, subCategory, orderNumber, tags, selectedContact, clientId, draftKey])

  // Clear draft
  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey)
      setDraftStatus(null)
      setHasUnsavedChanges(false)
    } catch (e) {}
  }

  // 3. Dynamic SLA Calculation by Priority
  useEffect(() => {
    if (dueDateOverride) return
    const now = new Date()
    let hours = 24
    if (priority === 'urgent') hours = 4
    else if (priority === 'high') hours = 12
    else if (priority === 'medium') hours = 24
    else if (priority === 'low') hours = 72

    const targetDate = addHours(now, hours)
    setDueDate(format(targetDate, "yyyy-MM-dd'T'HH:mm"))
  }, [priority, dueDateOverride])

  // 4. Auto-sync Team when Category changes
  const handleCategoryChange = (cat: string) => {
    setCategory(cat)
    const subs = SUB_CATEGORIES[cat] || []
    setSubCategory(subs[0] || '')
    if (TEAMS_MAP[cat]) {
      setTeam(TEAMS_MAP[cat])
    }
  }

  // 5. Smart Assist: AI Suggestion & Triage on Text Input
  useEffect(() => {
    const text = `${subject} ${description}`.toLowerCase()
    if (text.length < 10) {
      setAiSuggestion(null)
      return
    }

    if (/fraud|charged twice|unauthorized|stolen|duplicate charge/.test(text)) {
      setAiSuggestion({
        category: 'refund',
        priority: 'urgent',
        team: 'Billing & Payments',
        reason: 'Detected billing discrepancy / unauthorized transaction'
      })
    } else if (/refund|money back|wrong charge|cancel order/.test(text)) {
      setAiSuggestion({
        category: 'refund',
        priority: 'high',
        team: 'Billing & Payments',
        reason: 'Customer requesting refund or monetary adjustment'
      })
    } else if (/broken|damaged|torn|defective|faulty|not working/.test(text)) {
      setAiSuggestion({
        category: 'return',
        priority: 'high',
        team: 'Customer Support',
        reason: 'Defective/Damaged product detected'
      })
    } else if (/missing|lost|delayed|where is my package|not delivered|tracking/.test(text)) {
      setAiSuggestion({
        category: 'order_issue',
        priority: 'medium',
        team: 'Customer Support',
        reason: 'Delivery or tracking status inquiry'
      })
    } else if (/bug|crash|error 500|glitch|cannot login|checkout failed/.test(text)) {
      setAiSuggestion({
        category: 'technical',
        priority: 'high',
        team: 'Technical Support',
        reason: 'Technical software/checkout impediment'
      })
    } else {
      setAiSuggestion(null)
    }
  }, [subject, description])

  const acceptAiSuggestion = () => {
    if (!aiSuggestion) return
    if (aiSuggestion.category) handleCategoryChange(aiSuggestion.category)
    if (aiSuggestion.priority) setPriority(aiSuggestion.priority)
    if (aiSuggestion.team) setTeam(aiSuggestion.team)
    toast.success('Applied AI triage recommendations')
    setAiSuggestion(null)
  }

  // 6. Duplicate Ticket Detection
  useEffect(() => {
    const email = selectedContact?.email || ''
    const phone = selectedContact?.phone || ''
    const order = orderNumber.trim()

    if (!email && !order && !phone) {
      setDuplicateTicket(null)
      return
    }

    const match = recentTickets.find(t => {
      if (t.status === 'solved' || t.status === 'closed') return false
      if (order && t.order_number && t.order_number.toLowerCase() === order.toLowerCase()) return true
      if (email && t.customer_email && t.customer_email.toLowerCase() === email.toLowerCase()) return true
      if (phone && t.customer_phone && t.customer_phone === phone) return true
      return false
    })

    setDuplicateTicket(match || null)
  }, [selectedContact, orderNumber, recentTickets])

  // 7. Contact Autocomplete Filtering
  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase()
    if (!q) return contacts.slice(0, 5)
    return contacts.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    ).slice(0, 8)
  }, [contacts, contactSearch])

  // Create new customer inline
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCustEmail && !newCustPhone && !newCustName) {
      toast.error('Please provide at least a name, email, or phone')
      return
    }
    setCreatingCustomer(true)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          first_name: newCustName.split(' ')[0] || newCustName,
          last_name: newCustName.split(' ').slice(1).join(' ') || null,
          email: newCustEmail.trim() || null,
          phone: newCustPhone.trim() || null
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create customer')

      const created = {
        id: data.id,
        name: newCustName || data.first_name || 'Customer',
        email: newCustEmail || data.email,
        phone: newCustPhone || data.phone
      }

      setContacts(prev => [created, ...prev])
      setSelectedContact(created)
      setIsCreateCustomerOpen(false)
      setNewCustName('')
      setNewCustEmail('')
      setNewCustPhone('')
      toast.success(`Created & selected customer: ${created.name}`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreatingCustomer(false)
    }
  }

  // 8. Markdown Formatting Toolbar Actions
  const insertFormatting = (prefix: string, suffix: string = '', defaultPlaceholder: string = '') => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const current = description
    const selected = current.substring(start, end) || defaultPlaceholder
    const replacement = `${prefix}${selected}${suffix}`
    const updated = current.substring(0, start) + replacement + current.substring(end)
    setDescription(updated)

    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
    }, 10)
  }

  const applyTemplate = (templateType: 'order' | 'refund' | 'bug') => {
    let tpl = ''
    if (templateType === 'order') {
      tpl = `### Customer Problem
- **Order ID**: ${orderNumber || 'ORD-'}
- **Items Affected**: 
- **Reported Issue**: 

### Verification & Checks
- [x] Verified customer identity
- [ ] Confirmed carrier tracking details

### Desired Resolution
- [ ] Replacement Shipment
- [ ] Store Credit / Coupon`
    } else if (templateType === 'refund') {
      tpl = `### Refund Request Overview
- **Order / Transaction ID**: ${orderNumber || 'ORD-'}
- **Refund Reason**: 
- **Requested Amount**: 

### Return Status
- **Item Condition**: 
- **Return Tracking**: 

### Next Agent Steps
1. Verify payment gateway authorization
2. Process refund batch`
    } else {
      tpl = `### Bug Description
**Summary**: 

### Steps to Reproduce
1. Navigate to 
2. Perform action 
3. Observe unexpected outcome

### Expected vs Actual
- **Expected**: 
- **Actual**: 

### Environment
- Device / Browser: `
    }

    if (description.trim() && !confirm('Replace current description with this template?')) {
      return
    }
    setDescription(tpl)
    toast.success('Inserted template')
  }

  // 9. File Attachment Handlers
  const handleFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    const valid: AttachmentItem[] = []

    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`File "${f.name}" exceeds 25 MB limit`)
        continue
      }
      const previewUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
      valid.push({
        id: 'att_' + Math.random().toString(36).substring(2, 9),
        file: f,
        name: f.name,
        size: f.size,
        type: f.type,
        previewUrl
      })
    }

    if (valid.length > 0) {
      setAttachments(prev => [...prev, ...valid])
      toast.success(`Attached ${valid.length} file${valid.length > 1 ? 's' : ''}`)
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  // 10. Tags & CC Emails Handling
  const handleAddTag = (t: string) => {
    const clean = t.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove))
  }

  const handleAddCc = (email: string) => {
    const clean = email.trim().toLowerCase()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) && !ccEmails.includes(clean)) {
      setCcEmails([...ccEmails, clean])
      setCcInput('')
    } else if (clean) {
      toast.error('Please enter a valid email address')
    }
  }

  const handleRemoveCc = (emailToRemove: string) => {
    setCcEmails(ccEmails.filter(e => e !== emailToRemove))
  }

  // Dynamic Custom Fields
  const handleAddCustomField = () => {
    setCustomFields(prev => [
      ...prev,
      { id: 'cf_' + Math.random().toString(36).substring(2, 7), key: '', value: '' }
    ])
  }

  const handleUpdateCustomField = (id: string, key: string, value: string) => {
    setCustomFields(prev => prev.map(cf => cf.id === id ? { ...cf, key, value } : cf))
  }

  const handleRemoveCustomField = (id: string) => {
    setCustomFields(prev => prev.filter(cf => cf.id !== id))
  }

  // 11. Form Validation & Submission
  const validateForm = () => {
    if (!clientId) {
      toast.error('Client account session not detected')
      return false
    }
    if (!subject.trim()) {
      toast.error('Ticket subject is required')
      return false
    }
    if (subject.length > 120) {
      toast.error('Subject must be 120 characters or fewer')
      return false
    }
    if (!description.trim()) {
      toast.error('Ticket description is required')
      return false
    }
    return true
  }

  const handleSubmit = async (e?: React.FormEvent, isDraftOnly = false) => {
    if (e) e.preventDefault()
    if (!validateForm()) return

    setSaving(true)

    try {
      const customFieldRecord = customFields.reduce((acc, curr) => {
        if (curr.key.trim()) acc[curr.key.trim()] = curr.value.trim()
        return acc
      }, {} as Record<string, string>)

      const payload = {
        client_id: clientId,
        subject: subject.trim(),
        description: description.trim(),
        internal_notes: internalNotes.trim() || undefined,
        priority,
        status: isDraftOnly ? 'pending' : status,
        type: category,
        sub_category: subCategory,
        team,
        assignee_id: assigneeId || null,
        bot_id: botId || null,
        order_number: orderNumber.trim() || null,
        verification_status: verificationStatus,
        customer_name: selectedContact?.name || undefined,
        customer_email: selectedContact?.email || undefined,
        customer_phone: selectedContact?.phone || undefined,
        contact_id: selectedContact?.id || null,
        source: channel,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
        metadata: {
          sub_category: subCategory,
          team,
          tags,
          cc_emails: ccEmails,
          custom_fields: customFieldRecord,
          is_draft: isDraftOnly,
          attachment_count: attachments.length
        }
      }

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || 'Failed to create ticket')
      }

      // Upload and link attachments if any
      if (attachments.length > 0 && body.ticket?.id) {
        for (const att of attachments) {
          if (!att.file) continue
          try {
            const formData = new FormData()
            formData.append('file', att.file)
            formData.append('context_id', clientId)
            formData.append('session_id', body.ticket.id)
            await fetch('/api/chat/media', { method: 'POST', body: formData })
          } catch (err) {}
        }
      }

      clearDraft()
      invalidateAllTicketsCache()

      if (body.duplicate) {
        toast.info(`Routed to matching active ticket: #${body.ticket.ticket_number || body.ticket.id.slice(0, 8)}`)
      } else {
        toast.success(`Ticket #${body.ticket.ticket_number || body.ticket.id.slice(0, 8)} created successfully`)
      }

      router.push(`/tickets/${body.ticket.id}`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Keyboard shortcut: Cmd/Ctrl + Enter submits
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [subject, description, internalNotes, priority, status, category, subCategory, selectedContact])

  return (
    <div className="min-h-screen bg-[#f8fafc]/80 pb-20">
      {/* ── Persistent Top Sticky Header Bar ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-surface-border shadow-2xs px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="max-w-[1520px] mx-auto flex items-center justify-between gap-4">
          {/* Left: Back & Breadcrumb */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (hasUnsavedChanges) setIsDiscardModalOpen(true)
                else router.push('/tickets/all')
              }}
              className="text-ink-secondary hover:text-ink font-medium h-8 px-2.5 -ml-1 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back to Tickets
            </Button>
            <div className="h-4 w-px bg-surface-border hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs text-ink-muted">Tickets</span>
              <span className="text-xs text-ink-muted">/</span>
              <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5 text-accent" />
                New Support Ticket
              </span>
            </div>
          </div>

          {/* Center / Right: Auto-Save Status & Actions */}
          <div className="flex items-center gap-3">
            {draftStatus && (
              <div className="hidden md:flex items-center gap-1.5 text-[11px] text-ink-muted bg-surface-muted/60 px-2.5 py-1 rounded-full border border-surface-border">
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  draftStatus === 'saving' ? "bg-amber-400 animate-pulse" : "bg-emerald-500"
                )} />
                {draftStatus === 'saving' ? 'Saving draft...' : `Draft saved ${lastDraftTime ? `at ${lastDraftTime}` : ''}`}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => handleSubmit(e, true)}
              disabled={saving || !subject.trim()}
              className="h-8 text-xs font-medium border-surface-border text-ink-secondary hover:text-ink"
            >
              <BookmarkCheck className="w-3.5 h-3.5 mr-1.5" />
              Save as Draft
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={(e) => handleSubmit(e, false)}
              disabled={saving || !subject.trim() || !description.trim()}
              className="h-8 text-xs font-semibold bg-accent text-white hover:bg-accent/90 shadow-sm px-4"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Creating Ticket...
                </>
              ) : (
                <>
                  Create Ticket
                  <span className="ml-2 text-[10px] opacity-75 font-mono hidden lg:inline-block">⌘↵</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main Workspace Body ── */}
      <main className="max-w-[1520px] mx-auto p-4 sm:p-6 lg:p-8">
        <form onSubmit={(e) => handleSubmit(e, false)} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-8 items-start">

          {/* ═══════════════════════════════════════════════
              LEFT COLUMN: MAIN CONTENT PANEL (70%)
          ═══════════════════════════════════════════════ */}
          <div className="space-y-6 min-w-0">

            {/* 1. Duplicate Ticket Banner Warning */}
            {duplicateTicket && (
              <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 shadow-2xs animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-700 mt-0.5">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-amber-900 flex items-center gap-2">
                        Existing Open Case Detected
                        <Badge variant="outline" className="text-[10px] bg-white border-amber-300 text-amber-800 font-mono">
                          #{duplicateTicket.ticket_number || duplicateTicket.id.slice(0, 8)}
                        </Badge>
                      </h4>
                      <p className="text-xs text-amber-800/90 mt-0.5 leading-relaxed">
                        An active ticket for this customer or order already exists with subject: <strong className="font-semibold">"{duplicateTicket.subject}"</strong> ({duplicateTicket.status}).
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/tickets/${duplicateTicket.id}`)}
                    className="h-7 text-xs bg-white text-amber-900 border-amber-300 hover:bg-amber-100/60 shrink-0 font-medium"
                  >
                    View Ticket <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* 2. AI Smart Triage Banner */}
            {aiSuggestion && (
              <div className="bg-gradient-to-r from-violet-50/80 via-indigo-50/60 to-purple-50/80 border border-indigo-200/80 rounded-2xl p-4 shadow-2xs animate-in fade-in duration-300">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-950">AI Smart Triage</span>
                        <span className="text-[11px] text-indigo-700/80">• {aiSuggestion.reason}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-medium text-indigo-900">Suggested:</span>
                        <Badge className="bg-white text-indigo-700 border-indigo-200 text-[10px] font-medium capitalize">
                          {aiSuggestion.category?.replace('_', ' ')}
                        </Badge>
                        <Badge className="bg-white text-rose-700 border-rose-200 text-[10px] font-medium capitalize">
                          {aiSuggestion.priority} Priority
                        </Badge>
                        <Badge className="bg-white text-indigo-700 border-indigo-200 text-[10px] font-medium">
                          {aiSuggestion.team}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={acceptAiSuggestion}
                    className="h-7 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shrink-0 shadow-sm"
                  >
                    Accept Suggestion
                  </Button>
                </div>
              </div>
            )}

            {/* 3. Main Issue Details Card */}
            <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
              <div className="p-6 space-y-6">

                {/* Subject Field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label htmlFor="ticket-subject" className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                      Subject <span className="text-rose-500 font-bold">*</span>
                    </Label>
                    <span className={cn(
                      "text-[11px] font-mono",
                      subject.length > 100 ? "text-amber-600 font-bold" : "text-ink-muted"
                    )}>
                      {subject.length}/120
                    </span>
                  </div>
                  <Input
                    id="ticket-subject"
                    autoFocus
                    required
                    maxLength={120}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief summary of the issue (e.g., Damaged item received in Order #ORD-2091)"
                    className="text-base font-medium h-11 border-surface-border focus-visible:ring-accent/20 placeholder:text-ink-muted/70"
                  />
                </div>

                {/* Description Rich Text / Markdown Editor */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <Label htmlFor="ticket-description" className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                      Description <span className="text-rose-500 font-bold">*</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      {/* Templates Dropdown Chips */}
                      <span className="text-[11px] text-ink-muted hidden md:inline">Templates:</span>
                      <button
                        type="button"
                        onClick={() => applyTemplate('order')}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-surface-muted hover:bg-surface-border text-ink-secondary transition-colors"
                      >
                        + Order Issue
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTemplate('refund')}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-surface-muted hover:bg-surface-border text-ink-secondary transition-colors"
                      >
                        + Return/Refund
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTemplate('bug')}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-surface-muted hover:bg-surface-border text-ink-secondary transition-colors"
                      >
                        + Bug Report
                      </button>
                    </div>
                  </div>

                  {/* Formatting Toolbar & Editor Container */}
                  <div className="border border-surface-border rounded-xl overflow-hidden shadow-2xs focus-within:border-accent/80 focus-within:ring-2 focus-within:ring-accent/10 transition-all">
                    {/* Toolbar Header */}
                    <div className="bg-surface-muted/60 border-b border-surface-border px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      {/* Formatting Buttons */}
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          title="Bold (**text**)"
                          onClick={() => insertFormatting('**', '**', 'bold text')}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white text-ink-secondary hover:text-ink"
                        >
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Italic (*text*)"
                          onClick={() => insertFormatting('*', '*', 'italic text')}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white text-ink-secondary hover:text-ink"
                        >
                          <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Strikethrough (~~text~~)"
                          onClick={() => insertFormatting('~~', '~~', 'strikethrough')}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white text-ink-secondary hover:text-ink"
                        >
                          <Strikethrough className="w-3.5 h-3.5" />
                        </button>
                        <div className="h-4 w-px bg-surface-border mx-1" />
                        <button
                          type="button"
                          title="Heading 2 (## Title)"
                          onClick={() => insertFormatting('## ', '', 'Section Title')}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white text-ink-secondary hover:text-ink"
                        >
                          <Heading2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Bullet List (- item)"
                          onClick={() => insertFormatting('- ', '', 'List item')}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white text-ink-secondary hover:text-ink"
                        >
                          <List className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Numbered List (1. item)"
                          onClick={() => insertFormatting('1. ', '', 'Numbered item')}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white text-ink-secondary hover:text-ink"
                        >
                          <ListOrdered className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Quote (> quote)"
                          onClick={() => insertFormatting('> ', '', 'Quote text')}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white text-ink-secondary hover:text-ink"
                        >
                          <Quote className="w-3.5 h-3.5" />
                        </button>
                        <div className="h-4 w-px bg-surface-border mx-1" />
                        <button
                          type="button"
                          title="Code Block (```)"
                          onClick={() => insertFormatting('```\n', '\n```', 'code block')}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white text-ink-secondary hover:text-ink"
                        >
                          <Code className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Link ([title](url))"
                          onClick={() => insertFormatting('[', '](https://)', 'Link text')}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white text-ink-secondary hover:text-ink"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Write / Preview Tab Switcher */}
                      <div className="flex items-center bg-surface-muted rounded-lg p-0.5 border border-surface-border/60">
                        <button
                          type="button"
                          onClick={() => setEditorMode('write')}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all",
                            editorMode === 'write' ? "bg-white text-ink shadow-2xs" : "text-ink-muted hover:text-ink"
                          )}
                        >
                          <Edit3 className="w-3 h-3" /> Write
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorMode('preview')}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all",
                            editorMode === 'preview' ? "bg-white text-ink shadow-2xs" : "text-ink-muted hover:text-ink"
                          )}
                        >
                          <Eye className="w-3 h-3" /> Preview
                        </button>
                      </div>
                    </div>

                    {/* Editor Content Area */}
                    {editorMode === 'write' ? (
                      <Textarea
                        id="ticket-description"
                        ref={textareaRef}
                        required
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Provide comprehensive details about the issue, steps to reproduce, customer impact, or background..."
                        className="w-full min-h-[220px] p-4 text-sm font-sans leading-relaxed border-0 focus-visible:ring-0 rounded-none resize-y placeholder:text-ink-muted/70"
                      />
                    ) : (
                      <div className="p-4 min-h-[220px] max-h-[460px] overflow-auto prose prose-sm max-w-none bg-white text-ink leading-relaxed">
                        {description.trim() ? (
                          <div className="whitespace-pre-wrap font-sans text-sm">{description}</div>
                        ) : (
                          <p className="text-xs text-ink-muted italic">Nothing to preview. Switch to write mode to enter a description.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Attachments Drag-and-Drop Zone */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-accent" />
                      Attachments
                    </Label>
                    <span className="text-[11px] text-ink-muted">Max 25MB per file • Images, PDFs, DOCX</span>
                  </div>

                  {/* Dropzone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true) }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setIsDraggingFile(false)
                      if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all",
                      isDraggingFile
                        ? "border-accent bg-accent/5 scale-[0.99]"
                        : "border-surface-border/80 hover:border-accent/40 bg-surface-muted/20 hover:bg-surface-muted/40"
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={(e) => e.target.files && handleFiles(e.target.files)}
                      className="hidden"
                    />
                    <UploadCloud className="w-7 h-7 mx-auto text-ink-muted mb-2" />
                    <p className="text-xs font-semibold text-ink">
                      Drag and drop files here, or <span className="text-accent underline">browse</span>
                    </p>
                    <p className="text-[11px] text-ink-muted mt-0.5">
                      Attach screenshots, order receipts, return photos, or diagnostics logs
                    </p>
                  </div>

                  {/* Attachment Thumbnails / List */}
                  {attachments.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                      {attachments.map((item) => (
                        <div
                          key={item.id}
                          className="bg-white border border-surface-border rounded-xl p-2.5 flex items-center gap-2.5 relative group shadow-2xs"
                        >
                          {item.previewUrl ? (
                            <img
                              src={item.previewUrl}
                              alt={item.name}
                              className="w-10 h-10 rounded-lg object-cover border border-surface-border shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-surface-muted flex items-center justify-center shrink-0 text-ink-secondary">
                              <File className="w-5 h-5" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0 pr-6">
                            <p className="text-xs font-medium text-ink truncate">{item.name}</p>
                            <p className="text-[10px] text-ink-muted">
                              {(item.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(item.id)}
                            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-surface-muted hover:bg-rose-100 text-ink-muted hover:text-rose-600 flex items-center justify-center transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Collapsible Internal Notes Section */}
                <div className="border border-amber-200/80 rounded-xl overflow-hidden bg-amber-50/40">
                  <button
                    type="button"
                    onClick={() => setShowInternalNotes(!showInternalNotes)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-amber-100/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-amber-200/80 text-amber-900 flex items-center justify-center shrink-0">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-amber-950 flex items-center gap-2">
                          Internal Notes
                          <span className="text-[10px] font-semibold bg-amber-200/70 text-amber-900 px-2 py-0.2 rounded-full">
                            Agents & Staff Only
                          </span>
                        </h4>
                        <p className="text-[11px] text-amber-800/80">
                          Hidden from customer • Never included in customer-facing emails
                        </p>
                      </div>
                    </div>
                    {showInternalNotes ? (
                      <ChevronDown className="w-4 h-4 text-amber-900" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-amber-900" />
                    )}
                  </button>

                  {showInternalNotes && (
                    <div className="p-4 pt-1 border-t border-amber-200/60 bg-white/70">
                      <Textarea
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                        placeholder="Add private triage instructions, customer sentiment context, or internal resolution notes..."
                        className="min-h-[100px] text-xs bg-amber-50/30 border-amber-200 focus-visible:ring-amber-400 placeholder:text-amber-800/50 resize-y"
                      />
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>

          {/* ═══════════════════════════════════════════════
              RIGHT COLUMN: SIDEBAR METADATA PANEL (30%)
          ═══════════════════════════════════════════════ */}
          <div className="space-y-6 lg:sticky lg:top-20">

            {/* Requester & Customer Context */}
            <div className="bg-white border border-surface-border rounded-2xl shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-accent" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Requester</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateCustomerOpen(true)}
                  className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> New Customer
                </button>
              </div>

              {selectedContact ? (
                /* Selected Requester Card */
                <div className="bg-surface-muted/40 border border-surface-border rounded-xl p-3 relative group">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center font-bold text-sm shrink-0">
                      {(selectedContact.name || selectedContact.email || 'C').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <p className="text-xs font-bold text-ink truncate">{selectedContact.name || 'Unnamed Customer'}</p>
                      <p className="text-[11px] text-ink-muted truncate">{selectedContact.email || 'No email'}</p>
                      {selectedContact.phone && (
                        <p className="text-[11px] text-ink-muted">{selectedContact.phone}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedContact(null)}
                    className="absolute top-2.5 right-2.5 text-xs text-ink-muted hover:text-rose-600 font-medium"
                    title="Change customer"
                  >
                    Change
                  </button>

                  {/* Customer Context Card */}
                  <div className="mt-3 pt-3 border-t border-surface-border/80 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-white p-2 rounded-lg border border-surface-border">
                      <span className="text-ink-muted block">Tier & Status</span>
                      <span className="font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                        <ShieldCheck className="w-3 h-3" /> Verified Customer
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-surface-border">
                      <span className="text-ink-muted block">Satisfaction</span>
                      <span className="font-bold text-amber-600 flex items-center gap-1 mt-0.5">
                        <Star className="w-3 h-3 fill-amber-500" /> 4.9 CSAT (98%)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Search Requester Input */
                <div className="relative" ref={contactDropdownRef}>
                  <div className="relative">
                    <Input
                      value={contactSearch}
                      onChange={(e) => {
                        setContactSearch(e.target.value)
                        setIsSearchingContacts(true)
                      }}
                      onFocus={() => setIsSearchingContacts(true)}
                      placeholder="Search customer by name, email..."
                      className="text-xs h-9 pl-8 border-surface-border"
                    />
                    <User className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-2.5" />
                  </div>

                  {/* Dropdown Results */}
                  {isSearchingContacts && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-surface-border rounded-xl shadow-lg z-50 max-h-56 overflow-auto divide-y divide-surface-border/60">
                      {filteredContacts.length > 0 ? (
                        filteredContacts.map(c => (
                          <div
                            key={c.id}
                            onClick={() => {
                              setSelectedContact(c)
                              setIsSearchingContacts(false)
                              setContactSearch('')
                            }}
                            className="p-2.5 hover:bg-surface-muted/60 cursor-pointer flex items-center gap-2.5 transition-colors"
                          >
                            <div className="w-7 h-7 rounded-full bg-accent/10 text-accent font-bold text-xs flex items-center justify-center shrink-0">
                              {(c.name || c.email || 'C').slice(0, 1).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-ink truncate">{c.name || 'Unnamed'}</p>
                              <p className="text-[10px] text-ink-muted truncate">{c.email || c.phone}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-xs text-ink-muted">No customers found</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setIsSearchingContacts(false)
                              setIsCreateCustomerOpen(true)
                            }}
                            className="mt-1 text-xs text-accent font-semibold h-7"
                          >
                            + Create new customer
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Core Ticket Properties */}
            <div className="bg-white border border-surface-border rounded-2xl shadow-sm p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink border-b border-surface-border pb-3">
                Ticket Properties
              </h3>

              {/* Priority Segmented Control */}
              <div>
                <Label className="text-xs font-bold text-ink mb-1.5 block">Priority</Label>
                <div className="grid grid-cols-4 gap-1.5 bg-surface-muted/60 p-1 rounded-xl border border-surface-border/70">
                  <button
                    type="button"
                    onClick={() => setPriority('low')}
                    className={cn(
                      "py-1.5 text-xs font-semibold rounded-lg transition-all",
                      priority === 'low'
                        ? "bg-white text-slate-800 shadow-2xs border border-slate-300"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    Low
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriority('medium')}
                    className={cn(
                      "py-1.5 text-xs font-semibold rounded-lg transition-all",
                      priority === 'medium'
                        ? "bg-blue-600 text-white shadow-2xs font-bold"
                        : "text-blue-700 hover:text-blue-900"
                    )}
                  >
                    Med
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriority('high')}
                    className={cn(
                      "py-1.5 text-xs font-semibold rounded-lg transition-all",
                      priority === 'high'
                        ? "bg-amber-600 text-white shadow-2xs font-bold"
                        : "text-amber-700 hover:text-amber-900"
                    )}
                  >
                    High
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriority('urgent')}
                    className={cn(
                      "py-1.5 text-xs font-semibold rounded-lg transition-all",
                      priority === 'urgent'
                        ? "bg-rose-600 text-white shadow-2xs font-bold"
                        : "text-rose-700 hover:text-rose-900"
                    )}
                  >
                    Urgent
                  </button>
                </div>
                {/* SLA target info */}
                <p className="text-[10px] text-ink-muted mt-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-accent" />
                  {priority === 'urgent' && '⚡ 1h First Response SLA • 4h Resolution Target'}
                  {priority === 'high' && '⏳ 4h First Response SLA • 12h Resolution Target'}
                  {priority === 'medium' && '🕒 8h First Response SLA • 24h Resolution Target'}
                  {priority === 'low' && '📆 24h First Response SLA • 72h Resolution Target'}
                </p>
              </div>

              {/* Status Select */}
              <div>
                <Label className="text-xs font-bold text-ink mb-1.5 block">Status</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-surface-border rounded-xl text-xs font-medium outline-none focus:border-accent"
                >
                  <option value="open">🟢 Open (Needs Attention)</option>
                  <option value="pending">🟡 Pending (Waiting on Customer)</option>
                  <option value="on_hold">⚪ On Hold (Internal Review)</option>
                  <option value="resolved">🔵 Resolved</option>
                  <option value="closed">⚫ Closed</option>
                </select>
              </div>

              {/* Assignee Select */}
              <div>
                <Label className="text-xs font-bold text-ink mb-1.5 block">Assignee</Label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-surface-border rounded-xl text-xs font-medium outline-none focus:border-accent"
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.full_name || m.email} ({m.role || 'Agent'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Category & Sub-category */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs font-bold text-ink mb-1.5 block">Category</Label>
                  <select
                    value={category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-surface-border rounded-xl text-xs font-medium outline-none focus:border-accent"
                  >
                    <option value="order_issue">Order Issue</option>
                    <option value="refund">Refund</option>
                    <option value="return">Return & Exchange</option>
                    <option value="technical">Technical / Bug</option>
                    <option value="complaint">Billing & Complaint</option>
                    <option value="general">General Inquiry</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-ink mb-1.5 block">Sub-category</Label>
                  <select
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-surface-border rounded-xl text-xs font-medium outline-none focus:border-accent"
                  >
                    {(SUB_CATEGORIES[category] || []).map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Team / Group */}
              <div>
                <Label className="text-xs font-bold text-ink mb-1.5 block">Team / Group</Label>
                <select
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-surface-border rounded-xl text-xs font-medium outline-none focus:border-accent"
                >
                  <option value="Customer Support">Customer Support</option>
                  <option value="Billing & Payments">Billing & Payments</option>
                  <option value="Technical Support">Technical Support</option>
                  <option value="Sales & Success">Sales & Success</option>
                </select>
              </div>

              {/* Tags Multi-select Chips */}
              <div>
                <Label className="text-xs font-bold text-ink mb-1.5 block">Tags</Label>
                <div className="flex flex-wrap gap-1.5 p-2 bg-surface-muted/30 border border-surface-border rounded-xl min-h-[38px]">
                  {tags.map(t => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white border border-surface-border text-ink px-2 py-0.5 rounded-md shadow-2xs"
                    >
                      #{t}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="text-ink-muted hover:text-rose-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        handleAddTag(tagInput)
                      }
                    }}
                    placeholder={tags.length === 0 ? "Add tags (e.g. vip, shipping)..." : "+ tag"}
                    className="flex-1 min-w-[80px] bg-transparent text-xs outline-none placeholder:text-ink-muted"
                  />
                </div>
                {/* Common tag suggestions */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {COMMON_TAG_SUGGESTIONS.filter(t => !tags.includes(t)).slice(0, 4).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleAddTag(st)}
                      className="text-[10px] text-ink-muted hover:text-accent font-medium px-1.5 py-0.5 rounded bg-surface-muted/80 hover:bg-surface-border transition-colors"
                    >
                      +{st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due Date & SLA Target */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs font-bold text-ink">Due Date / SLA</Label>
                  <button
                    type="button"
                    onClick={() => setDueDateOverride(!dueDateOverride)}
                    className="text-[10px] text-accent font-semibold hover:underline"
                  >
                    {dueDateOverride ? 'Reset to Auto-SLA' : 'Custom Override'}
                  </button>
                </div>
                <Input
                  type="datetime-local"
                  value={dueDate}
                  disabled={!dueDateOverride}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="text-xs h-9 border-surface-border bg-white"
                />
              </div>

              {/* Channel / Source */}
              <div>
                <Label className="text-xs font-bold text-ink mb-1.5 block">Channel / Source</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'web', label: 'Web Portal', icon: Globe },
                    { id: 'chat', label: 'Live Chatbot', icon: MessageSquare },
                    { id: 'email', label: 'Email', icon: Mail },
                    { id: 'phone', label: 'WhatsApp / Phone', icon: Smartphone }
                  ].map(ch => {
                    const Icon = ch.icon
                    const isSelected = channel === ch.id
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setChannel(ch.id as any)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-xl text-xs font-medium border text-left transition-all",
                          isSelected
                            ? "bg-accent/5 border-accent text-accent font-semibold shadow-2xs"
                            : "bg-white border-surface-border text-ink-secondary hover:bg-surface-muted/50"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {ch.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Associated Bot Automation */}
              {bots.length > 0 && (
                <div>
                  <Label className="text-xs font-bold text-ink mb-1.5 block">Associated Bot</Label>
                  <select
                    value={botId}
                    onChange={(e) => setBotId(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-surface-border rounded-xl text-xs font-medium outline-none focus:border-accent"
                  >
                    <option value="">No bot linked</option>
                    {bots.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Custom & Order Fields */}
            <div className="bg-white border border-surface-border rounded-2xl shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                  E-Commerce & Custom Fields
                </h3>
                <button
                  type="button"
                  onClick={handleAddCustomField}
                  className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Field
                </button>
              </div>

              {/* Order Number & Verification */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-bold text-ink mb-1.5 block">Order Number</Label>
                  <Input
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="ORD-10294"
                    className="text-xs h-9 border-surface-border font-mono"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-surface-muted/40 border border-surface-border rounded-xl">
                  <div>
                    <span className="text-xs font-semibold text-ink block">Customer Verification</span>
                    <span className="text-[10px] text-ink-muted">Confirmed matching phone or OTP</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVerificationStatus(verificationStatus === 'verified' ? 'unverified' : 'verified')}
                    className={cn(
                      "px-2.5 py-1 text-xs font-bold rounded-lg transition-all",
                      verificationStatus === 'verified'
                        ? "bg-emerald-600 text-white"
                        : "bg-surface-muted text-ink-muted border border-surface-border"
                    )}
                  >
                    {verificationStatus === 'verified' ? '✓ Verified' : 'Unverified'}
                  </button>
                </div>
              </div>

              {/* CC / Watchers Emails */}
              <div>
                <Label className="text-xs font-bold text-ink mb-1.5 block">CC / Watchers</Label>
                <div className="flex flex-wrap gap-1.5 p-2 bg-surface-muted/30 border border-surface-border rounded-xl min-h-[38px]">
                  {ccEmails.map(email => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white border border-surface-border text-ink px-2 py-0.5 rounded-md"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => handleRemoveCc(email)}
                        className="text-ink-muted hover:text-rose-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="email"
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        handleAddCc(ccInput)
                      }
                    }}
                    placeholder={ccEmails.length === 0 ? "Add CC email..." : "+ email"}
                    className="flex-1 min-w-[90px] bg-transparent text-xs outline-none placeholder:text-ink-muted"
                  />
                </div>
              </div>

              {/* Dynamic Key-Value Rows */}
              {customFields.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-surface-border">
                  {customFields.map((cf) => (
                    <div key={cf.id} className="flex items-center gap-2">
                      <Input
                        value={cf.key}
                        onChange={(e) => handleUpdateCustomField(cf.id, e.target.value, cf.value)}
                        placeholder="Field name"
                        className="h-8 text-xs border-surface-border flex-1"
                      />
                      <Input
                        value={cf.value}
                        onChange={(e) => handleUpdateCustomField(cf.id, cf.key, e.target.value)}
                        placeholder="Value"
                        className="h-8 text-xs border-surface-border flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomField(cf.id)}
                        className="text-ink-muted hover:text-rose-600 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sticky Action Button */}
            <div className="pt-2">
              <Button
                type="submit"
                disabled={saving || !subject.trim() || !description.trim()}
                className="w-full h-11 text-sm font-bold bg-accent text-white hover:bg-accent/90 shadow-md rounded-xl"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Creating Ticket...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Create Ticket Now
                  </>
                )}
              </Button>
              <p className="text-[11px] text-center text-ink-muted mt-2">
                Press <span className="font-mono bg-surface-muted px-1.5 py-0.5 rounded border border-surface-border">⌘ + Enter</span> to submit anytime
              </p>
            </div>

          </div>

        </form>
      </main>

      {/* ── Create New Customer Modal ── */}
      <Dialog open={isCreateCustomerOpen} onOpenChange={setIsCreateCustomerOpen}>
        <DialogContent className="sm:max-w-md bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-ink flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-accent" />
              Create New Customer
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Add contact details to link this ticket and retain customer history.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCustomer} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-ink">Full Name</Label>
              <Input
                autoFocus
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="e.g. Alex Morgan"
                className="mt-1 text-xs h-9 border-surface-border"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-ink">Email Address</Label>
              <Input
                type="email"
                value={newCustEmail}
                onChange={(e) => setNewCustEmail(e.target.value)}
                placeholder="alex@example.com"
                className="mt-1 text-xs h-9 border-surface-border"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-ink">Phone Number</Label>
              <Input
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                placeholder="+1 (555) 019-2831"
                className="mt-1 text-xs h-9 border-surface-border"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateCustomerOpen(false)}
                className="h-8 text-xs border-surface-border"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creatingCustomer || (!newCustName && !newCustEmail && !newCustPhone)}
                className="h-8 text-xs bg-accent text-white hover:bg-accent/90"
              >
                {creatingCustomer ? 'Saving...' : 'Save & Select'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Discard Unsaved Changes Modal ── */}
      <Dialog open={isDiscardModalOpen} onOpenChange={setIsDiscardModalOpen}>
        <DialogContent className="sm:max-w-sm bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-ink">Discard unsaved ticket?</DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              You have unsaved changes. Leaving will keep your local draft, but this form will close.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDiscardModalOpen(false)}
              className="h-8 text-xs flex-1 border-surface-border"
            >
              Continue Editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setIsDiscardModalOpen(false)
                router.push('/tickets/all')
              }}
              className="h-8 text-xs flex-1"
            >
              Discard & Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
