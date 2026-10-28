'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Megaphone, Bot, BookOpen, Database, Ticket,
  MessageSquare, FileText, NotebookPen, Layers, Webhook,
  ChevronDown, Plus, List, BarChart2, Users, MessageCircle, Smartphone, Mail, Globe, Settings2, Radio,
  TrendingUp, Activity, Kanban, Clock, Zap, Star, GitBranch, Plug, Tag, ShieldCheck,
  CreditCard, Lock, Settings, ShoppingBag, CalendarDays
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {useWorkspaceState} from '@/components/saas/WorkspaceStateProvider'
import {dashboardArea} from '@/lib/saas/catalog'
import {prefetchDashboardRoute} from '@/lib/client/featureDataCache'

function NavItem({ href, icon: Icon, label, active, isSubItem = false, badge }: any) {
  const access=useWorkspaceState()
  const creation=href.includes('/new')||href.includes('/create')||href.includes('/add')||/^(create|add|new)\b/i.test(label)
  const area=dashboardArea(href)
  const meter=creation?(area==='bots'?'bots.retained':area==='knowledge'?'knowledge.datasets':area==='sources'?'sources.active':area==='products'?'products.retained':area==='services'?'services.active':undefined):undefined
  const visibility=access?.evaluate({area,write:false})
  const decision=creation?access?.evaluate({area,meter,write:true}):null
  const router = useRouter()
  const prefetchTimer = useRef<ReturnType<typeof setTimeout>|null>(null)
  const content = (
    <>
      {Icon && <Icon className={cn("h-4 w-4 shrink-0", active ? "text-ink" : "text-ink-muted")} />}
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {badge}
        </span>
      )}
    </>
  )

  const className = cn(
    "flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-lg mx-1 transition-all",
    isSubItem && "pl-8",
    active
      ? "bg-surface-subtle text-ink font-medium"
      : "text-ink-secondary hover:bg-surface-subtle hover:text-ink"
  )

  if(visibility&&!visibility.allowed)return null
  if(decision&&!decision.allowed)return <span aria-disabled="true" title={decision.reason} className={`${className} cursor-not-allowed opacity-45`}>{content}</span>
  const prefetch=()=>{router.prefetch(href);prefetchDashboardRoute(href)}
  return <Link href={href} className={className} onPointerEnter={()=>{prefetchTimer.current=setTimeout(prefetch,60)}} onPointerLeave={()=>{if(prefetchTimer.current)clearTimeout(prefetchTimer.current)}} onFocus={prefetch}>{content}</Link>
}

function NavGroup({ label, icon: Icon, children, defaultOpen = true }: any) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-ink-secondary rounded-lg mx-1 hover:bg-surface-subtle hover:text-ink transition-all cursor-pointer group">
          {Icon && <Icon className="h-4 w-4 text-ink-muted shrink-0 group-hover:text-ink transition-colors" />}
          <span className="flex-1 font-medium">{label}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-ink-muted transition-transform duration-200", isOpen && "rotate-180")} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-0.5 space-y-0.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="mt-5 mb-1 px-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">{label}</p>
    </div>
  )
}

