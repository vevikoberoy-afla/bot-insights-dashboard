'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Webhook, Plus, MoreHorizontal, Activity, Trash2, Edit2, Play, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'

const MOCK_WEBHOOKS = [
  { id: 1, url: 'https://api.myapp.com/vittain/incoming', status: 'Active', events: ['conversation.started', 'message.received'], lastFired: '2 mins ago', successRate: '100%' },
  { id: 2, url: 'https://zapier.com/hooks/catch/123/456', status: 'Active', events: ['lead.created'], lastFired: '1 hour ago', successRate: '98%' },
  { id: 3, url: 'https://internal-erp.local/webhook', status: 'Failing', events: ['purchase.completed'], lastFired: 'Yesterday', successRate: '0%' },
]

const EVENT_CATEGORIES = [
  {
    category: 'Conversation Events',
    events: [
      { id: 'conversation.started', label: 'Conversation Started' },
      { id: 'message.received', label: 'Message Received' },
      { id: 'handoff.triggered', label: 'Human Handoff' }
    ]
  },
  {
    category: 'Lead Events',
    events: [
      { id: 'lead.created', label: 'Lead Created' },
      { id: 'lead.updated', label: 'Lead Updated' },
      { id: 'lead.score_changed', label: 'Score Changed' }
    ]
  },
  {
    category: 'Campaign Events',
    events: [
      { id: 'campaign.started', label: 'Campaign Started' },
      { id: 'message.delivered', label: 'Message Delivered' }
    ]
  },
  {
    category: 'Purchase Events',
    events: [
      { id: 'purchase.completed', label: 'Purchase Completed' },
      { id: 'cart.abandoned', label: 'Cart Abandoned' }
    ]
  },
  {
    category: 'Bot Events',
    events: [
      { id: 'bot.created', label: 'Bot Created' },
      { id: 'bot.paused', label: 'Bot Paused' }
    ]
  }
]

const MOCK_LOGS = [
  { id: 'log_1', webhook: 'https://api.myapp.com/vittain/incoming', event: 'conversation.started', status: 'success', time: '2 mins ago', responseCode: 200 },
  { id: 'log_2', webhook: 'https://zapier.com/hooks/catch/123/456', event: 'lead.created', status: 'success', time: '1 hour ago', responseCode: 200 },
  { id: 'log_3', webhook: 'https://internal-erp.local/webhook', event: 'purchase.completed', status: 'failed', time: 'Yesterday', responseCode: 502 },
  { id: 'log_4', webhook: 'https://api.myapp.com/vittain/incoming', event: 'message.received', status: 'success', time: 'Yesterday', responseCode: 200 },
]

export default function WebhooksPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])

  const handleCreate = () => {
    if (!url) {
      toast.error('Webhook URL is required')
      return
    }
    if (selectedEvents.length === 0) {
      toast.error('Select at least one event')
      return
    }
    toast.success('Webhook endpoint created successfully')
    setUrl('')
    setSelectedEvents([])
    setIsDialogOpen(false)
  }

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev => 
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
    )
  }

  const testWebhook = () => {
    toast.success('Test payload sent successfully')
  }

  const retryLog = (id: string) => {
    toast.success('Retrying webhook delivery...')
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <PageHeader title="Webhooks" description="Listen to real-time events and trigger custom logic in your external systems.">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-ink hover:bg-ink-secondary text-white shadow-sm">
              <Plus className="w-4 h-4 mr-2" /> Add Endpoint
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add Webhook Endpoint</DialogTitle>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              <div className="space-y-2">
                <Label>Target URL</Label>
                <Input 
                  placeholder="https://api.yourdomain.com/webhook" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              
              <div className="space-y-3">
                <Label>Events to send</Label>
                <div className="bg-surface-muted border border-surface-border rounded-lg p-4 max-h-[300px] overflow-y-auto space-y-6">
                  {EVENT_CATEGORIES.map(category => (
                    <div key={category.category}>
                      <h4 className="text-xs font-bold text-ink mb-3 uppercase tracking-wider">{category.category}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {category.events.map(event => (
                          <div key={event.id} className="flex items-start gap-2">
                            <Checkbox 
                              id={event.id} 
                              checked={selectedEvents.includes(event.id)}
                              onCheckedChange={() => toggleEvent(event.id)}
                            />
                            <div className="grid gap-1.5 leading-none mt-0.5">
                              <label htmlFor={event.id} className="text-sm font-medium leading-none cursor-pointer">
                                {event.label}
                              </label>
                              <p className="text-[10px] text-ink-muted font-mono">{event.id}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Secret Key (Optional)</Label>
                <Input placeholder="Leave blank to auto-generate" type="password" />
                <p className="text-[10px] text-ink-muted">Used to sign payload requests so you can verify they came from Vittain.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-surface-border">
              <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button className="bg-ink hover:bg-ink-secondary text-white" onClick={handleCreate}>
                Create Endpoint
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid grid-cols-1 gap-8 mt-4">
        {/* Webhooks Table */}
        <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-surface-muted/50">
              <TableRow>
                <TableHead>Target URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subscribed Events</TableHead>
                <TableHead className="text-right">Success Rate</TableHead>
                <TableHead className="text-right">Last Fired</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_WEBHOOKS.map((webhook) => (
                <TableRow key={webhook.id} className="hover:bg-surface-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Webhook className="w-4 h-4 text-ink-muted shrink-0" />
                      <span className="font-medium text-ink text-sm truncate max-w-[200px]" title={webhook.url}>
                        {webhook.url}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${webhook.status === 'Active' ? 'bg-status-green' : 'bg-status-red'}`} />
                      <span className="text-sm text-ink-secondary">{webhook.status}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {webhook.events.map((evt, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded bg-surface-muted border border-surface-border text-[10px] text-ink-secondary">
                          {evt}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`text-sm font-medium ${webhook.successRate === '100%' ? 'text-status-green' : webhook.successRate === '0%' ? 'text-status-red' : 'text-status-amber'}`}>
                      {webhook.successRate}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm text-ink-secondary">{webhook.lastFired}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-muted hover:text-accent" onClick={testWebhook} title="Send Test Payload">
                        <Play className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-muted hover:text-ink">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-muted hover:text-status-red">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Delivery Logs */}
        <div>
          <h2 className="text-lg font-bold text-ink mb-4">Recent Delivery Logs</h2>
          <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-surface-muted/50">
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Target URL</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_LOGS.map((log) => (
                  <TableRow key={log.id} className="hover:bg-surface-muted/30">
                    <TableCell>
                      {log.status === 'success' ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-status-green">
                          <CheckCircle2 className="w-4 h-4" /> Success
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-status-red">
                          <XCircle className="w-4 h-4" /> Failed
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-[11px] bg-surface-muted px-1.5 py-0.5 rounded border border-surface-border text-ink-secondary">
                        {log.event}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-ink-secondary truncate max-w-[200px] block" title={log.webhook}>
                        {log.webhook}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-mono font-bold ${log.responseCode === 200 ? 'text-status-green' : 'text-status-red'}`}>
                        {log.responseCode}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-ink-secondary">{log.time}</TableCell>
                    <TableCell className="text-right">
                      {log.status === 'failed' && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => retryLog(log.id)}>
                          <RefreshCw className="w-3 h-3" /> Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  )
}
