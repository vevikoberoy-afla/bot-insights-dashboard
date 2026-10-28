'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { KpiCard } from '@/components/shared/kpi-card'
import {fetchDashboardData,readDashboardData,subscribeDashboardData} from '@/lib/client/featureDataCache'
import {
  Bot, Megaphone, Ticket, CheckCircle, ArrowUpRight, ArrowDownLeft,
  DollarSign, Layers, Plus, Play, MessageCircle, Inbox, Clock, ThumbsUp,
  Radio, BookOpen
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { DashboardContentSkeleton } from '@/components/ui/dashboard-skeleton'

const MessagesBarChart=dynamic(()=>import('@/components/charts/bar-chart').then(module=>module.MessagesBarChart),{
 ssr:false,loading:()=> <div className="h-[240px] animate-pulse rounded-lg bg-surface-muted" />,
})

type OverviewData={clientName:string;stats:{activeBots:number;activeCampaigns:number;ticketsRaised:number;ticketsResolved:number;outboundMessages:number;inboundMessages:number;totalSales:number;channels:number};recentBots:any[];recentCampaigns:any[];recentDatasets:any[]}
const OVERVIEW_URL='/api/dashboard/overview'

export default function OverviewPage() {
  const cached=readDashboardData<OverviewData>(OVERVIEW_URL)
  const [clientName, setClientName] = useState(cached?.clientName||'there')
  const [loading, setLoading] = useState(!cached)
  const [stats, setStats] = useState(cached?.stats||{
    activeBots: 0, activeCampaigns: 0, ticketsRaised: 0, ticketsResolved: 0,
    outboundMessages: 0, inboundMessages: 0, totalSales: 0, channels: 0
  })
  const [recentBots, setRecentBots] = useState<any[]>(cached?.recentBots||[])
  const [recentCampaigns, setRecentCampaigns] = useState<any[]>(cached?.recentCampaigns||[])
  const [recentDatasets, setRecentDatasets] = useState<any[]>(cached?.recentDatasets||[])

  useEffect(() => {
    const apply=(data:OverviewData)=>{setClientName(data.clientName);setStats(data.stats);setRecentBots(data.recentBots);setRecentCampaigns(data.recentCampaigns);setRecentDatasets(data.recentDatasets);setLoading(false)}
    const unsubscribe=subscribeDashboardData(OVERVIEW_URL,apply)
    void fetchDashboardData<OverviewData>(OVERVIEW_URL).catch(()=>setLoading(false))
    return unsubscribe
  }, [])



  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  if (loading) {
    return <DashboardContentSkeleton />
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">

      {/* Top Header & Greeting */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Good morning, {clientName}</h1>
          <p className="text-sm text-ink-secondary mt-1">{today}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" className="rounded-lg border-surface-border text-ink bg-surface shadow-sm" asChild>
            <Link href="/bots/new"><Plus className="w-4 h-4 mr-2" /> Add Bot</Link>
          </Button>
          <Button size="sm" className="rounded-lg bg-accent hover:bg-accent-hover text-white shadow-sm" asChild>
            <Link href="/campaigns/create"><Play className="w-4 h-4 mr-2 fill-current" /> Run Campaign</Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards Row — Original */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Bots" value={stats.activeBots} trend="up" icon={Bot} />
        <KpiCard label="Active Campaigns" value={stats.activeCampaigns} trend="up" icon={Megaphone} />
        <KpiCard label="Tickets Raised" value={stats.ticketsRaised} trend="neutral" icon={Ticket} />
        <KpiCard label="Tickets Resolved" value={stats.ticketsResolved} trend="up" icon={CheckCircle} />
      </div>



      {/* Bots, Campaigns, Knowledge Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Current Bots */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-ink uppercase tracking-widest">Current Bots</h2>
            <Link href="/bots/all" className="text-xs text-accent hover:underline">View all &rarr;</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none snap-x">
            {recentBots.length === 0 ? (
              <div className="text-sm text-ink-muted bg-surface-muted rounded-lg p-6 border border-surface-border w-full flex items-center justify-center">No active bots found.</div>
            ) : recentBots.map((bot) => (
              <Link href={`/bots/${bot.id}/settings`} key={bot.id} className="flex-shrink-0 w-40 h-32 bg-surface border border-surface-border rounded-lg p-3 cursor-pointer hover:border-accent/40 transition-all snap-start flex flex-col justify-between group">
                <div className="flex items-start justify-between">
                  <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-accent" />
                  </div>
                  <div className={bot.status === 'active' ? "w-2 h-2 rounded-full bg-status-green" : "w-2 h-2 rounded-full bg-status-amber"} />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink group-hover:text-accent transition-colors truncate">{bot.name}</p>
                  <span className="inline-block mt-1 bg-surface-muted border border-surface-border text-ink-secondary text-[10px] px-2 py-0.5 rounded-full capitalize">{bot.purpose || 'Support'}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Current Campaigns */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-ink uppercase tracking-widest">Current Campaigns</h2>
            <Link href="/campaigns/all" className="text-xs text-accent hover:underline">View all &rarr;</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none snap-x">
            {recentCampaigns.length === 0 ? (
               <div className="text-sm text-ink-muted bg-surface-muted rounded-lg p-6 border border-surface-border w-full flex items-center justify-center">No active campaigns.</div>
            ) : recentCampaigns.map((campaign) => (
              <Link href={`/campaigns/${campaign.id}`} key={campaign.id} className="flex-shrink-0 w-48 h-32 bg-surface border border-surface-border rounded-lg p-3 cursor-pointer hover:border-accent/40 transition-all snap-start flex flex-col justify-between group">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 bg-surface-muted border border-surface-border px-1.5 py-0.5 rounded text-[10px] font-medium text-ink-secondary capitalize">
                    <MessageCircle className="w-3 h-3 text-status-green" /> {campaign.channel || 'whatsapp'}
                  </div>
                  <span className="text-[10px] font-semibold text-status-blue bg-status-blueBg px-1.5 py-0.5 rounded border border-status-blue/20 capitalize">{campaign.status || 'running'}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink group-hover:text-accent transition-colors line-clamp-1">{campaign.name}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{campaign.stats?.sent || 0} sent &middot; {campaign.stats?.opened ? Math.round((campaign.stats.opened / (campaign.stats.sent || 1))*100) : 0}% open</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Knowledge Bases */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-ink uppercase tracking-widest">Knowledge Bases</h2>
            <Link href="/knowledge/all" className="text-xs text-accent hover:underline">View all &rarr;</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none snap-x">
            {recentDatasets.length === 0 ? (
               <div className="text-sm text-ink-muted bg-surface-muted rounded-lg p-6 border border-surface-border w-full flex items-center justify-center">No knowledge bases yet.</div>
            ) : recentDatasets.map((ds) => (
              <Link href={`/knowledge/${ds.id}`} key={ds.id} className="flex-shrink-0 w-40 h-32 bg-surface border border-surface-border rounded-lg p-3 cursor-pointer hover:border-accent/40 transition-all snap-start flex flex-col justify-between group">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 bg-surface-muted border border-surface-border px-1.5 py-0.5 rounded text-[10px] font-medium text-ink-secondary capitalize">
                    <BookOpen className="w-3 h-3 text-status-blue" /> {ds.purpose || 'general'}
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize
                    ${ds.status === 'ready' ? 'text-status-green bg-status-greenBg border-status-green/20' 
                    : ds.status === 'processing' ? 'text-status-blue bg-status-blueBg border-status-blue/20'
                    : ds.status === 'error' ? 'text-status-amber bg-status-amberBg border-status-amber/20'
                    : 'text-ink-secondary bg-surface-muted border-surface-border'}`}>
                    {ds.status || 'draft'}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink group-hover:text-accent transition-colors line-clamp-1">{ds.name}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{ds.chunk_count || 0} chunks</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>

      {/* Messages By Channel Chart */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-ink uppercase tracking-widest">Messages By Channel</h2>
          <select className="text-xs bg-surface border border-surface-border rounded px-2 py-1 text-ink-secondary focus:outline-none">
            <option>Last 7 Days</option>
            <option>Last 30 Days</option>
            <option>Last 90 Days</option>
          </select>
        </div>
        <div className="bg-surface border border-surface-border rounded-lg p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#2563EB]" /><span className="text-xs text-ink-secondary">WhatsApp</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#BFDBFE]" /><span className="text-xs text-ink-secondary">SMS</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#D97706]" /><span className="text-xs text-ink-secondary">Email</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#16A34A]" /><span className="text-xs text-ink-secondary">Web</span></div>
          </div>
          <MessagesBarChart />
        </div>
      </div>

    </div>
  )
}
