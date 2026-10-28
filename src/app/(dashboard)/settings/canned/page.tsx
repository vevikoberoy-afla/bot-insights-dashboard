'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MessageSquare, Plus, MoreHorizontal, Search, Trash2, Edit2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const MOCK_RESPONSES = [
  { id: 1, name: 'Greeting', category: 'General', text: 'Hi {{name}}, how can I help you today?', uses: 1240 },
  { id: 2, name: 'Pricing Link', category: 'Sales', text: 'You can find our full pricing details at https://vittain.com/pricing', uses: 890 },
  { id: 3, name: 'Return Policy', category: 'Support', text: 'We offer a 30-day money-back guarantee. Would you like me to start a return for you?', uses: 412 },
  { id: 4, name: 'Transfer to Human', category: 'General', text: 'I am transferring you to a human agent who can help with this.', uses: 350 },
]

export default function CannedResponsesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('General')
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')

  const handleCreate = () => {
    if (!name || !text) {
      toast.error('Name and message text are required')
      return
    }
    toast.success('Canned response created successfully')
    setName('')
    setText('')
    setCategory('General')
    setIsDialogOpen(false)
  }

  const filtered = MOCK_RESPONSES.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase()) || 
    r.text.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12 max-w-5xl mx-auto">
      <PageHeader title="Canned Responses" description="Create quick-reply templates for your human agents to use during live chats.">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-ink hover:bg-ink-secondary text-white shadow-sm">
              <Plus className="w-4 h-4 mr-2" /> New Response
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Canned Response</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Response Name</Label>
                  <Input 
                    placeholder="e.g. Greeting" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="General">General</SelectItem>
                      <SelectItem value="Sales">Sales</SelectItem>
                      <SelectItem value="Support">Support</SelectItem>
                      <SelectItem value="Technical">Technical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Message Text</Label>
                <Textarea 
                  placeholder="Hi {{name}}, how can I help?" 
                  rows={4}
                  className="resize-none"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <p className="text-[10px] text-ink-muted flex items-center justify-between">
                  <span>Available variables: {'{{name}}'}, {'{{email}}'}</span>
                  <span>{text.length} chars</span>
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-surface-border">
              <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button className="bg-ink hover:bg-ink-secondary text-white" onClick={handleCreate}>
                Save Response
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-muted/50">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input 
              placeholder="Search responses..." 
              className="pl-9 bg-surface"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader className="bg-surface">
            <TableRow>
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead className="w-[100px]">Category</TableHead>
              <TableHead>Message Text</TableHead>
              <TableHead className="text-right w-[100px]">Times Used</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-ink-muted">No responses found.</TableCell>
              </TableRow>
            ) : (
              filtered.map((resp) => (
                <TableRow key={resp.id} className="hover:bg-surface-muted/30 group">
                  <TableCell className="font-medium text-ink">{resp.name}</TableCell>
                  <TableCell>
                    <span className="px-2 py-0.5 rounded-full bg-surface-muted border border-surface-border text-[10px] text-ink-secondary">
                      {resp.category}
                    </span>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm text-ink-secondary truncate max-w-[400px]">
                      {resp.text}
                    </p>
                  </TableCell>
                  <TableCell className="text-right text-sm text-ink-secondary">{resp.uses}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-muted hover:text-ink">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-muted hover:text-status-red">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

    </div>
  )
}
