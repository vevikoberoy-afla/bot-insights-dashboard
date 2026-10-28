'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { ArrowLeft, MessageSquare, Bot, User, Zap, Tags, Trophy, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fetchDashboardData, readDashboardData } from '@/lib/client/featureDataCache'

export default function BotAnalyticsPage() {
  const params = useParams()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    fetchAnalytics(false)
  }, [days])

  const fetchAnalytics = async (force = false) => {
    const url=`/api/bots/${params.id}/analytics?days=${days}`
    const cached=readDashboardData<any>(url)
    if(cached){setData(cached);setLoading(false)}else setLoading(true)
    try {
      setData(await fetchDashboardData<any>(url,{force}))
    } catch {}
    setLoading(false)
  }

  const totals = data?.totals || {}
  
  const CARDS = [
    { title: 'Total Conversations', value: totals.conversations_total || 0, icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50' },
    { title: 'Bot Resolution Rate', value: `${totals.resolution_rate || 0}%`, icon: Bot, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { title: 'Human Handoffs', value: totals.conversations_handoff || 0, icon: User, color: 'text-orange-500', bg: 'bg-orange-50' },
    { title: 'Data Collected (Leads)', value: totals.contacts_data_collected || 0, icon: Tags, color: 'text-purple-500', bg: 'bg-purple-50' },
    { title: 'Proactive Triggers Fired', value: totals.triggers_fired || 0, icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    { title: 'Coupon Conversion', value: `${totals.coupon_conversion_rate || 0}%`, icon: Trophy, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { title: 'Avg Conversation Length', value: `${totals.avg_conversation_length || 0} turns`, icon: MessageSquare, color: 'text-pink-500', bg: 'bg-pink-50' },
    { title: 'MCP Action Success', value: `${totals.mcp_success_rate || 0}%`, icon: Zap, color: 'text-green-600', bg: 'bg-green-100' },
  ]

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 pb-12">
      <PageHeader title="Bot Analytics" description="Performance metrics and insights for this bot.">
        <div className="flex items-center gap-3">
          <select value={days} onChange={e => setDays(+e.target.value)} className="h-8 border border-surface-border rounded-lg px-2 text-xs bg-surface font-medium">
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href={`/bots/${params.id}/edit`}><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Editor</Link>
          </Button>
        </div>
      </PageHeader>

      <div className="mt-6 space-y-6">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" aria-label="Loading bot analytics">
            {[0,1,2,3,4,5,6,7].map(item=><div key={item} className="h-28 rounded-xl border border-surface-border bg-surface animate-pulse"><div className="m-4 h-8 w-8 rounded-lg bg-surface-muted"/><div className="mx-4 h-5 w-20 rounded bg-surface-muted"/></div>)}
          </div>
        ) : (
          <>
            {/* Top KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-4">
              {CARDS.map(c => {
                const Icon = c.icon
                return (
                  <div key={c.title} className="bg-surface border border-surface-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-3">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", c.bg)}>
                        <Icon className={cn("w-4 h-4", c.color)} />
                      </div>
                    </div>
                    <div>
                      <p className="text-2xl font-black text-ink leading-none mb-1">{c.value}</p>
                      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">{c.title}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Questions */}
              <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-border bg-surface-muted/30">
                  <h3 className="text-sm font-bold text-ink flex items-center gap-2"><MessageSquare className="w-4 h-4 text-accent" /> Most Frequent Questions</h3>
                </div>
                <div className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-muted border-b border-surface-border text-left">
                        <th className="px-5 py-2 text-[10px] font-bold text-ink-muted uppercase">Question Topic</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-ink-muted uppercase text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {[
                        { q: 'How much is shipping?', c: 142 },
                        { q: 'Where is my order?', c: 98 },
                        { q: 'Do you have a discount code?', c: 54 },
                        { q: 'Return policy', c: 41 },
                      ].map((item, i) => (
                        <tr key={i} className="hover:bg-surface-muted/30">
                          <td className="px-5 py-3 text-sm text-ink">{item.q}</td>
                          <td className="px-5 py-3 text-sm font-medium text-ink text-right">{item.c}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Unanswered / Failed */}
              <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-border bg-red-50/50">
                  <h3 className="text-sm font-bold text-ink flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Top Unanswered Questions (Needs Training)</h3>
                </div>
                <div className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-muted border-b border-surface-border text-left">
                        <th className="px-5 py-2 text-[10px] font-bold text-ink-muted uppercase">User Message</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-ink-muted uppercase text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {[
                        { q: 'Do you ship to Canada?', c: 12 },
                        { q: 'Wholesale pricing', c: 8 },
                        { q: 'Are your products vegan?', c: 5 },
                      ].map((item, i) => (
                        <tr key={i} className="hover:bg-surface-muted/30">
                          <td className="px-5 py-3 text-sm text-red-600">{item.q}</td>
                          <td className="px-5 py-3 text-sm font-medium text-ink text-right">{item.c}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 bg-surface-muted border-t border-surface-border">
                  <Button variant="outline" className="w-full h-8 text-xs border-dashed">Add missing answers to Knowledge Base</Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
