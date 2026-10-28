'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Activity, Building2, Users, Layers, CreditCard, LifeBuoy, ShieldCheck, ScrollText, SlidersHorizontal, Cable, LayoutDashboard, LogOut } from 'lucide-react'
const items = [
  ['Overview','/admin',LayoutDashboard],['Workspaces','/admin/workspaces',Building2],['Plans & features','/admin/plans',Layers],
  ['Subscriptions','/admin/subscriptions',CreditCard],['Usage','/admin/usage',Activity],['Customer requests','/admin/support',LifeBuoy],
  ['Connected channels','/admin/integrations',Cable],['Users','/admin/users',Users],['Staff & security','/admin/security',ShieldCheck],
  ['Delivery operations','/admin/jobs',Activity],
  ['Audit trail','/admin/audit',ScrollText],['Feature availability','/admin/releases',SlidersHorizontal],
] as const
export function ControlNavigation({email,role}:{email:string;role:string}) {
  const path=usePathname()
  return <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-slate-200 bg-white md:w-60"><div className="flex h-16 items-center gap-3 px-4"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">V</div><span className="hidden text-sm font-semibold md:block">Platform admin</span></div><nav className="flex-1 space-y-1 overflow-y-auto px-2 py-5">{items.filter(([name])=>name==='Users'?['platform_owner','operations_admin','security_operator'].includes(role):name==='Staff & security'?['platform_owner','security_operator'].includes(role):true).map(([name,href,Icon])=><Link title={name} key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${path===href || (href==='/admin/workspaces' && path.startsWith(href+'/'))?'bg-blue-50 font-medium text-blue-700':'text-slate-500 hover:bg-slate-50'}`}><Icon size={18} className="shrink-0"/><span className="hidden md:block">{name}</span></Link>)}</nav><div className="border-t p-4"><p className="hidden truncate text-xs font-medium md:block">{email}</p><p className="my-2 hidden text-[11px] text-slate-400 md:block">{role.replaceAll('_',' ')}</p><button title="Sign out" className="flex items-center gap-2 text-xs text-slate-500" onClick={async()=>{await createClient().auth.signOut();window.location.assign('/auth/login')}}><LogOut size={16}/><span className="hidden md:block">Sign out</span></button></div></aside>
}