export function Sidebar({ clientData }: { clientData?: any }) {
  const pathname = usePathname()
  const [storefronts,setStorefronts]=useState<any[]>(clientData?.storefronts||[])
  useEffect(()=>{
    const changed=(event:Event)=>{
      const detail=(event as CustomEvent).detail
      if(Array.isArray(detail?.stores)){setStorefronts(detail.stores);return}
      if(detail?.store)setStorefronts(current=>[...current.filter(store=>store.id!==detail.store.id),detail.store])
    }
    window.addEventListener('storefront-updated',changed)
    return()=>window.removeEventListener('storefront-updated',changed)
  },[])

  const initials = clientData?.name
    ? clientData.name.substring(0, 2).toUpperCase()
    : 'VI'

  return (
    <div className="w-[240px] flex-shrink-0 bg-surface-muted border-r border-surface-border h-full flex flex-col">
      {/* Logo */}
      <div className="h-12 border-b border-surface-border px-4 flex items-center gap-2 flex-shrink-0">
        <div className="w-6 h-6 bg-accent text-white rounded-md flex items-center justify-center font-bold text-xs">V</div>
        <span className="font-semibold text-ink tracking-tight">Vittain AI</span>
      </div>

      {/* Scrollable Nav */}
      <div className="flex-1 overflow-y-auto py-2 scrollbar-none">

        {/* Main */}
        <div className="space-y-0.5 mt-2">
          <NavItem href="/overview" icon={LayoutDashboard} label="Overview" active={pathname === '/overview'} />
          <NavItem href="/inbox" icon={Radio} label="Live Inbox" active={pathname.startsWith('/inbox')} badge={3} />
        </div>

        <SectionLabel label="My Store" />
        <NavGroup label="My Store" icon={Layers} defaultOpen={pathname.startsWith('/features')}>
          {!storefronts.length&&<NavItem href="/features" icon={Plus} label="Set up My Store" isSubItem active={pathname === '/features'} />}
          {storefronts.map(store=>{
            const href=`/features/stores/${encodeURIComponent(store.id)}`
            return <NavItem key={store.id} href={href} icon={store.kind==='commerce'?ShoppingBag:CalendarDays} label={store.name} isSubItem active={pathname===href}/>
          })}
          {!!storefronts.length&&<NavItem href="/features/store-settings" icon={Settings2} label="Store settings" isSubItem active={pathname === '/features/store-settings'} />}
        </NavGroup>

        {/* Campaigns */}
        <SectionLabel label="Campaigns" />
        <div className="space-y-0.5">
          <NavGroup label="Campaigns" icon={Megaphone}>
            <NavItem href="/campaigns/all" icon={List} label="All Campaigns" isSubItem active={pathname === '/campaigns/all'} />
            <NavItem href="/campaigns/create" icon={Plus} label="Create Campaign" isSubItem active={pathname === '/campaigns/create'} />
            <NavItem href="/campaigns/journeys" icon={GitBranch} label="Journeys" isSubItem active={pathname === '/campaigns/journeys'} />
            <NavItem href="/campaigns/whatsapp/templates" icon={MessageCircle} label="WA Templates" isSubItem active={pathname.startsWith('/campaigns/whatsapp')} />
            <NavItem href="/campaigns/sms" icon={Smartphone} label="SMS" isSubItem active={pathname === '/campaigns/sms'} />
            <NavItem href="/campaigns/email" icon={Mail} label="Email" isSubItem active={pathname === '/campaigns/email'} />
            <NavItem href="/campaigns/coupons" icon={Tag} label="Coupons" isSubItem active={pathname === '/campaigns/coupons'} />
          </NavGroup>
        </div>

        {/* Bots */}
        <SectionLabel label="Bots" />
        <div className="space-y-0.5">
        <NavGroup label="Bots" icon={Bot}>
            <NavItem href="/bots/all" icon={List} label="All Bots" isSubItem active={pathname === '/bots/all'} />
            <NavItem href="/bots/new" icon={Plus} label="Create Bot" isSubItem active={pathname === '/bots/new'} />
            <NavItem href="/bots/emails" icon={Mail} label="Emails" isSubItem active={pathname.startsWith('/bots/emails')} />
            <NavItem href="/bots/triggers" icon={Zap} label="Proactive Triggers" isSubItem active={pathname === '/bots/triggers'} />
            <NavItem href="/bots/triggers/analytics" icon={BarChart2} label="Cart & WA Analytics" isSubItem active={pathname === '/bots/triggers/analytics'} />
          </NavGroup>
        </div>

        {/* Analytics */}
        <SectionLabel label="Analytics" />
        <div className="space-y-0.5">
          <NavItem href="/analytics" icon={TrendingUp} label="Overview" active={pathname === '/analytics'} />
          <NavItem href="/analytics/behavior" icon={Activity} label="Customer Behavior" active={pathname === '/analytics/behavior'} />
          <NavItem href="/analytics/lead-scores" icon={Star} label="Lead Scores" active={pathname === '/analytics/lead-scores'} />
        </div>

        {/* CRM */}
        <SectionLabel label="CRM" />
        <div className="space-y-0.5">
          <NavGroup label="Contacts" icon={Users}>
            <NavItem href="/contacts" icon={List} label="All Contacts" isSubItem active={pathname === '/contacts' || pathname === '/contacts/all'} />
            <NavItem href="/contacts/segments" icon={Layers} label="Segments" isSubItem active={pathname === '/contacts/segments'} />
            <NavItem href="/contacts/pipeline" icon={Kanban} label="Lead Pipeline" isSubItem active={pathname === '/contacts/pipeline'} />
          </NavGroup>
          <NavGroup label="Tickets" icon={Ticket} defaultOpen={false}>
            <NavItem href="/tickets/new" icon={Plus} label="New Ticket" isSubItem active={pathname === '/tickets/new'} />
            <NavItem href="/tickets/all" icon={List} label="All Tickets" isSubItem active={pathname === '/tickets/all'} />
            <NavItem href="/tickets/analytics" icon={BarChart2} label="Analytics" isSubItem active={pathname === '/tickets/analytics'} />
          </NavGroup>
        </div>

        {/* Knowledge */}
        <SectionLabel label="Knowledge" />
        <div className="space-y-0.5">
          <NavGroup label="Knowledge Base" icon={BookOpen} defaultOpen={false}>
            <NavItem href="/knowledge/add" icon={Plus} label="Add Chunk" isSubItem active={pathname === '/knowledge/add'} />
            <NavItem href="/knowledge/all" icon={List} label="All Chunks" isSubItem active={pathname === '/knowledge/all'} />
          </NavGroup>
          <NavGroup label="Databases" icon={Database} defaultOpen={false}>
            <NavItem href="/databases/add" icon={Plus} label="Add Database" isSubItem active={pathname === '/databases/add'} />
            <NavItem href="/databases/all" icon={List} label="All Databases" isSubItem active={pathname === '/databases/all'} />
          </NavGroup>
        </div>

        {/* Content */}
        <SectionLabel label="Content" />
        <div className="space-y-0.5">
          <NavGroup label="Templates" icon={FileText} defaultOpen={false}>
            <NavItem href="/templates/create" icon={Plus} label="Create Template" isSubItem active={pathname === '/templates/create'} />
            <NavItem href="/templates/all" icon={List} label="My Templates" isSubItem active={pathname === '/templates/all'} />
          </NavGroup>
          <NavItem href="/notepad" icon={NotebookPen} label="Notepad" active={pathname === '/notepad'} />
        </div>

        {/* Settings */}
        <SectionLabel label="Settings" />
        <div className="space-y-0.5 pb-6">
          <NavGroup label="Settings & Account" icon={Settings2} defaultOpen={pathname.startsWith('/settings') || pathname === '/webhooks'}>
            <NavItem href="/settings/billing" icon={CreditCard} label="Plan & Account" isSubItem active={pathname === '/settings/billing'} />
            <NavItem href="/settings/security" icon={Lock} label="Account Security" isSubItem active={pathname === '/settings/security'} />
            <NavItem href="/settings" icon={ShieldCheck} label="Data Retention" isSubItem active={pathname === '/settings'} />
            <NavItem href="/settings/usage" icon={BarChart2} label="Usage & Limits" isSubItem active={pathname === '/settings/usage'} />
            <NavItem href="/settings/team" icon={Users} label="Team & Access" isSubItem active={pathname === '/settings/team'} />
            <NavItem href="/settings/data-privacy" icon={FileText} label="Data Privacy" isSubItem active={pathname === '/settings/data-privacy'} />
            <NavItem href="/settings/integrations" icon={Plug} label="Integrations" isSubItem active={pathname === '/settings/integrations'} />
            <NavItem href="/settings/hours" icon={Clock} label="Business Hours" isSubItem active={pathname === '/settings/hours'} />
            <NavItem href="/settings/canned" icon={MessageSquare} label="Canned Responses" isSubItem active={pathname === '/settings/canned'} />
            <NavItem href="/webhooks" icon={Webhook} label="Webhooks" isSubItem active={pathname === '/webhooks'} />
          </NavGroup>
        </div>
      </div>

      {/* Account Footer with Admin test user & Settings Logo */}
      <div className="border-t border-surface-border p-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-surface-subtle transition-all group">
          <Link
            href="/settings/billing"
            className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
            title="Open Account Settings"
          >
            <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold shadow-sm shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate leading-tight">
                {clientData?.name || 'Admin test user'}
              </p>
              <p className="text-[10px] uppercase text-ink-muted font-semibold tracking-wider mt-0.5">
                Pro Plan
              </p>
            </div>
          </Link>
          <Link
            href="/settings/billing"
            title="Account Settings"
            aria-label="Account Settings"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface border border-transparent hover:border-surface-border transition-all shrink-0 cursor-pointer"
          >
            <Settings className="w-4 h-4 transition-transform group-hover:rotate-45 duration-300" />
          </Link>
        </div>
      </div>
    </div>
  )
}
