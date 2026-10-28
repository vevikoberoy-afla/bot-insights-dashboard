'use client'
import { useState, useEffect, useDeferredValue, useMemo } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Download, Search, MoreHorizontal, Filter, Plus } from 'lucide-react'
import {fetchDashboardData,readDashboardData} from '@/lib/client/featureDataCache'

export default function CrmContactsPage() {
  const cached=readDashboardData<any[]>('/api/contacts')
  const [contacts, setContacts] = useState<any[]>(cached||[])
  const [loading, setLoading] = useState(!cached)
  const [search, setSearch] = useState('')
  const deferredSearch=useDeferredValue(search.toLowerCase())

  useEffect(() => {
    void fetchDashboardData<any[]>('/api/contacts').then(setContacts).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  const filteredContacts = useMemo(()=>contacts.filter(c =>
    c.name?.toLowerCase().includes(deferredSearch) ||
    c.email?.toLowerCase().includes(deferredSearch) ||
    c.phone?.includes(deferredSearch)
  ),[contacts,deferredSearch])

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12">
      <PageHeader title="CRM Contacts" description="Manage your customer audience and segments.">
        <Button variant="outline" className="bg-surface text-ink"><Download className="w-4 h-4 mr-2" /> Export</Button>
        <Button className="bg-ink hover:bg-ink-secondary text-white"><Plus className="w-4 h-4 mr-2" /> Import Data</Button>
      </PageHeader>

      <div className="bg-surface border border-surface-border rounded-xl shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-muted/50">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input 
              placeholder="Search contacts..." 
              className="pl-9 bg-surface"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" className="bg-surface"><Filter className="w-4 h-4 mr-2" /> Filters</Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-surface sticky top-0 z-10 shadow-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[250px]">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Segment</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-ink-muted">Loading contacts...</TableCell>
                </TableRow>
              ) : filteredContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-ink-muted">No contacts found.</TableCell>
                </TableRow>
              ) : (
                filteredContacts.map((contact) => (
                  <TableRow key={contact.id} className="hover:bg-surface-muted/50">
                    <TableCell className="font-medium text-ink">{contact.name}</TableCell>
                    <TableCell className="text-ink-secondary">{contact.email || '-'}</TableCell>
                    <TableCell className="text-ink-secondary">{contact.phone || '-'}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-surface-muted border border-surface-border text-ink-secondary">
                        {contact.segment || 'Lead'}
                      </span>
                    </TableCell>
                    <TableCell className="text-ink-muted text-xs">
                      {new Date(contact.updated_at || contact.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-muted hover:text-ink"><MoreHorizontal className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination Footer */}
        <div className="p-4 border-t border-surface-border flex items-center justify-between bg-surface-muted/50">
          <p className="text-xs text-ink-muted">Showing <span className="font-medium text-ink">{filteredContacts.length}</span> of {contacts.length} results</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled className="bg-surface">Previous</Button>
            <Button variant="outline" size="sm" disabled className="bg-surface">Next</Button>
          </div>
        </div>

      </div>
    </div>
  )
}
