'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Input } from '@/components/ui/input'
import { Search, Play, Filter, ArrowRight, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MOCK_EVENTS = [
  { id: 1, type: 'pageview', title: 'Viewed Pricing Page', user: 'Alex Johnson', time: '10:42 AM' },
  { id: 2, type: 'click', title: 'Clicked "Contact Sales"', user: 'Alex Johnson', time: '10:45 AM' },
  { id: 3, type: 'chat', title: 'Started Chat Session', user: 'Alex Johnson', time: '10:46 AM' },
  { id: 4, type: 'session', title: 'Session Replay Available', user: 'Alex Johnson', time: '10:42 AM - 10:50 AM', duration: '8m 20s' },
  { id: 5, type: 'pageview', title: 'Viewed Features', user: 'Anonymous User', time: '11:15 AM' },
]

export default function CustomerBehaviorPage() {
  const [search, setSearch] = useState('')

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto px-4">
      <PageHeader title="Customer Behavior" description="Track individual user journeys, events, and session replays powered by PostHog." />

      <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[600px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-muted/50">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input 
              placeholder="Search by email, name, or user ID..." 
              className="pl-9 bg-surface"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" className="text-ink-secondary text-xs h-9">
            <Filter className="w-3.5 h-3.5 mr-2" /> Filter Events
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Timeline */}
          <div className="flex-1 overflow-y-auto p-6 border-r border-surface-border">
            <h3 className="font-semibold text-ink mb-6">Recent Activity Stream</h3>
            
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-surface-border">
              {MOCK_EVENTS.map(event => (
                <div key={event.id} className="relative flex items-start gap-4 group">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-surface-border bg-white text-ink shadow-sm shrink-0 z-10">
                    {event.type === 'pageview' && <span className="text-lg">📄</span>}
                    {event.type === 'click' && <span className="text-lg">🖱️</span>}
                    {event.type === 'chat' && <span className="text-lg">💬</span>}
                    {event.type === 'session' && <Play className="w-4 h-4 text-accent" />}
                  </div>
                  <div className="flex-1 bg-surface-muted p-4 rounded-xl border border-surface-border mt-1">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-ink text-sm">{event.title}</h4>
                      <span className="text-[11px] text-ink-muted">{event.time}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <User className="w-3.5 h-3.5 text-ink-muted" />
                      <span className="text-xs text-ink-secondary font-medium">{event.user}</span>
                    </div>
                    {event.type === 'session' && (
                      <div className="mt-4 pt-3 border-t border-surface-border flex items-center justify-between">
                        <span className="text-xs text-ink-muted">Duration: {event.duration}</span>
                        <Button size="sm" className="h-8 text-xs bg-ink hover:bg-ink-secondary text-white">
                          <Play className="w-3.5 h-3.5 mr-1.5" /> Watch Replay
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Right Sidebar */}
          <div className="w-80 bg-surface-muted/30 p-6 overflow-y-auto">
            <div className="bg-white border border-surface-border rounded-xl p-5 text-center shadow-sm mb-6">
              <div className="w-16 h-16 bg-accent/10 text-accent font-bold text-xl rounded-full flex items-center justify-center mx-auto mb-3">AJ</div>
              <h3 className="font-semibold text-ink">Alex Johnson</h3>
              <p className="text-xs text-ink-muted mt-1">alex@example.com</p>
              
              <div className="mt-4 pt-4 border-t border-surface-border flex justify-around">
                <div>
                  <p className="text-[10px] text-ink-muted uppercase font-bold tracking-wider">Events</p>
                  <p className="text-lg font-bold text-ink mt-0.5">142</p>
                </div>
                <div>
                  <p className="text-[10px] text-ink-muted uppercase font-bold tracking-wider">Sessions</p>
                  <p className="text-lg font-bold text-ink mt-0.5">12</p>
                </div>
              </div>
              
              <Button className="w-full mt-4 bg-surface hover:bg-surface-muted text-ink border border-surface-border text-xs h-8">
                View CRM Profile <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
            
            <h4 className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-3">Top Pages</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm bg-white p-2.5 rounded-lg border border-surface-border">
                <span className="text-ink-secondary truncate pr-2">/pricing</span>
                <span className="font-semibold text-ink text-xs">45 views</span>
              </div>
              <div className="flex justify-between items-center text-sm bg-white p-2.5 rounded-lg border border-surface-border">
                <span className="text-ink-secondary truncate pr-2">/features/ai</span>
                <span className="font-semibold text-ink text-xs">32 views</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
