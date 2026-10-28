'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'
import { useCachedFetch } from '@/lib/cache'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  sent: 'bg-status-greenBg text-status-green border-status-green/20',
  scheduled: 'bg-status-blueBg text-status-blue border-status-blue/20',
  draft: 'bg-surface-muted text-ink-secondary border-surface-border',
  sending: 'bg-status-amberBg text-status-amber border-status-amber/20',
  failed: 'bg-status-redBg text-status-red border-status-red/20',
}

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: '📱',
  email: '📧',
  sms: '📲'
}

export default function CampaignsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  
  // --- Cached clients list ---
  const fetcherClients = useCallback(async () => {
    const accessToken=await getVerifiedAccessToken(supabase)
    if (!accessToken) return []
    const res = await fetch('/api/clients', { headers: { 'Authorization': `Bearer ${accessToken}` } })
    if (!res.ok) return []
    const data = await res.json()
    return data.clients ?? []
  }, [supabase])
  const { data: clients = [] } = useCachedFetch('clients', fetcherClients)

  // Set first client once clients load
  useEffect(() => {
    if (clients.length > 0 && !activeClientId) setActiveClientId(clients[0].id)
  }, [clients])

  // --- Cached campaigns ---
  const fetcherCampaigns = useCallback(async () => {
    if (!activeClientId) return []
    const res = await fetch(`/api/campaigns?client_id=${activeClientId}`)
    if (!res.ok) return []
    const data = await res.json()
    return data
  }, [activeClientId])
  
  const { data: campaigns = [], loading } = useCachedFetch(`campaigns:${activeClientId}`, fetcherCampaigns)

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12">
      <div className="flex items-center justify-between mb-8">
        <PageHeader title="Campaigns" description="Bulk messaging across WhatsApp, Email, and SMS" />
        
        <div className="flex items-center gap-4">
          {clients.length > 1 && (
            <select
              value={activeClientId || ''}
              onChange={(e) => setActiveClientId(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-ink focus:border-accent focus:outline-none"
            >
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          <Button 
            onClick={() => router.push('/admin/campaigns/new')}
            className="bg-accent hover:bg-accent-hover text-white shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" /> New Campaign
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-surface-border rounded-xl shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-surface sticky top-0 z-10 shadow-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead>Campaign</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Segment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Recipients</TableHead>
                <TableHead className="text-right">Open Rate</TableHead>
                <TableHead className="text-right">Click Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-ink-muted">
                    <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-ink-muted">No campaigns found</TableCell>
                </TableRow>
              ) : (
                campaigns.map((c: any) => {
                  const total = c.stats?.sent || 0
                  const openRate = total > 0 ? Math.round((c.stats.opened / total) * 100) + '%' : '—'
                  const clickRate = total > 0 ? Math.round((c.stats.clicked / total) * 100) + '%' : '—'

                  return (
                    <TableRow key={c.id} onClick={() => router.push(`/admin/campaigns/${c.id}`)} className="cursor-pointer group hover:bg-surface-muted">
                      <TableCell className="font-medium text-ink group-hover:text-accent transition-colors">{c.name}</TableCell>
                      <TableCell className="text-ink-secondary capitalize">{CHANNEL_ICON[c.channel] || ''} {c.channel}</TableCell>
                      <TableCell className="text-ink-secondary">{c.contact_segments?.name || 'All Contacts'}</TableCell>
                      <TableCell>
                        <span className={`text-[10px] font-medium border rounded-full px-2.5 py-0.5 capitalize ${STATUS_STYLE[c.status] || STATUS_STYLE.draft}`}>{c.status}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-ink">{total.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-ink-secondary">{openRate}</TableCell>
                      <TableCell className="text-right text-ink-secondary">{clickRate}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
