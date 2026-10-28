'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'
import { BotPanel } from '@/components/BotPanel'
import { InboxView } from '@/components/InboxView'
import InboxPage from './inbox/page'
import CampaignsPage from './campaigns/page'
import TicketsPage from './tickets/page'
import ClientAnalyticsPage from './analytics/page'

interface Client {
  id: string; name: string; email: string | null; website_url: string | null
  context_id: string | null; notes: string | null; created_at: string
  message_count: number; chunk_count: number; page_count: number; crawl_status: string
}

interface DataSource {
  id: string; name: string; source_type: string; endpoint_url: string
  auth_header: string | null; lookup_param: string; field_mapping: Record<string, string>; enabled: boolean
}

export default function ClientDetailPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const clientId = params.id as string
  const [token, setToken] = useState('')
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [recrawling, setRecrawling] = useState(false)
  const [tab, setTab] = useState<'overview' | 'knowledge' | 'analytics' | 'whatsapp' | 'email' | 'crm' | 'campaigns' | 'bots' | 'library' | 'integrations' | 'appearance' | 'inbox' | 'tickets'>('overview')

  const [dbConnections, setDbConnections] = useState([{ source_type: 'postgres', endpoint_url: '', auth_header: '' }])

  // Library state
  const [datasets, setDatasets] = useState<any[]>([])
  const [datasetsLoading, setDatasetsLoading] = useState(false)
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null)
  const [chunks, setChunks] = useState<any[]>([])
  const [chunksLoading, setChunksLoading] = useState(false)
  const [newChunkTitle, setNewChunkTitle] = useState('')
  const [newChunkText, setNewChunkText] = useState('')
  const [addingChunk, setAddingChunk] = useState(false)
  const [newDatasetName, setNewDatasetName] = useState('')
  const [creatingDataset, setCreatingDataset] = useState(false)
  const [libraryUrls, setLibraryUrls] = useState<string[]>([''])
  const [crawlingLib, setCrawlingLib] = useState(false)
  const [libFiles, setLibFiles] = useState<File[]>([])
  const libFileRef = useRef<HTMLInputElement>(null)
  const [librarySuccess, setLibrarySuccess] = useState('')
  const [libraryError, setLibraryError] = useState('')
  const [selectedBot, setSelectedBot] = useState<any>(null)

  // CRM State
  const [contacts, setContacts] = useState<any[]>([])
  const [crmLoading, setCrmLoading] = useState(false)
  const [importType, setImportType] = useState<'csv' | 'url'>('csv')
  const [sheetUrl, setSheetUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const csvFileRef = useRef<HTMLInputElement>(null)
  
  // Clusters State
  const [clusters, setClusters] = useState<any[]>([])
  const [clustersLoading, setClustersLoading] = useState(false)

  // Bots State
  const [bots, setBots] = useState<any[]>([])
  const [botsLoading, setBotsLoading] = useState(false)

  // Campaigns State
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(false)

  // WhatsApp state
  const [waNumbers, setWaNumbers] = useState<any[]>([])
  const [waLoading, setWaLoading] = useState(false)
  const [waForm, setWaForm] = useState({ label: '', phone_number_id: '', access_token: '' })
  const [waAdding, setWaAdding] = useState(false)

  // Email state
  const [emails, setEmails] = useState<any[]>([])
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailForm, setEmailForm] = useState({ label: '', email_address: '', smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '', from_name: '' })
  const [emailAdding, setEmailAdding] = useState(false)

  // Appearance state
  const [appearanceForm, setAppearanceForm] = useState({ theme_color: '#8b5cf6', widget_title: 'AI Assistant', welcome_message: 'Hi there! How can I help you today?' })

  // Data source state — now supports multiple connections
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [dbForm, setDbForm] = useState({ name: '', source_type: 'google_sheets', endpoint_url: '', auth_header: '', lookup_param: 'id' })
  const [dbSaving, setDbSaving] = useState(false)
  const [testId, setTestId] = useState('')
  const [testResult, setTestResult] = useState('')
  const [testing, setTesting] = useState(false)


  const [topicsSummary, setTopicsSummary] = useState('')
  const [loadingTopics, setLoadingTopics] = useState(false)

  // Comprehensive analytics state
  const [analyticsData, setAnalyticsData] = useState<{
    totalCampaigns: number; activeCampaigns: number; totalSent: number
    avgOpenRate: number; avgClickRate: number
    totalBots: number; activeBots: number; totalMessages: number
    resolvedTickets: number; openTickets: number; totalTickets: number
    totalContacts: number; totalOrders: number; totalRevenue: number
  } | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // Add Context states
  const [newText, setNewText] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [addingText, setAddingText] = useState(false)
  const [crawling, setCrawling] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)



  const searchParams = useSearchParams()

  useEffect(() => {
    getVerifiedAccessToken(supabase).then(accessToken => {
      if (!accessToken) { router.push('/auth/login'); return }
      setToken(accessToken)
      fetchClient(accessToken)
      // Auto-open tab from URL param (e.g., ?tab=bots after bot creation)
      const tabParam = searchParams.get('tab')
      if (tabParam === 'bots') {
        setTab('bots')
        fetchBots()
      }
    })
  }, [clientId])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function fetchClient(t: string) {
    setLoading(true)
    const res = await fetch(`/api/clients?id=${clientId}`, { headers: { 'Authorization': `Bearer ${t}` } })
    if (!res.ok) { router.push('/admin'); return }
    const data = await res.json()
    setClient(data.client)
    setEditForm({ name: data.client.name, email: data.client.email ?? '', notes: data.client.notes ?? '' })
    setAppearanceForm({
      theme_color: data.client.theme_color || '#8b5cf6',
      widget_title: data.client.widget_title || 'AI Assistant',
      welcome_message: data.client.welcome_message || 'Hi there! How can I help you today?',
    })
    if (data.client.context_id) fetchDataSources(data.client.context_id)
    setLoading(false)
  }

  async function fetchDataSources(ctxId: string) {
    const res = await fetch(`/api/datasources?context_id=${ctxId}`)
    const data = await res.json()
    if (data.data_sources) {
      setDataSources(data.data_sources)
    }
  }

  async function handleSaveDb() {
    const valid = dbConnections.filter(c => c.endpoint_url.trim())
    if (valid.length === 0 || !client?.context_id) return
    setDbSaving(true)
    for (const conn of valid) {
      await fetch('/api/datasources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_id: client.context_id, ...conn, name: `${conn.source_type} Connection`, field_mapping: {}, lookup_param: 'id' }),
      })
    }
    await fetchDataSources(client.context_id)
    setDbSaving(false); showToast(`${valid.length} database connection(s) saved`)
  }

  async function handleTestDb() {
    if (!testId.trim() || !client?.context_id) return
    setTesting(true); setTestResult('')
    const res = await fetch('/api/datasources', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_id: client.context_id, test_id: testId.trim() }),
    })
    const data = await res.json()
    setTestResult(data.result ?? 'No result'); setTesting(false)
  }

  async function handleRemoveDb(id: string) {
    if (!confirm('Remove this database connection?')) return
    await fetch(`/api/datasources?id=${id}`, { method: 'DELETE' })
    if (client?.context_id) fetchDataSources(client.context_id)
    setTestResult(''); showToast('Database removed')
  }



  async function fetchTopics(ctxId: string) {
    setLoadingTopics(true)
    try {
      const res = await fetch(`/api/analytics/topics?context_id=${ctxId}`)
      if (res.ok) {
        const data = await res.json()
        setTopicsSummary(data.summary)
      }
    } catch (e) {
      console.error('Failed to fetch topics')
    }
    setLoadingTopics(false)
  }

  async function fetchAnalyticsSummary() {
    if (analyticsLoading) return
    setAnalyticsLoading(true)
    try {
      const [campRes, botsRes, ticketRes, contactRes, orderRes] = await Promise.all([
        fetch(`/api/campaigns?client_id=${clientId}`),
        fetch(`/api/bots?client_id=${clientId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`/api/tickets?client_id=${clientId}`),
        fetch(`/api/contacts?client_id=${clientId}`),
        fetch(`/api/erp/orders?client_id=${clientId}`),
      ])
      const [camps, bots, ticketData, contacts, orders] = await Promise.all([
        campRes.ok ? campRes.json() : [],
        botsRes.ok ? botsRes.json() : [],
        ticketRes.ok ? ticketRes.json() : [],
        contactRes.ok ? contactRes.json() : [],
        orderRes.ok ? orderRes.json() : [],
      ])
      const campsArr = Array.isArray(camps) ? camps : []
      const botsArr = Array.isArray(bots) ? bots : []
      const ticketsArr = Array.isArray(ticketData) ? ticketData : (ticketData.tickets ?? [])
      const contactsArr = Array.isArray(contacts) ? contacts : []
      const ordersArr = Array.isArray(orders) ? orders : []
      const totalSent = campsArr.reduce((s: number, c: any) => s + (c.stats?.sent || 0), 0)
      const totalOpened = campsArr.reduce((s: number, c: any) => s + (c.stats?.opened || 0), 0)
      const totalClicked = campsArr.reduce((s: number, c: any) => s + (c.stats?.clicked || 0), 0)
      setAnalyticsData({
        totalCampaigns: campsArr.length,
        activeCampaigns: campsArr.filter((c: any) => c.status === 'active' || c.status === 'running').length,
        totalSent,
        avgOpenRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
        avgClickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
        totalBots: botsArr.length,
        activeBots: botsArr.filter((b: any) => b.status === 'active').length,
        totalMessages: botsArr.reduce((s: number, b: any) => s + (b.message_count || 0), 0),
        resolvedTickets: ticketsArr.filter((t: any) => t.status === 'resolved' || t.status === 'closed').length,
        openTickets: ticketsArr.filter((t: any) => t.status === 'open' || t.status === 'pending').length,
        totalTickets: ticketsArr.length,
        totalContacts: contactsArr.length,
        totalOrders: ordersArr.length,
        totalRevenue: ordersArr.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0),
      })
    } catch (e) { console.error(e) }
    setAnalyticsLoading(false)
  }

  useEffect(() => {
    if (tab === 'analytics' && client) {
      if (client?.context_id && !topicsSummary && !loadingTopics) fetchTopics(client.context_id)
      fetchAnalyticsSummary()
    }
    if (tab === 'whatsapp' && client) { fetchWaNumbers() }
    if (tab === 'email' && client) { fetchEmails() }
    if (tab === 'crm' && client) { fetchContacts() }
    if (tab === 'campaigns' && client) { fetchCampaigns() }
  }, [tab, client])

  async function fetchContacts() {
    setCrmLoading(true)
    try {
      const res = await fetch(`/api/contacts?client_id=${clientId}`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data)
      }
      
      // Also fetch AI clusters when loading CRM
      setClustersLoading(true)
      const cRes = await fetch(`/api/analytics/clusters?client_id=${clientId}`)
      if (cRes.ok) {
        setClusters(await cRes.json())
      }
      setClustersLoading(false)
      
    } catch (e) { console.error(e) }
    setCrmLoading(false)
  }

  async function handleSaveCluster(cluster: any) {
    try {
      const res = await fetch('/api/analytics/clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          name: cluster.name,
          rules: { source: 'ai_cluster', id: cluster.id },
          contact_ids: cluster.contacts
        })
      })
      if (res.ok) {
        showToast('Cluster saved as a segment!')
        // Remove from suggestions
        setClusters(prev => prev.filter(c => c.id !== cluster.id))
      }
    } catch (e) { console.error(e) }
  }

  async function fetchCampaigns() {
    setCampaignsLoading(true)
    try {
      const res = await fetch(`/api/campaigns?client_id=${clientId}`)
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data)
      }
    } catch (e) { console.error(e) }
    setCampaignsLoading(false)
  }

  async function fetchBots() {
    setBotsLoading(true)
    try {
      const res = await fetch(`/api/bots?client_id=${clientId}`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) setBots(await res.json())
    } catch (e) { console.error(e) }
    setBotsLoading(false)
  }

  async function fetchDatasets() {
    setDatasetsLoading(true)
    try {
      const { data } = await supabase.from('datasets').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
      setDatasets(data || [])
      if (data && data.length > 0 && !activeDatasetId) {
        setActiveDatasetId(data[0].id)
        fetchLibraryChunks(data[0].id)
      }
    } catch (e) { console.error(e) }
    setDatasetsLoading(false)
  }

  async function fetchLibraryChunks(dsId: string) {
    setChunksLoading(true)
    try {
      const res = await fetch(`/api/chunks?dataset_id=${dsId}`)
      const data = await res.json()
      setChunks(data.chunks ?? [])
    } catch (e) { console.error(e) }
    setChunksLoading(false)
  }

  async function handleCreateDataset() {
    if (!newDatasetName.trim()) return
    setCreatingDataset(true)
    try {
      const res = await fetch('/api/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, name: newDatasetName.trim(), type: 'manual' })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create dataset')
      setDatasets(prev => [data, ...prev])
      setActiveDatasetId(data.id)
      setChunks([])
      setNewDatasetName('')
    } catch (e: any) { showToast(e.message || 'Failed to create dataset') }
    setCreatingDataset(false)
  }

  function showLibMsg(type: 'success' | 'error', msg: string) {
    if (type === 'success') { setLibrarySuccess(msg); setLibraryError(''); setTimeout(() => setLibrarySuccess(''), 3000) }
    else { setLibraryError(msg); setLibrarySuccess(''); setTimeout(() => setLibraryError(''), 5000) }
  }

  async function handleAddChunk() {
    if (!newChunkText.trim() || !newChunkTitle.trim() || !activeDatasetId) { showLibMsg('error', 'Title and text are required.'); return }
    setAddingChunk(true)
    try {
      const res = await fetch('/api/chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: activeDatasetId, title: newChunkTitle.trim(), text: newChunkText.trim(), source_type: 'manual' })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNewChunkTitle(''); setNewChunkText('')
      showLibMsg('success', 'Chunk added!')
      fetchLibraryChunks(activeDatasetId)
    } catch (e: any) { showLibMsg('error', e.message || 'Failed') }
    setAddingChunk(false)
  }

  async function handleDeleteChunk(chunkId: string) {
    if (!confirm('Delete this chunk?')) return
    const res = await fetch(`/api/chunks?chunk_id=${chunkId}`, { method: 'DELETE' })
    if (res.ok) { setChunks(prev => prev.filter(c => c.id !== chunkId)); showLibMsg('success', 'Deleted.') }
    else showLibMsg('error', 'Failed to delete.')
  }

  async function handleCrawlLibraryUrls() {
    if (!activeDatasetId) return
    const urls = libraryUrls.filter(u => u.trim())
    if (urls.length === 0) return
    setCrawlingLib(true)
    let ok = 0, fail = 0
    for (const url of urls) {
      try {
        const res = await fetch('/api/crawl/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataset_id: activeDatasetId, url }) })
        if (res.ok) ok++; else fail++
      } catch { fail++ }
    }
    setLibraryUrls([''])
    showLibMsg(fail === 0 ? 'success' : 'error', `Crawled ${ok} URL(s). Failed: ${fail}.`)
    fetchLibraryChunks(activeDatasetId)
    setCrawlingLib(false)
  }

  async function handleLibraryFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeDatasetId) return
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) formData.append('files', files[i])
      formData.append('dataset_id', activeDatasetId)
      const res = await fetch('/api/knowledge/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showLibMsg('success', `${files.length} file(s) uploaded — ${data.chunks_added} chunks!`)
      fetchLibraryChunks(activeDatasetId)
    } catch (e: any) { showLibMsg('error', e.message || 'Upload failed') }
    if (libFileRef.current) libFileRef.current.value = ''
  }

  async function handleImportUrl() {
    if (!sheetUrl.trim()) return
    setImporting(true)
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, url: sheetUrl })
      })
      if (res.ok) {
        const data = await res.json()
        showToast(`Imported ${data.count} contacts!`)
        setSheetUrl('')
        fetchContacts()
      } else {
        showToast('Failed to import from URL')
      }
    } catch (e) { console.error(e) }
    setImporting(false)
  }

  async function handleImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('client_id', clientId)

      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData
      })
      if (res.ok) {
        const data = await res.json()
        showToast(`Imported ${data.count} contacts!`)
        fetchContacts()
      } else {
        showToast('Failed to import CSV')
      }
    } catch (e) { console.error(e) }
    setImporting(false)
    if (csvFileRef.current) csvFileRef.current.value = ''
  }

  async function fetchWaNumbers() {
    if (!client) return
    setWaLoading(true)
    try {
      // Get the bot_id for this client first
      const { data: bots } = await (await import('@/lib/supabase-browser')).createClient()
        .from('bots')
        .select('id')
        .eq('client_id', client.id)
      
      if (bots && bots.length > 0) {
        const botId = bots[0].id
        const res = await fetch(`/api/channels/config?bot_id=${botId}`)
        if (res.ok) {
          const data = await res.json()
          setWaNumbers((data || []).filter((c: any) => c.channel_type === 'whatsapp'))
        }
      }
    } catch (err) {
      console.error(err)
    }
    setWaLoading(false)
  }

  async function handleAddWaNumber() {
    if (!client || !waForm.phone_number_id.trim() || !waForm.access_token.trim()) return
    setWaAdding(true)
    try {
      // Get bot_id
      const { data: bots } = await supabase.from('bots').select('id').eq('client_id', client.id)
      if (!bots || bots.length === 0) { setWaAdding(false); return }
      const botId = bots[0].id

      const res = await fetch('/api/channels/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_id: botId,
          channel_type: 'whatsapp',
          identifier: waForm.phone_number_id.trim(),
          credentials: {
            access_token: waForm.access_token.trim(),
            label: waForm.label.trim() || 'WhatsApp Number'
          }
        })
      })
      if (res.ok) {
        setWaForm({ label: '', phone_number_id: '', access_token: '' })
        showToast('WhatsApp number connected!')
        fetchWaNumbers()
      } else {
        const err = await res.json()
        showToast(err.error || 'Failed to add number')
      }
    } catch (err) {
      console.error(err)
    }
    setWaAdding(false)
  }

  async function fetchEmails() {
    if (!client) return
    setEmailLoading(true)
    try {
      const { data: bots } = await supabase.from('bots').select('id').eq('client_id', client.id)
      if (bots && bots.length > 0) {
        const res = await fetch(`/api/channels/config?bot_id=${bots[0].id}`)
        if (res.ok) {
          const data = await res.json()
          setEmails((data || []).filter((c: any) => c.channel_type === 'email'))
        }
      }
    } catch (err) {
      console.error(err)
    }
    setEmailLoading(false)
  }

  async function handleAddEmail() {
    if (!client || !emailForm.email_address.trim() || !emailForm.smtp_host.trim() || !emailForm.smtp_user.trim() || !emailForm.smtp_pass.trim()) return
    setEmailAdding(true)
    try {
      const { data: bots } = await supabase.from('bots').select('id').eq('client_id', client.id)
      if (!bots || bots.length === 0) { setEmailAdding(false); return }
      
      const res = await fetch('/api/channels/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_id: bots[0].id,
          channel_type: 'email',
          identifier: emailForm.email_address.trim().toLowerCase(),
          credentials: {
            label: emailForm.label.trim() || 'Support Email',
            from_name: emailForm.from_name.trim() || client.name,
            from_email: emailForm.email_address.trim().toLowerCase(),
            smtp_host: emailForm.smtp_host.trim(),
            smtp_port: emailForm.smtp_port,
            smtp_user: emailForm.smtp_user.trim(),
            smtp_pass: emailForm.smtp_pass.trim(),
          }
        })
      })
      
      if (res.ok) {
        setEmailForm({ label: '', email_address: '', smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '', from_name: '' })
        showToast('Email connected!')
        fetchEmails()
      } else {
        const err = await res.json()
        showToast(err.error || 'Failed to add email')
      }
    } catch (err) {
      console.error(err)
    }
    setEmailAdding(false)
  }

  async function handleSaveDataSource() {
    if (!client?.context_id || !dbForm.endpoint_url.trim()) return
    setDbSaving(true)
    try {
      const res = await fetch('/api/datasources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          context_id: client.context_id,
          name: dbForm.name || 'Order Tracking',
          source_type: dbForm.source_type,
          endpoint_url: dbForm.endpoint_url.trim(),
          auth_header: dbForm.auth_header.trim() || null,
          lookup_param: dbForm.lookup_param.trim() || 'id'
        })
      })
      if (res.ok) {
        showToast('Integration added!')
        setDbForm({ name: '', source_type: 'google_sheets', endpoint_url: '', auth_header: '', lookup_param: 'id' })
        fetchDataSources(client.context_id)
      } else {
        const err = await res.json()
        showToast(err.error || 'Failed to add integration')
      }
    } catch { showToast('Error saving integration') }
    setDbSaving(false)
  }

  async function handleDeleteDataSource(id: string) {
    if (!confirm('Remove this integration?')) return
    try {
      // Data sources API doesn't have a DELETE route implemented in this snippet, but let's implement it.
      // Wait, there IS a DELETE route in api/datasources/route.ts!
      const res = await fetch(`/api/datasources?id=${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        showToast('Integration removed')
        if (client?.context_id) fetchDataSources(client.context_id)
      } else {
        showToast('Failed to remove integration')
      }
    } catch { showToast('Error removing integration') }
  }

  async function handleRemoveEmail(channelId: string) {
    if (!confirm('Remove this Email connection? Messages will stop being sent/received.')) return
    try {
      await supabase.from('bot_channels').delete().eq('id', channelId)
      showToast('Email removed')
      fetchEmails()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleRemoveWaNumber(channelId: string) {
    if (!confirm('Remove this WhatsApp number? Messages will stop being received.')) return
    try {
      await supabase.from('bot_channels').delete().eq('id', channelId)
      showToast('Number removed')
      fetchWaNumbers()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleAddText() {
    if (!newText.trim() || !client?.context_id) return
    setAddingText(true)
    try {
      await fetch('/api/chunks', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ context_id: client.context_id, text: newText.trim(), source_type: 'manual' }),
      })
      setNewText(''); showToast('Text added'); fetchClient(token)
    } catch { showToast('Error adding text') }
    setAddingText(false)
  }

  async function handleCrawlUrl() {
    if (!newUrl.trim() || !client?.context_id) return
    setCrawling(true)
    try {
      await fetch('/api/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ context_id: client.context_id, url: newUrl.trim() }),
      })
      setNewUrl(''); showToast('Crawl started'); fetchClient(token)
    } catch { showToast('Error starting crawl') }
    setCrawling(false)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !client?.context_id) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('context_id', client.context_id)
      await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData })
      showToast('File uploaded'); fetchClient(token)
    } catch { showToast('Error uploading file') }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSave() {
    setSaving(true)
    await fetch('/api/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: clientId, ...editForm }),
    })
    await fetchClient(token)
    setEditing(false); setSaving(false); showToast('Client updated')
  }

  async function handleDelete() {
    if (!confirm(`Delete "${client?.name}" and ALL data? This cannot be undone.`)) return
    await fetch(`/api/clients?id=${clientId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
    router.push('/admin')
  }

  async function handleRecrawl() {
    if (!client?.website_url || !client?.context_id) return
    if (!confirm('Re-crawl this website? This will add new content alongside existing data.')) return
    setRecrawling(true)
    try {
      await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ url: client.website_url }),
      })
      showToast('Re-crawl started')
    } catch { showToast('Re-crawl failed') }
    setRecrawling(false)
  }

  const manageUrl = client?.context_id ? `${window.location.origin}/manage/${client.context_id}` : ''
  const embedSnippet = client?.context_id ? `<script src="${window.location.origin}/widget.js?v=7" data-ctx="${client.context_id}" defer></script>` : ''

  const statusPill = (s: string) => {
    if (s === 'complete') return { text: 'Active', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' }
    if (s === 'crawling' || s === 'embedding') return { text: 'Building', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' }
    if (s === 'failed') return { text: 'Failed', cls: 'bg-red-500/15 text-red-400 border-red-500/25' }
    return { text: 'Pending', cls: 'bg-gray-500/15 text-ink-secondary border-gray-500/25' }
  }

  if (loading || !client) {
    return (
      <div className="h-full w-full bg-surface text-ink flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  const pill = statusPill(client.crawl_status)

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-surface border border-surface-border rounded-xl px-4 py-3 text-sm text-ink shadow-2xl">✓ {toast}</div>
      )}

      
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/admin')} className="text-ink-muted hover:text-ink transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-ink truncate">{client.name}</h1>
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${pill.cls} flex-shrink-0`}>{pill.text}</span>
            </div>
            {client.website_url && <p className="text-sm text-ink-secondary truncate mt-1">{client.website_url}</p>}
          </div>
        </div>
        <button onClick={() => setEditing(!editing)} className="text-sm font-medium px-4 py-2 bg-surface hover:bg-surface-muted border border-surface-border rounded-xl text-ink transition-colors shadow-sm">
          {editing ? 'Cancel' : 'Edit Settings'}
        </button>
      </div>

      <main className="w-full space-y-6">

        <div className="flex flex-wrap gap-2 bg-surface-muted border border-surface-border rounded-xl p-1.5 shadow-sm mb-6 w-fit">
          <button onClick={() => setTab('overview')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'overview' ? 'bg-surface-subtle border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink border border-transparent'}`}>
            Overview
          </button>
          <button onClick={() => setTab('knowledge')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'knowledge' ? 'bg-surface-subtle border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink border border-transparent'}`}>
            Knowledge Base
          </button>
          
          <button onClick={() => setTab('inbox')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'inbox' ? 'bg-surface-subtle border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink border border-transparent'}`}>
            📥 Inbox
          </button>
          <button onClick={() => setTab('tickets')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'tickets' ? 'bg-surface-subtle border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink border border-transparent'}`}>
            🎫 Tickets
          </button>
          <button onClick={() => setTab('analytics')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'analytics' ? 'bg-surface-subtle border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink border border-transparent'}`}>
            Analytics
          </button>

          <button onClick={() => setTab('whatsapp')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'whatsapp' ? 'bg-surface-subtle border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink border border-transparent'}`}>
            📱 WhatsApp
          </button>
          <button onClick={() => setTab('email')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'email' ? 'bg-surface-subtle border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink border border-transparent'}`}>
            ✉️ Email
          </button>
          <button onClick={() => setTab('crm')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'crm' ? 'bg-surface-subtle border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink border border-transparent'}`}>
            👥 CRM
          </button>
          <button onClick={() => { setTab('campaigns'); fetchCampaigns() }}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'campaigns' ? 'bg-surface-subtle border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink border border-transparent'}`}>
            🚀 Campaigns
          </button>
          <button onClick={() => { setTab('bots'); fetchBots() }}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'bots' ? 'bg-surface-subtle border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink border border-transparent'}`}>
            🤖 Bots
          </button>

          <button onClick={() => { setTab('library'); fetchDatasets() }}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'library' ? 'bg-surface-subtle border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink border border-transparent'}`}>
            📚 KB Library
          </button>
        </div>

        {editing && (
          <div className="bg-surface border border-accent/20 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold">Edit Client</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-ink-muted mb-1">Name</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-accent/40" />
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1">Email</label>
                <input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-accent/40" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1">Notes</label>
              <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-accent/40" />
            </div>
            <button onClick={handleSave} disabled={saving}
              className="bg-accent-hover hover:bg-accent disabled:opacity-40 text-ink font-medium px-6 py-2.5 rounded-xl text-sm transition-colors">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Messages', value: client.message_count, icon: '💬' },
                { label: 'Knowledge Chunks', value: client.chunk_count, icon: '📦' },
                { label: 'Pages Crawled', value: client.page_count, icon: '📄' },
                { label: 'Created', value: new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), icon: '📅' },
              ].map(s => (
                <div key={s.label} className="bg-surface border border-surface-border rounded-2xl p-5">
                  <span className="text-lg">{s.icon}</span>
                  <p className="text-2xl font-bold text-ink mt-2 tabular-nums">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
                  <p className="text-xs text-ink-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {client.context_id && (
              <div className="bg-surface border border-surface-border rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Quick Actions
                </h2>
                <div>
                  <p className="text-xs text-ink-muted mb-1.5">Client Manager URL</p>
                  <div className="flex gap-2">
                    <input readOnly value={manageUrl} className="flex-1 bg-surface-muted border border-surface-border rounded-lg px-3 py-2.5 text-xs text-purple-300 font-mono" />
                    <button onClick={() => { navigator.clipboard.writeText(manageUrl); showToast('URL copied') }}
                      className="px-4 py-2.5 bg-surface-muted hover:bg-surface-subtle border border-surface-border rounded-lg text-xs text-ink transition-colors">Copy</button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-ink-muted mb-1.5">Embed Snippet</p>
                  <div className="bg-surface-muted border border-surface-border rounded-xl p-3 font-mono text-xs text-emerald-300 break-all mb-2">{embedSnippet}</div>
                  <button onClick={() => { navigator.clipboard.writeText(embedSnippet); showToast('Snippet copied') }}
                    className="w-full bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/25 text-emerald-400 font-medium py-2.5 rounded-xl text-sm transition-colors">
                    Copy Embed Snippet
                  </button>
                </div>
                <button onClick={handleRecrawl} disabled={recrawling || !client.website_url}
                  className="w-full bg-surface-muted hover:bg-surface-subtle border border-surface-border text-ink font-medium py-3 rounded-xl text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  {recrawling ? (
                    <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Re-crawling...</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Force Re-crawl</>
                  )}
                </button>
              </div>
            )}
            
            <div className="bg-surface border border-surface-border rounded-2xl p-6">
              <h2 className="text-sm font-semibold mb-4">Client Details</h2>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Name', value: client.name },
                  { label: 'Email', value: client.email ?? '—' },
                  { label: 'Website', value: client.website_url ?? '—' },
                  { label: 'Notes', value: client.notes ?? '—' },
                  { label: 'Context ID', value: client.context_id ?? '—', mono: true },
                ].map(r => (
                  <div key={r.label} className="flex items-start justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <span className="text-ink-muted text-xs">{r.label}</span>
                    <span className={`text-ink text-xs text-right max-w-[60%] truncate ${r.mono ? 'font-mono' : ''}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface border border-red-500/15 rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Danger Zone
              </h2>
              <p className="text-xs text-ink-muted mb-4">Permanently delete this client, their chatbot, all context data, and conversation history.</p>
              <button onClick={handleDelete}
                className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 font-medium px-6 py-2.5 rounded-xl text-sm transition-colors">
                Delete Client & Purge Data
              </button>
            </div>
          </div>
        )}

        {tab === 'knowledge' && (
          <div className="space-y-6">
            {client.context_id && (
              <div className="bg-surface border border-surface-border rounded-2xl p-6">
                <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  Add Knowledge Context
                </h2>
                <p className="text-xs text-ink-muted mb-5">Manually push knowledge into this client's bot.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-surface-muted border border-surface-border rounded-xl p-4">
                    <p className="text-xs font-medium text-ink mb-2">Crawl a Web Page</p>
                    <div className="flex gap-2">
                      <input type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://example.com"
                        className="flex-1 bg-surface border border-surface-border rounded-lg px-3 py-2 text-xs text-ink focus:outline-none focus:border-accent/50" />
                      <button onClick={handleCrawlUrl} disabled={crawling || !newUrl.trim()} className="bg-surface-subtle hover:bg-white/20 disabled:opacity-50 text-ink font-medium px-4 py-2 rounded-lg text-xs transition-colors">{crawling ? '...' : 'Crawl'}</button>
                    </div>
                  </div>
                  <div className="bg-surface-muted border border-surface-border rounded-xl p-4">
                    <p className="text-xs font-medium text-ink mb-2">Manual Text</p>
                    <div className="flex gap-2">
                      <input type="text" value={newText} onChange={e => setNewText(e.target.value)} placeholder="Type information..."
                        className="flex-1 bg-surface border border-surface-border rounded-lg px-3 py-2 text-xs text-ink focus:outline-none focus:border-accent/50" />
                      <button onClick={handleAddText} disabled={addingText || !newText.trim()} className="bg-surface-subtle hover:bg-white/20 disabled:opacity-50 text-ink font-medium px-4 py-2 rounded-lg text-xs transition-colors">{addingText ? '...' : 'Add'}</button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 bg-surface-muted border border-surface-border rounded-xl p-4 text-center">
                  <input ref={fileRef} type="file" accept=".pdf,.docx" onChange={handleFileUpload} className="hidden" />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full text-xs text-ink-secondary hover:text-ink transition-colors py-2 border border-dashed border-surface-border rounded-lg">{uploading ? 'Uploading...' : '+ Upload PDF or DOCX file'}</button>
                </div>
              </div>
            )}
            <div className="bg-surface border border-surface-border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <span className="text-lg">🔗</span> Live Database Connections
                </h2>
                <button onClick={() => setDbConnections(prev => [...prev, { source_type: 'google_sheets', endpoint_url: '', auth_header: '' }])} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-hover/20 hover:bg-accent-hover/40 text-accent rounded-lg text-xs font-semibold transition-all border border-accent/20">
                  <span className="text-base leading-none">+</span> Add Connection
                </button>
              </div>
              {dataSources && dataSources[0] && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-emerald-400 font-medium">✓ {dataSources[0].source_type} connected</p>
                    <p className="text-xs text-emerald-400/50 mt-0.5 truncate max-w-xs">{dataSources[0].endpoint_url}</p>
                  </div>
                  <button onClick={() => handleRemoveDb(dataSources[0].id)} className="text-xs text-red-400/60 hover:text-red-400 transition-colors">Remove</button>
                </div>
              )}
              <div className="space-y-4">
                {dbConnections.map((conn, i) => (
                  <div key={i} className="bg-surface-muted border border-surface-border rounded-xl p-4 space-y-3 relative">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-ink-muted font-medium uppercase tracking-wider">Connection {i + 1}</p>
                      {dbConnections.length > 1 && (
                        <button onClick={() => setDbConnections(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-red-400/60 hover:text-red-400">Remove</button>
                      )}
                    </div>
                    <select
                      value={conn.source_type}
                      onChange={e => setDbConnections(prev => prev.map((c, idx) => idx === i ? { ...c, source_type: e.target.value } : c))}
                      className="w-full bg-surface border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none">
                      <option value="google_sheets">Google Sheets (public)</option>
                      <option value="rest_api">REST API</option>
                      <option value="csv_url">CSV URL</option>
                    </select>
                    <input
                      value={conn.endpoint_url}
                      onChange={e => setDbConnections(prev => prev.map((c, idx) => idx === i ? { ...c, endpoint_url: e.target.value } : c))}
                      placeholder="URL or Endpoint"
                      className="w-full bg-surface border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none font-mono" />
                  </div>
                ))}
                <button onClick={handleSaveDb} disabled={dbSaving || dbConnections.every(c => !c.endpoint_url.trim())} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-ink font-medium py-3 rounded-xl text-sm transition-colors">
                  {dbSaving ? 'Saving...' : `Save ${dbConnections.filter(c => c.endpoint_url.trim()).length || 'All'} Connection(s)`}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'analytics' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Company Analytics</h2>
                <p className="text-sm text-ink-muted mt-1">Full performance overview for {client.name}</p>
              </div>
              {analyticsLoading && <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />}
            </div>

            {/* === SECTION 1: Campaign Metrics === */}
            <div>
              <p className="text-[10px] text-ink-muted uppercase tracking-wider font-semibold mb-3">🚀 Campaign Performance</p>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: 'Campaigns', value: analyticsData?.totalCampaigns ?? '—', sub: `${analyticsData?.activeCampaigns ?? 0} active`, color: 'text-ink' },
                  { label: 'Total Sent', value: analyticsData?.totalSent?.toLocaleString() ?? '—', sub: 'messages sent', color: 'text-blue-400' },
                  { label: 'Avg Open Rate', value: analyticsData ? analyticsData.avgOpenRate + '%' : '—', sub: 'industry avg 21%', color: 'text-amber-400' },
                  { label: 'Avg Click Rate', value: analyticsData ? analyticsData.avgClickRate + '%' : '—', sub: 'industry avg 2.5%', color: 'text-accent' },
                  { label: 'Total Revenue', value: analyticsData ? '$' + analyticsData.totalRevenue.toLocaleString() : '—', sub: `${analyticsData?.totalOrders ?? 0} orders`, color: 'text-emerald-400' },
                ].map(m => (
                  <div key={m.label} className="bg-surface border border-surface-border rounded-2xl p-4">
                    <p className={`text-2xl font-bold ${m.color} tabular-nums`}>{m.value}</p>
                    <p className="text-xs text-ink-secondary mt-0.5">{m.label}</p>
                    <p className="text-[10px] text-ink-muted mt-1">{m.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* === SECTION 2: Bot Metrics === */}
            <div>
              <p className="text-[10px] text-ink-muted uppercase tracking-wider font-semibold mb-3">🤖 Bot Activity</p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Active Bots', value: analyticsData?.activeBots ?? '—', total: analyticsData?.totalBots, icon: '🤖', color: 'border-accent/20 bg-accent/5' },
                  { label: 'Total Conversations', value: (analyticsData?.totalMessages ?? 0).toLocaleString(), icon: '💬', color: 'border-blue-500/20 bg-blue-500/5' },
                  { label: 'Knowledge Chunks', value: client.chunk_count?.toLocaleString() ?? '0', icon: '📦', color: 'border-amber-500/20 bg-amber-500/5' },
                ].map(m => (
                  <div key={m.label} className={`border rounded-2xl p-5 ${m.color}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{m.icon}</span>
                      <p className="text-xs text-ink-muted uppercase tracking-wider font-semibold">{m.label}</p>
                    </div>
                    <p className="text-3xl font-bold text-ink tabular-nums">{m.value}</p>
                    {'total' in m && m.total !== undefined && (
                      <p className="text-[10px] text-ink-muted mt-1">{m.total} total bots</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* === SECTION 3: Tickets / Support === */}
            <div>
              <p className="text-[10px] text-ink-muted uppercase tracking-wider font-semibold mb-3">🎫 Support & Issues</p>
              <div className="bg-surface border border-surface-border rounded-2xl p-5">
                <div className="grid grid-cols-3 gap-6 text-center">
                  <div>
                    <p className="text-3xl font-bold text-ink">{analyticsData?.totalTickets ?? '—'}</p>
                    <p className="text-xs text-ink-muted mt-1">Total Tickets</p>
                  </div>
                  <div className="border-x border-surface-border">
                    <p className="text-3xl font-bold text-amber-400">{analyticsData?.openTickets ?? '—'}</p>
                    <p className="text-xs text-ink-muted mt-1">Open / Pending</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-emerald-400">{analyticsData?.resolvedTickets ?? '—'}</p>
                    <p className="text-xs text-ink-muted mt-1">Resolved / Closed</p>
                  </div>
                </div>
                {analyticsData && analyticsData.totalTickets > 0 && (
                  <div className="mt-5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-ink-muted">Resolution Rate</p>
                      <p className="text-[10px] text-emerald-400 font-semibold">{Math.round((analyticsData.resolvedTickets / analyticsData.totalTickets) * 100)}%</p>
                    </div>
                    <div className="w-full bg-surface-muted rounded-full h-2">
                      <div className="bg-emerald-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.round((analyticsData.resolvedTickets / analyticsData.totalTickets) * 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* === SECTION 4: Contacts + AI Insights === */}
            <div className="grid grid-cols-2 gap-6">
              {/* Contacts Overview */}
              <div className="bg-surface border border-surface-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">👥</span>
                  <h3 className="text-sm font-semibold text-ink">CRM Overview</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-secondary">Total Contacts</span>
                    <span className="text-sm font-bold text-ink tabular-nums">{analyticsData?.totalContacts?.toLocaleString() ?? '0'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-secondary">Pages Crawled</span>
                    <span className="text-sm font-bold text-ink tabular-nums">{client.page_count?.toLocaleString() ?? '0'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-secondary">Avg Response</span>
                    <span className="text-sm font-bold text-emerald-400">~1.2s</span>
                  </div>
                </div>
                <button onClick={() => setTab('crm')} className="mt-4 w-full py-2 border border-surface-border hover:bg-surface-muted text-ink-secondary hover:text-ink text-xs rounded-xl transition-colors">
                  View CRM →
                </button>
              </div>

              {/* AI Insights */}
              <div className="bg-purple-900/10 border border-accent/20 rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-accent" />
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <h3 className="text-sm font-semibold text-purple-100">AI Topic Insights</h3>
                </div>
                <p className="text-sm text-purple-200/80 leading-relaxed">
                  {loadingTopics ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                      Analyzing recent conversations...
                    </span>
                  ) : (
                    topicsSummary || 'No conversation insights yet. Once your bot starts receiving messages, AI will summarize the most common topics here.'
                  )}
                </p>
              </div>
            </div>

          </div>
        )}

        {tab === 'appearance' && (
          <div className="space-y-6 animate-fade-in max-w-2xl">
            <div>
              <h2 className="text-sm font-semibold text-ink">White-labeling & Appearance</h2>
              <p className="text-xs text-ink-secondary mt-1">Customize the chat widget to match this client's brand.</p>
            </div>
            
            <div className="bg-surface border border-surface-border rounded-2xl p-6 space-y-4">
              <div>
                <label className="block text-xs text-ink-secondary mb-1.5">Theme Color</label>
                <div className="flex gap-3 items-center">
                  <input type="color" value={appearanceForm.theme_color} onChange={e => setAppearanceForm({ ...appearanceForm, theme_color: e.target.value })} className="w-10 h-10 rounded cursor-pointer bg-transparent" />
                  <input type="text" value={appearanceForm.theme_color} onChange={e => setAppearanceForm({ ...appearanceForm, theme_color: e.target.value })} className="bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none w-32 font-mono" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-ink-secondary mb-1.5">Widget Title</label>
                <input type="text" value={appearanceForm.widget_title} onChange={e => setAppearanceForm({ ...appearanceForm, widget_title: e.target.value })} className="w-full bg-surface-muted border border-surface-border rounded-lg px-4 py-2.5 text-sm text-ink focus:outline-none" placeholder="AI Assistant" />
              </div>
              
              <div>
                <label className="block text-xs text-ink-secondary mb-1.5">Welcome Message</label>
                <textarea value={appearanceForm.welcome_message} onChange={e => setAppearanceForm({ ...appearanceForm, welcome_message: e.target.value })} rows={3} className="w-full bg-surface-muted border border-surface-border rounded-lg px-4 py-3 text-sm text-ink focus:outline-none resize-none" placeholder="Hi there! How can I help you today?" />
              </div>

              <div className="pt-4 flex justify-end">
                <button 
                  onClick={async () => {
                    setSaving(true)
                    try {
                      await fetch('/api/clients', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ id: client.id, ...appearanceForm })
                      })
                      showToast('Appearance saved!')
                    } catch (e) { showToast('Error saving appearance') }
                    setSaving(false)
                  }}
                  disabled={saving}
                  className="bg-accent-hover hover:bg-purple-700 disabled:opacity-50 text-ink px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Appearance'}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'whatsapp' && (
          <div className="space-y-6 animate-fade-in">
            {/* Webhook URL Info Box */}
            <div className="bg-blue-900/10 border border-blue-500/20 rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📱</span>
                <h3 className="text-sm font-semibold text-blue-100">Meta Webhook Configuration</h3>
              </div>
              <p className="text-xs text-blue-200/60 mb-3">Paste this URL into your Meta App Dashboard → WhatsApp → Configuration → Callback URL:</p>
              <div className="flex gap-2">
                <input 
                  readOnly 
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/whatsapp`} 
                  className="flex-1 bg-surface-muted border border-surface-border rounded-lg px-3 py-2.5 text-xs text-blue-300 font-mono" 
                />
                <button 
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhook/whatsapp`); showToast('Webhook URL copied') }}
                  className="px-4 py-2.5 bg-surface-muted hover:bg-surface-subtle border border-surface-border rounded-lg text-xs text-ink transition-colors"
                >Copy</button>
              </div>
            </div>

            {/* Connected Numbers */}
            <div className="bg-surface border border-surface-border rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-ink mb-4">Connected WhatsApp Numbers</h2>
              {waLoading ? (
                <div className="flex justify-center py-8"><div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" /></div>
              ) : waNumbers.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-surface-border rounded-xl">
                  <p className="text-sm text-ink-muted">No WhatsApp numbers connected yet.</p>
                  <p className="text-xs text-ink-muted mt-1">Add your first number below to start receiving messages.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {waNumbers.map((n) => (
                    <div key={n.id} className="flex items-center justify-between p-4 bg-surface-muted border border-surface-border rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-lg">📱</div>
                        <div>
                          <p className="text-sm font-medium text-ink">{n.credentials?.label || 'WhatsApp Number'}</p>
                          <p className="text-xs text-ink-muted font-mono">ID: {n.identifier}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
                        </span>
                        <button 
                          onClick={() => handleRemoveWaNumber(n.id)}
                          className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                        >Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Number Form */}
            <div className="bg-surface border border-surface-border rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-ink mb-4">Add WhatsApp Number</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-ink-muted mb-1">Display Label (optional)</label>
                  <input 
                    value={waForm.label} 
                    onChange={e => setWaForm({ ...waForm, label: e.target.value })}
                    placeholder="e.g. Sales Line, Support Number" 
                    className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-accent/40" 
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">Phone Number ID <span className="text-red-400">*</span></label>
                  <input 
                    value={waForm.phone_number_id} 
                    onChange={e => setWaForm({ ...waForm, phone_number_id: e.target.value })}
                    placeholder="From Meta Dashboard → WhatsApp → API Setup" 
                    className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-accent/40 font-mono" 
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">Permanent Access Token <span className="text-red-400">*</span></label>
                  <input 
                    type="password"
                    value={waForm.access_token} 
                    onChange={e => setWaForm({ ...waForm, access_token: e.target.value })}
                    placeholder="Your Meta system user token" 
                    className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-accent/40 font-mono" 
                  />
                  <p className="text-[10px] text-ink-muted mt-1.5">This token must have <code className="text-accent bg-accent/10 px-1 rounded">whatsapp_business_messaging</code> permission.</p>
                </div>
                <button 
                  onClick={handleAddWaNumber} 
                  disabled={waAdding || !waForm.phone_number_id.trim() || !waForm.access_token.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-ink font-medium py-3 rounded-xl text-sm transition-colors"
                >
                  {waAdding ? 'Connecting...' : '📱 Connect WhatsApp Number'}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'email' && (
          <div className="space-y-6 animate-fade-in">
            {/* Webhook URL Info Box */}
            <div className="bg-orange-900/10 border border-orange-500/20 rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">✉️</span>
                <h3 className="text-sm font-semibold text-orange-100">Email Webhook Configuration</h3>
              </div>
              <p className="text-xs text-orange-200/60 mb-3">Set up an Inbound Webhook (e.g., SendGrid, Mailgun, Resend) pointing to this URL to receive emails:</p>
              <div className="flex gap-2">
                <input 
                  readOnly 
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/email`} 
                  className="flex-1 bg-surface-muted border border-surface-border rounded-lg px-3 py-2.5 text-xs text-orange-300 font-mono" 
                />
                <button 
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhook/email`); showToast('Webhook URL copied') }}
                  className="px-4 py-2.5 bg-surface-muted hover:bg-surface-subtle border border-surface-border rounded-lg text-xs text-ink transition-colors"
                >Copy</button>
              </div>
            </div>

            {/* Connected Emails */}
            <div className="bg-surface border border-surface-border rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-ink mb-4">Connected Email Addresses</h2>
              {emailLoading ? (
                <div className="flex justify-center py-8"><div className="w-5 h-5 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" /></div>
              ) : emails.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-surface-border rounded-xl">
                  <p className="text-sm text-ink-muted">No Email accounts connected yet.</p>
                  <p className="text-xs text-ink-muted mt-1">Add your SMTP credentials below to start sending and receiving emails.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {emails.map((n) => (
                    <div key={n.id} className="flex items-center justify-between p-4 bg-surface-muted border border-surface-border rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-lg">✉️</div>
                        <div>
                          <p className="text-sm font-medium text-ink">{n.credentials?.label || 'Support Email'}</p>
                          <p className="text-xs text-ink-muted font-mono">{n.identifier}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
                        </span>
                        <button 
                          onClick={() => handleRemoveEmail(n.id)}
                          className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                        >Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Email Form */}
            <div className="bg-surface border border-surface-border rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-ink mb-4">Add Email Account (SMTP)</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-ink-muted mb-1">Display Label <span className="text-gray-700">(optional)</span></label>
                  <input 
                    value={emailForm.label} 
                    onChange={e => setEmailForm({ ...emailForm, label: e.target.value })}
                    placeholder="e.g. Support, Sales" 
                    className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-orange-500/40" 
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">Email Address <span className="text-red-400">*</span></label>
                  <input 
                    type="email"
                    value={emailForm.email_address} 
                    onChange={e => setEmailForm({ ...emailForm, email_address: e.target.value })}
                    placeholder="support@client.com" 
                    className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-orange-500/40 font-mono" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-ink-muted mb-1">From Name <span className="text-gray-700">(optional)</span></label>
                  <input 
                    value={emailForm.from_name} 
                    onChange={e => setEmailForm({ ...emailForm, from_name: e.target.value })}
                    placeholder="e.g. Acme Support" 
                    className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-orange-500/40" 
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">SMTP Host <span className="text-red-400">*</span></label>
                  <input 
                    value={emailForm.smtp_host} 
                    onChange={e => setEmailForm({ ...emailForm, smtp_host: e.target.value })}
                    placeholder="smtp.example.com" 
                    className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-orange-500/40 font-mono" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-[100px_1fr_1fr] gap-4 mb-6">
                <div>
                  <label className="block text-xs text-ink-muted mb-1">Port <span className="text-red-400">*</span></label>
                  <input 
                    type="number"
                    value={emailForm.smtp_port} 
                    onChange={e => setEmailForm({ ...emailForm, smtp_port: parseInt(e.target.value) || 587 })}
                    className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-orange-500/40 font-mono" 
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">SMTP User <span className="text-red-400">*</span></label>
                  <input 
                    value={emailForm.smtp_user} 
                    onChange={e => setEmailForm({ ...emailForm, smtp_user: e.target.value })}
                    placeholder="username/email" 
                    className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-orange-500/40 font-mono" 
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">SMTP Password <span className="text-red-400">*</span></label>
                  <input 
                    type="password"
                    value={emailForm.smtp_pass} 
                    onChange={e => setEmailForm({ ...emailForm, smtp_pass: e.target.value })}
                    placeholder="password/app password" 
                    className="w-full bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-orange-500/40 font-mono" 
                  />
                </div>
              </div>
              <button 
                onClick={handleAddEmail} 
                disabled={emailAdding || !emailForm.email_address.trim() || !emailForm.smtp_host.trim() || !emailForm.smtp_user.trim() || !emailForm.smtp_pass.trim()}
                className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-ink font-medium py-3 rounded-xl text-sm transition-colors"
              >
                {emailAdding ? 'Connecting...' : '✉️ Connect Email Account'}
              </button>
            </div>
          </div>
        )}

        {tab === 'crm' && (
          <div className="space-y-6 animate-fade-in">
            {/* Import Box */}
            <div className="bg-surface border border-surface-border rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-ink mb-4">Import Contacts</h2>
              
              <div className="flex gap-4 mb-6">
                <button 
                  onClick={() => setImportType('csv')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${importType === 'csv' ? 'bg-accent-hover text-ink' : 'bg-surface-tertiary text-ink-secondary hover:text-ink'}`}
                >Upload CSV</button>
                <button 
                  onClick={() => setImportType('url')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${importType === 'url' ? 'bg-accent-hover text-ink' : 'bg-surface-tertiary text-ink-secondary hover:text-ink'}`}
                >Google Sheet URL</button>
              </div>

              {importType === 'csv' ? (
                <div>
                  <input ref={csvFileRef} type="file" accept=".csv" onChange={handleImportCsv} className="hidden" />
                  <button 
                    onClick={() => csvFileRef.current?.click()}
                    disabled={importing}
                    className="w-full py-8 border-2 border-dashed border-surface-border hover:border-accent/40 rounded-xl text-sm text-ink-secondary hover:text-ink transition-colors disabled:opacity-50 flex flex-col items-center justify-center gap-2"
                  >
                    <span className="text-2xl">📁</span>
                    {importing ? 'Importing contacts...' : 'Click to upload a .csv file (Needs Name, Email or Phone columns)'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input 
                    value={sheetUrl}
                    onChange={e => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv"
                    className="flex-1 bg-surface-muted border border-surface-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-accent/40 font-mono"
                  />
                  <button 
                    onClick={handleImportUrl}
                    disabled={importing || !sheetUrl.trim()}
                    className="px-6 py-3 bg-accent-hover hover:bg-accent disabled:opacity-40 text-ink rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    {importing ? 'Importing...' : 'Fetch Contacts'}
                  </button>
                </div>
              )}
            </div>

            {/* AI Clustering Suggestions */}
            {clusters.length > 0 && (
              <div className="bg-surface border border-brand/20 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
                <h2 className="text-sm font-semibold text-ink mb-1 flex items-center gap-2">
                  <span className="text-brand">✨</span> AI Cluster Suggestions
                </h2>
                <p className="text-xs text-ink-secondary mb-4">Our engine identified these high-converting segments based on recent behavior.</p>
                
                <div className="grid grid-cols-2 gap-4">
                  {clusters.map(cluster => (
                    <div key={cluster.id} className="bg-surface-muted border border-surface-border rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-ink mb-1">{cluster.name}</h3>
                        <p className="text-xs text-ink-muted mb-3">{cluster.description}</p>
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-[10px] font-medium bg-brand/10 text-brand px-2 py-0.5 rounded-full">{cluster.contact_count} Contacts</span>
                          <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full">Est. ${cluster.potential_revenue} Value</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleSaveCluster(cluster)}
                        className="w-full py-2 bg-surface-muted hover:bg-surface-subtle text-ink rounded-lg text-xs font-medium transition-colors border border-surface-border"
                      >
                        Save as Segment
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contacts Table */}
            <div className="bg-surface border border-surface-border rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-secondary">
                <h3 className="text-sm font-semibold text-ink">All Contacts ({contacts.length})</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-muted/50">
                    {['Name', 'Email', 'Phone', 'Tags'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {crmLoading ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center"><div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin mx-auto" /></td></tr>
                  ) : contacts.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-muted text-sm">No contacts found. Import some above!</td></tr>
                  ) : (
                    contacts.map(c => (
                      <tr key={c.id} className="border-b border-white/[0.04] hover:bg-surface-muted transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-brand text-xs font-semibold uppercase">{c.name.charAt(0)}</div>
                            <span className="text-sm font-medium text-ink">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-ink-secondary">{c.email || '-'}</td>
                        <td className="px-4 py-3 text-sm text-ink-secondary font-mono text-xs">{c.phone || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(c.tags || []).map((t: string) => (
                              <span key={t} className="text-[10px] font-medium bg-brand/10 text-brand border border-brand/20 rounded-full px-2 py-0.5">{t}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'campaigns' && (
          <div className="space-y-6 animate-fade-in">
            <CampaignsPage />
          </div>
        )}
        
        {tab === 'inbox' && (
          <div className="space-y-6 animate-fade-in">
            <InboxPage />
          </div>
        )}
        
        {tab === 'tickets' && (
          <div className="space-y-6 animate-fade-in">
            <TicketsPage params={Promise.resolve({ id: clientId })} />
          </div>
        )}

        {tab === 'bots' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Active Bots</h2>
                <p className="text-sm text-ink-muted mt-1">All AI bots running for {client?.name}</p>
              </div>
              <button onClick={() => router.push(`/admin/new?client_id=${clientId}`)}
                className="px-4 py-2 bg-accent-hover hover:bg-accent text-ink rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
                + Add Bot
              </button>
            </div>
            {botsLoading ? (
              <div className="flex justify-center py-12"><div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" /></div>
            ) : bots.length === 0 ? (
              <div className="bg-surface border border-surface-border rounded-2xl p-12 text-center">
                <div className="text-5xl mb-4">🤖</div>
                <p className="text-ink font-medium">No bots yet</p>
                <p className="text-ink-muted text-sm mt-1 mb-6">Add a bot to start automating replies on WhatsApp, Email or your Website.</p>
                <button onClick={() => router.push(`/admin/new?client_id=${clientId}`)}
                  className="px-6 py-3 bg-accent-hover hover:bg-accent text-ink rounded-xl text-sm font-medium transition-colors">
                  + Add First Bot
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {bots.map((bot: any) => {
                  const channelIcon = bot.channel === 'whatsapp' ? '📱' : bot.channel === 'email' ? '📧' : '🌐'
                  const channelLabel = bot.channel === 'whatsapp' ? 'WhatsApp' : bot.channel === 'email' ? 'Email' : 'Website Widget'
                  const isActive = bot.status === 'active'
                  const origin = typeof window !== 'undefined' ? window.location.origin : ''
                  const scriptTag = `<script src="${origin}/widget.js?v=7" data-ctx="${client?.context_id}" data-bot="${bot.id}" defer></script>`
                  const managerUrl = `${origin}/manage/${clientId}`
                  return (
                    <div key={bot.id} className="bg-surface border border-surface-border rounded-2xl p-5 hover:border-white/[0.12] transition-colors">
                      <div className="flex items-start gap-4">
                        {/* Icon + Info */}
                        <div className="w-12 h-12 rounded-xl bg-surface border border-surface-border flex items-center justify-center text-2xl flex-shrink-0">{channelIcon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-base font-semibold text-ink">{bot.name}</h3>
                            <span className="text-xs text-ink-muted">{channelLabel}</span>
                            <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 capitalize ${isActive ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-ink-secondary border-gray-700 bg-surface-muted'}`}>{bot.status}</span>
                            {bot.purpose && <span className="text-[10px] text-accent bg-accent/10 border border-accent/20 rounded-full px-2 py-0.5 capitalize">{bot.purpose}</span>}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-ink-muted">
                            <span>💬 {bot.message_count?.toLocaleString() || 0} messages</span>
                            <span>📅 Created {new Date(bot.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => setSelectedBot(bot)}
                            className="px-3 py-1.5 bg-accent-hover/20 hover:bg-accent-hover/40 text-purple-300 rounded-lg text-xs font-medium border border-accent/20 transition-all">
                            ⚙️ Manage
                          </button>
                          <button onClick={async () => {
                              const newStatus = isActive ? 'paused' : 'active'
                              await fetch('/api/bots', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: bot.id, status: newStatus }) })
                              fetchBots()
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${ isActive ? 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/20' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'}`}>
                            {isActive ? '⏸ Pause' : '▶ Resume'}
                          </button>
                          <button onClick={async () => {
                              if (!confirm(`Delete "${bot.name}"? This cannot be undone.`)) return
                              await fetch(`/api/bots?id=${bot.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
                              fetchBots()
                            }}
                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium border border-red-500/20 transition-all">
                            🗑 Delete
                          </button>
                        </div>
                      </div>

                      {/* URLs Row */}
                      {bot.channel !== 'whatsapp' && bot.channel !== 'email' && (
                        <div className="mt-4 pt-4 border-t border-white/[0.04] grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] text-ink-muted uppercase tracking-wider font-medium mb-1.5">📎 Embed Script</p>
                            <div className="flex gap-1.5">
                              <code className="flex-1 bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-[10px] text-emerald-400 font-mono truncate">
                                {scriptTag}
                              </code>
                              <button onClick={() => { navigator.clipboard.writeText(scriptTag); showToast('Copied!') }}
                                className="flex-shrink-0 px-2.5 bg-surface-muted hover:bg-surface-subtle rounded-lg text-[10px] text-ink-secondary hover:text-ink transition-colors">Copy</button>
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] text-ink-muted uppercase tracking-wider font-medium mb-1.5">🔗 Client Manager URL</p>
                            <div className="flex gap-1.5">
                              <code className="flex-1 bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-[10px] text-blue-400 font-mono truncate">{managerUrl}</code>
                              <button onClick={() => { navigator.clipboard.writeText(managerUrl); showToast('Copied!') }}
                                className="flex-shrink-0 px-2.5 bg-surface-muted hover:bg-surface-subtle rounded-lg text-[10px] text-ink-secondary hover:text-ink transition-colors">Copy</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Bot Panel Overlay */}
        {selectedBot && (
          <BotPanel 
            bot={selectedBot} 
            token={token || ''} 
            onClose={() => { setSelectedBot(null); fetchBots() }} 
          />
        )}



        {/* ═══════════════════════════════════════════════════ */}
        {/* KB LIBRARY TAB                                      */}
        {/* ═══════════════════════════════════════════════════ */}
        {tab === 'library' && client && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Knowledge Base Library</h2>
                <p className="text-sm text-ink-muted mt-1">Datasets and knowledge chunks for {client.name}.</p>
              </div>
            </div>

            {/* Dataset Sidebar + Content */}
            <div className="grid grid-cols-4 gap-6">

              {/* Sidebar: Dataset List */}
              <div className="col-span-1 space-y-3">
                <p className="text-[10px] text-ink-muted uppercase tracking-wider font-semibold mb-2">Datasets</p>
                
                {/* Create Dataset */}
                <div className="flex gap-2">
                  <input
                    value={newDatasetName}
                    onChange={e => setNewDatasetName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateDataset() }}
                    placeholder="New dataset name..."
                    className="flex-1 bg-surface border border-surface-border rounded-xl px-3 py-2 text-xs text-ink placeholder-gray-700 focus:outline-none focus:border-accent/40"
                  />
                  <button onClick={handleCreateDataset} disabled={creatingDataset || !newDatasetName.trim()} className="px-3 py-2 bg-accent-hover hover:bg-accent disabled:opacity-40 text-ink rounded-xl text-xs font-bold">+</button>
                </div>

                {datasetsLoading ? (
                  <div className="flex justify-center py-6"><div className="w-5 h-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /></div>
                ) : datasets.length === 0 ? (
                  <p className="text-xs text-ink-muted text-center py-6">No datasets yet.<br/>Create one above.</p>
                ) : (
                  datasets.map(ds => (
                    <button
                      key={ds.id}
                      onClick={() => { setActiveDatasetId(ds.id); fetchLibraryChunks(ds.id) }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all border ${activeDatasetId === ds.id ? 'bg-accent-hover/20 border-accent/40 text-ink' : 'bg-surface border-surface-border text-ink-secondary hover:text-ink hover:border-surface-border'}`}
                    >
                      <p className="truncate">{ds.name}</p>
                      <p className="text-[10px] text-ink-muted mt-0.5">{ds.chunk_count || 0} chunks</p>
                    </button>
                  ))
                )}
              </div>

              {/* Main Content: Add + Chunks */}
              <div className="col-span-3 space-y-5">
                {!activeDatasetId ? (
                  <div className="flex items-center justify-center h-40 bg-surface border border-surface-border rounded-2xl">
                    <p className="text-ink-muted text-sm">Select or create a dataset to get started.</p>
                  </div>
                ) : (
                  <>
                    {/* Feedback Messages */}
                    {librarySuccess && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-emerald-400 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        {librarySuccess}
                      </div>
                    )}
                    {libraryError && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M6.938 4h10.124c1.54 0 2.502 1.667 1.732 3L13.732 19c-.77 1.333-2.694 1.333-3.464 0L5.206 7c-.77-1.333.192-3 1.732-3z" /></svg>
                        {libraryError}
                      </div>
                    )}

                    {/* Add Knowledge Panel */}
                    <div className="bg-surface border border-surface-border rounded-2xl p-5 space-y-4">
                      <p className="text-xs font-semibold text-ink uppercase tracking-wider">Add Knowledge</p>
                      <div className="grid grid-cols-3 gap-4">

                        {/* Manual Text */}
                        <div className="space-y-2">
                          <p className="text-[11px] text-ink-muted font-medium">📝 Manual Text</p>
                          <input value={newChunkTitle} onChange={e => setNewChunkTitle(e.target.value)} placeholder="Chunk title (required)" className="w-full bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-xs text-ink placeholder-gray-700 focus:outline-none focus:border-accent/40" />
                          <textarea value={newChunkText} onChange={e => setNewChunkText(e.target.value)} placeholder="Type knowledge here..." rows={3} className="w-full bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-xs text-ink placeholder-gray-700 focus:outline-none resize-none" />
                          <button onClick={handleAddChunk} disabled={addingChunk || !newChunkText.trim() || !newChunkTitle.trim()} className="w-full py-2 bg-accent-hover/80 hover:bg-accent-hover disabled:opacity-40 text-ink text-xs rounded-lg transition-colors">
                            {addingChunk ? 'Saving...' : 'Add Text'}
                          </button>
                        </div>

                        {/* URL Crawl */}
                        <div className="space-y-2">
                          <p className="text-[11px] text-ink-muted font-medium">🌐 Crawl URLs</p>
                          {libraryUrls.map((url, i) => (
                            <div key={i} className="flex gap-1">
                              <input value={url} onChange={e => { const n = [...libraryUrls]; n[i] = e.target.value; setLibraryUrls(n) }} placeholder="https://example.com" className="flex-1 bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-xs text-ink placeholder-gray-700 focus:outline-none focus:border-accent/40" />
                              {i === libraryUrls.length - 1 && (
                                <button onClick={() => setLibraryUrls([...libraryUrls, ''])} className="px-2 bg-accent-hover/20 hover:bg-accent-hover/40 text-accent rounded-lg text-sm font-bold">+</button>
                              )}
                            </div>
                          ))}
                          <button onClick={handleCrawlLibraryUrls} disabled={crawlingLib || libraryUrls.every(u => !u.trim())} className="w-full py-2 bg-blue-600/80 hover:bg-blue-600 disabled:opacity-40 text-ink text-xs rounded-lg transition-colors flex items-center justify-center gap-2">
                            {crawlingLib ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Crawling...</> : 'Crawl Links'}
                          </button>
                        </div>

                        {/* File Upload */}
                        <div className="space-y-2">
                          <p className="text-[11px] text-ink-muted font-medium">📎 Upload Files</p>
                          <input ref={libFileRef} type="file" multiple accept=".pdf,.docx,.txt,.csv" onChange={handleLibraryFileUpload} className="hidden" />
                          <div className="space-y-1 min-h-[60px]">
                            {libFiles.map((f, i) => (
                              <div key={i} className="flex justify-between items-center text-[10px] text-ink-secondary bg-surface-muted border border-surface-border px-2 py-1 rounded">
                                <span className="truncate max-w-[70%]">{f.name}</span>
                                <button onClick={() => setLibFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300">✕</button>
                              </div>
                            ))}
                          </div>
                          <button onClick={() => libFileRef.current?.click()} className="w-full py-2 border border-dashed border-surface-border hover:border-accent/40 text-ink-secondary hover:text-ink text-xs rounded-lg transition-colors">
                            + Choose PDF / DOCX / TXT
                          </button>
                        </div>

                      </div>
                    </div>

                    {/* Chunks List */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-ink-muted uppercase tracking-wider font-semibold">Knowledge Chunks</p>
                        {chunksLoading && <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />}
                      </div>
                      {chunksLoading ? (
                        <div className="flex justify-center py-10"><div className="w-6 h-6 rounded-full border-2 border-accent/20 border-t-accent animate-spin" /></div>
                      ) : chunks.length === 0 ? (
                        <div className="bg-surface border border-surface-border rounded-2xl p-10 text-center">
                          <p className="text-4xl mb-3">📭</p>
                          <p className="text-ink-secondary text-sm font-medium">No chunks yet</p>
                          <p className="text-ink-muted text-xs mt-1">Add some text, crawl a URL, or upload a file above.</p>
                        </div>
                      ) : (
                        chunks.map(chunk => (
                          <div key={chunk.id} className="group bg-surface border border-surface-border hover:border-accent/20 rounded-2xl p-4 transition-all">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                                  chunk.source_type === 'crawl' ? 'text-accent bg-accent/10 border-accent/20' :
                                  chunk.source_type === 'manual' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                  'text-blue-400 bg-blue-500/10 border-blue-500/20'
                                }`}>{chunk.source_type}</span>
                                {chunk.title && <p className="text-xs font-semibold text-ink">{chunk.title}</p>}
                              </div>
                              <button onClick={() => handleDeleteChunk(chunk.id)} className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-red-400 text-xs transition-all">Delete</button>
                            </div>
                            <p className="text-xs text-ink-secondary leading-relaxed whitespace-pre-wrap line-clamp-3">{chunk.text}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* INTEGRATIONS TAB                                    */}
        {/* ═══════════════════════════════════════════════════ */}
        {tab === 'integrations' && client && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg font-semibold text-ink">External Integrations (Data Sources)</h2>
              <p className="text-sm text-ink-muted mt-1">Connect REST APIs or Google Sheets so the AI can retrieve live customer data like order status.</p>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* Form */}
              <div className="col-span-1 bg-surface border border-surface-border rounded-2xl p-5 h-fit space-y-4">
                <h3 className="text-sm font-semibold">New Connection</h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-ink-muted font-medium mb-1">Connection Name</label>
                    <input value={dbForm.name} onChange={e => setDbForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Order Tracking" className="w-full bg-surface-muted border border-surface-border rounded-xl px-3 py-2 text-xs text-ink placeholder-gray-700 focus:outline-none focus:border-accent/40" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-ink-muted font-medium mb-1">Source Type</label>
                    <select value={dbForm.source_type} onChange={e => setDbForm(f => ({ ...f, source_type: e.target.value }))} className="w-full bg-surface-muted border border-surface-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-accent/40">
                      <option value="google_sheets">Google Sheets</option>
                      <option value="rest_api">REST API</option>
                      <option value="csv_url">CSV Link</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-ink-muted font-medium mb-1">Endpoint URL / Sheet Link</label>
                    <input value={dbForm.endpoint_url} onChange={e => setDbForm(f => ({ ...f, endpoint_url: e.target.value }))} placeholder="https://..." className="w-full bg-surface-muted border border-surface-border rounded-xl px-3 py-2 text-xs text-ink placeholder-gray-700 focus:outline-none focus:border-accent/40" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-ink-muted font-medium mb-1">Search Parameter</label>
                    <input value={dbForm.lookup_param} onChange={e => setDbForm(f => ({ ...f, lookup_param: e.target.value }))} placeholder="e.g. id, email, order_number" className="w-full bg-surface-muted border border-surface-border rounded-xl px-3 py-2 text-xs text-ink placeholder-gray-700 focus:outline-none focus:border-accent/40" />
                    <p className="text-[10px] text-ink-muted mt-1">What the AI will search for in this database.</p>
                  </div>
                  {dbForm.source_type === 'rest_api' && (
                    <div>
                      <label className="block text-[11px] text-ink-muted font-medium mb-1">Authorization Header (Optional)</label>
                      <input value={dbForm.auth_header} onChange={e => setDbForm(f => ({ ...f, auth_header: e.target.value }))} placeholder="Bearer token..." className="w-full bg-surface-muted border border-surface-border rounded-xl px-3 py-2 text-xs text-ink placeholder-gray-700 focus:outline-none focus:border-accent/40" />
                    </div>
                  )}

                  <button onClick={handleSaveDataSource} disabled={dbSaving || !dbForm.endpoint_url.trim()} className="w-full py-2.5 bg-accent-hover/80 hover:bg-accent-hover disabled:opacity-40 text-ink text-xs font-semibold rounded-xl transition-colors mt-2">
                    {dbSaving ? 'Saving...' : 'Add Connection'}
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="col-span-2 space-y-3">
                {dataSources.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 bg-surface border border-surface-border rounded-2xl">
                    <p className="text-3xl mb-2">🔗</p>
                    <p className="text-sm font-medium text-ink-secondary">No Integrations Connected</p>
                    <p className="text-xs text-ink-muted mt-1">Connect an API or Google Sheet to let your AI read live data.</p>
                  </div>
                ) : (
                  dataSources.map(ds => (
                    <div key={ds.id} className="bg-surface border border-surface-border rounded-2xl p-5 flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold">{ds.name}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-muted border border-surface-border text-ink-secondary uppercase tracking-wider">{ds.source_type.replace('_', ' ')}</span>
                        </div>
                        <p className="text-xs text-ink-muted truncate max-w-sm mb-2">{ds.endpoint_url}</p>
                        <p className="text-[11px] text-accent">Search Parameter: <span className="text-ink font-medium">{ds.lookup_param}</span></p>
                      </div>
                      <button onClick={() => handleDeleteDataSource(ds.id)} className="text-xs text-red-500/70 hover:text-red-500 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-colors">
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
