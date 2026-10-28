'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { memberCan } from '@/lib/saas/catalog'
import {useWorkspaceState} from './WorkspaceStateProvider'
export function WorkspaceAccessBanner({account}:{account:any}){
 const live=useWorkspaceState();account=live?.account||account
 const path=usePathname(),e=account.entitlements
 const feature=path.startsWith('/features/commerce')?'commerce.enabled':path.startsWith('/features')?'booking.enabled':path.startsWith('/knowledge')?'knowledge.enabled':path.startsWith('/databases')?'sources.enabled':path.startsWith('/campaigns')?'campaigns.enabled':null
 let text=account.notice||''
 if(live?.stale)text='Account access is being refreshed. Please wait before making changes.'
 if(e.restriction_stage==='grace'){
  const deadline=e.service_stops_at?new Date(e.service_stops_at):null
  const remaining=Math.max(0,Number(e.seconds_until_shutdown||0)),days=Math.ceil(remaining/86400)
  text=`Workspace is read-only during a transition. Live services stop ${deadline?deadline.toLocaleString():'at the configured deadline'}${days?` (${days} day${days===1?'':'s'} remaining)`:''}.`
 }
 else if(e.restriction_stage==='stopped'||e.operational_state!=='active')text='Workspace services are paused. Existing data is retained; contact the platform team to restore access.'
 else if(!['active','trialing','past_due_grace'].includes(e.access_state))text='Your subscription is restricted. Existing orders, bookings and human support remain available; new transactions are paused.'
 else if(feature&&!e.features[feature])text='This feature is not enabled for your workspace. Existing records are retained.'
 const area=path.split('/')[1]
 if(!memberCan(account.role,area,false)&&!['overview','settings'].includes(area))text='Your team role may not have permission to use the controls on this page.'
 const broadcasts=Array.isArray(account.broadcasts)?account.broadcasts:[],broadcast=broadcasts[0]
 if(!text&&!broadcast)return null
 const colors=broadcast?.severity==='critical'?'border-rose-200 bg-rose-50 text-rose-900':broadcast?.severity==='success'?'border-emerald-200 bg-emerald-50 text-emerald-900':'border-amber-100 bg-amber-50 text-amber-900'
 return <div role={broadcast?.severity==='critical'?'alert':'status'} className={`border-b px-5 py-3 text-sm ${colors}`}>{broadcast&&<><strong className="mr-2">{broadcast.title}</strong><span>{broadcast.message}</span>{text&&<span className="mx-2">·</span>}</>}{text} {text&&<Link href="/settings/billing" className="font-medium underline">Plan & account</Link>}</div>
}
