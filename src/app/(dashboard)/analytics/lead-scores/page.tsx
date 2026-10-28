'use client'

import { useState } from 'react'
import { Search, Filter, TrendingUp, TrendingDown, MoreHorizontal, ArrowUpRight } from 'lucide-react'

export default function LeadScoresPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const leads = [
    { id: 1, name: 'Sarah Jenkins', email: 'sarah.j@example.com', score: 92, trend: 'up', status: 'Hot', factors: ['+20 Campaign Click', '+15 Viewed 3 products', '+12 Session > 5m'] },
    { id: 2, name: 'Michael Chen', email: 'mchen@company.com', score: 85, trend: 'up', status: 'Hot', factors: ['+30 Cart value > $500', '+10 WhatsApp Reply'] },
    { id: 3, name: 'Elena Rodriguez', email: 'elena.r@test.com', score: 64, trend: 'down', status: 'Warm', factors: ['+15 Web Visit', '-5 No activity 7d'] },
    { id: 4, name: 'David Smith', email: 'dsmith@example.com', score: 45, trend: 'up', status: 'Cold', factors: ['+10 Opened Email'] },
    { id: 5, name: 'Anonymous User', email: '—', score: 30, trend: 'up', status: 'Cold', factors: ['+15 Viewed 2 pages'] },
  ]

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
    if (score >= 50) return 'text-amber-500 bg-amber-500/10 border-amber-500/20'
    return 'text-ink-secondary bg-surface-muted border-surface-border'
  }

  const getScoreProgress = (score: number) => {
    if (score >= 80) return 'bg-emerald-500'
    if (score >= 50) return 'bg-amber-500'
    return 'bg-ink-muted'
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex-shrink-0 border-b border-surface-border">
        <div className="px-8 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Lead Scores</h1>
            <p className="text-sm text-ink-muted mt-2">
              Automatically identify your hottest prospects based on their behavior and engagement.
            </p>
          </div>
          <button className="flex items-center gap-2 bg-surface-muted hover:bg-surface-subtle border border-surface-border text-ink px-4 py-2 rounded-xl text-sm font-medium transition-all">
            <Filter className="w-4 h-4" />
            Scoring Rules
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search leads by name or email..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface border border-surface-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink focus:outline-none focus:border-accent/40"
            />
          </div>
          
          <div className="flex bg-surface-muted p-1 rounded-xl border border-surface-border">
            {['All', 'Hot (80+)', 'Warm (50-79)', 'Cold (<50)'].map(f => (
              <button 
                key={f}
                onClick={() => setFilter(f.toLowerCase())}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === f.toLowerCase() ? 'bg-surface border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-surface-border rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-border bg-surface-muted/30">
                <th className="py-3 px-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Lead</th>
                <th className="py-3 px-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Score</th>
                <th className="py-3 px-4 text-xs font-semibold text-ink-muted uppercase tracking-wider">Recent Factors</th>
                <th className="py-3 px-4 text-xs font-semibold text-ink-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {leads.map(l => (
                <tr key={l.id} className="hover:bg-surface-subtle transition-colors group cursor-pointer">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface-muted border border-surface-border flex items-center justify-center text-ink font-bold text-xs">
                        {l.name === 'Anonymous User' ? '?' : l.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink">{l.name}</p>
                        <p className="text-xs text-ink-muted">{l.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${getScoreColor(l.score)}`}>
                        <span className="text-sm font-bold tabular-nums">{l.score}</span>
                        {l.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3 opacity-60" />}
                      </div>
                      <div className="w-24 h-1.5 bg-surface-muted rounded-full overflow-hidden">
                        <div className={`h-full ${getScoreProgress(l.score)}`} style={{ width: `${l.score}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-wrap gap-1.5 max-w-sm">
                      {l.factors.map((f, i) => (
                        <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-surface-muted text-ink-secondary border border-surface-border">
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover bg-accent/10 px-3 py-1.5 rounded-lg transition-colors">
                        View Profile <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
