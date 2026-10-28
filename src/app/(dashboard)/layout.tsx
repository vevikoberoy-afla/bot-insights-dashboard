'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Sidebar } from '@/components/layout/sidebar'
import { TopBar } from '@/components/layout/topbar'
import { DashboardShellSkeleton } from '@/components/ui/dashboard-skeleton'
import { setActiveWorkspace } from '@/lib/client/workspace'
import { WorkspaceAccessBanner } from '@/components/saas/WorkspaceAccessBanner'
import {WorkspaceStateProvider} from '@/components/saas/WorkspaceStateProvider'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  const supabase = createClient()
  const [clientData, setClientData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accountError, setAccountError] = useState('')
  const [memberships, setMemberships] = useState<any[]>([])
  const [account,setAccount] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }: any) => {
      if (error || !data.user) {
        router.push('/auth/login')
        return
      }
      fetch('/api/workspaces/current', { cache: 'no-store' }).then(async response => {
        const account = await response.json()
        if (!response.ok) throw new Error(account.error || 'Could not load your workspace')
        setActiveWorkspace(account.workspace.id)
        setMemberships(account.memberships)
        setAccount(account)
        return { data: account.workspace, error: null }
      }).then(async ({ data: client, error }: any) => {
          if (error) console.error("Could not fetch client data", error)
          if (client) {
            setClientData(client)
            if (!client.context_id) {
              try {
                const ctxRes = await fetch(`/api/client/context?client_id=${client.id}`)
                if (ctxRes.ok) {
                  const ctxData = await ctxRes.json()
                  if (ctxData?.context_id) {
                    setClientData((prev: any) => ({ ...prev, context_id: ctxData.context_id }))
                  }
                }
              } catch {}
            }
          }
          setLoading(false)
        }).catch(error => { setAccountError(error.message); setLoading(false) })
    })
  }, [])

  if (loading) {
    return <DashboardShellSkeleton />
  }
  if (accountError) return <main className="mx-auto max-w-xl p-10"><h1 className="text-xl font-semibold">Workspace unavailable</h1><p role="alert" className="my-4 text-sm text-slate-600">{accountError}</p><button className="text-blue-600" onClick={() => window.location.reload()}>Try again</button></main>

  return (
    <WorkspaceStateProvider initialAccount={account}><div className="flex h-screen overflow-hidden bg-surface text-ink font-sans">
      <Sidebar clientData={clientData} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar clientData={clientData} />
        {account && <WorkspaceAccessBanner account={account}/>}
        {memberships.length > 1 && <div className="border-b bg-white px-4 py-2"><label className="text-xs text-slate-500">Workspace <select className="ml-2 rounded-lg border p-1 text-sm" value={clientData?.id} onChange={async e => { const response = await fetch('/api/workspaces/current', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace_id:e.target.value}) });if(response.ok)window.location.reload();else setAccountError('Could not switch workspaces.') }}>{memberships.map(m => <option key={m.client_id} value={m.client_id}>{m.clients?.name || m.clients?.email || m.client_id}</option>)}</select></label></div>}
        <main className="flex-1 overflow-auto p-2">
          {children}
        </main>
      </div>
    </div></WorkspaceStateProvider>
  )
}
