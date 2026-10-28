'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Edit, List, Users } from 'lucide-react'
import { toast } from 'sonner'

const MOCK_GROUPS = [
  { id: 'g1', name: 'Marketing & Promotions', type: 'marketing',  contacts: 4201, desc: 'Weekly newsletter, seasonal sales, and special offers.' },
  { id: 'g2', name: 'Product Updates',        type: 'utility',    contacts: 8932, desc: 'New feature announcements and platform updates.' },
  { id: 'g3', name: 'Order Updates',          type: 'utility',    contacts: 12450, desc: 'Shipping confirmations and delivery notifications.' },
]

function CreateGroupModal({ onClose, onSave }: { onClose: () => void; onSave: (g: any) => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [type, setType] = useState('marketing')

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-ink">Create Subscription Group</h2>
        <div><label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider block mb-1.5">Group Name</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly Newsletter" className="h-9" /></div>
        <div><label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider block mb-1.5">Description (visible to users)</label><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent resize-none" placeholder="What kind of messages will they receive?" /></div>
        <div><label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider block mb-1.5">Category</label>
          <select value={type} onChange={e => setType(e.target.value)} className="w-full h-9 border border-surface-border rounded-lg px-3 text-sm bg-surface focus:outline-none focus:ring-1 focus:ring-accent">
            <option value="marketing">Marketing (Requires opt-in)</option>
            <option value="utility">Utility (Account & Orders)</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="h-9">Cancel</Button>
          <Button onClick={() => { onSave({ id: `g${Date.now()}`, name, desc, type, contacts: 0 }); onClose() }} className="h-9 bg-ink text-white hover:bg-ink-secondary">Create Group</Button>
        </div>
      </div>
    </div>
  )
}

export default function SubscriptionGroupsPage() {
  const [groups, setGroups] = useState(MOCK_GROUPS)
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 pb-12">
      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onSave={g => { setGroups(p => [...p, g]); toast.success('Group created') }} />}

      <PageHeader title="Subscription Groups" description="Manage opt-in categories for email and WhatsApp campaigns.">
        <Button onClick={() => setShowCreate(true)} className="h-9 text-xs bg-ink text-white hover:bg-ink-secondary">
          <Plus className="w-4 h-4 mr-2" /> Create Group
        </Button>
      </PageHeader>
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Preview configuration: subscription changes on this screen are not persisted yet.</div>

      <div className="bg-surface border border-surface-border rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-border bg-surface-muted/30">
          <h3 className="text-sm font-bold text-ink">Active Groups</h3>
          <span className="text-[12px] text-ink-muted">{groups.length} groups</span>
        </div>
        <div className="divide-y divide-surface-border">
          {groups.map(g => (
            <div key={g.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 group hover:bg-surface-muted/30 transition-colors gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5"><List className="w-4 h-4 text-blue-500" /></div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-ink text-[14px]">{g.name}</p>
                    <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-600 rounded-full text-[9px] font-bold uppercase tracking-wider">{g.type}</span>
                  </div>
                  <p className="text-[12px] text-ink-secondary">{g.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 sm:justify-end">
                <div className="flex items-center gap-1.5 text-[12px] text-ink-secondary font-medium">
                  <Users className="w-4 h-4 text-ink-muted" /> {g.contacts.toLocaleString()} subscribers
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-ink-muted hover:text-ink"><Edit className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-ink-muted hover:text-red-500" onClick={() => setGroups(p => p.filter(x => x.id !== g.id))}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
