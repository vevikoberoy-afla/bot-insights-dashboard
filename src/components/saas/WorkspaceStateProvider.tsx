'use client'
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {dashboardArea,memberCan} from '@/lib/saas/catalog'
type Control={area?:string;feature?:string;meter?:string;write?:boolean}
type StateContext={account:any;stale:boolean;evaluate:(control:Control)=>{allowed:boolean;reason:string;remaining?:number};refresh:()=>Promise<void>}
const Context=createContext<StateContext|null>(null)
export function useWorkspaceState(){return useContext(Context)}
export function WorkspaceStateProvider({initialAccount,children}:{initialAccount:any;children:React.ReactNode}){
 const [account,setAccount]=useState(initialAccount),[stale,setStale]=useState(false),[denied,setDenied]=useState(false),inflight=useRef(false),lastChecked=useRef(Date.now()),controller=useRef<AbortController|null>(null),path=usePathname()
 const lastAttempt=useRef(0)
 const refresh=useCallback(async()=>{if(inflight.current||Date.now()-lastAttempt.current<5000)return;inflight.current=true;lastAttempt.current=Date.now();controller.current?.abort();controller.current=new AbortController();try{const r=await fetch('/api/workspaces/state',{cache:'no-store',signal:controller.current.signal});if(r.status===401||r.status===403){setDenied(true);return}if(!r.ok)throw new Error('Unavailable');const d=await r.json();if(d.workspace_id!==initialAccount.workspace.id){window.location.reload();return}setAccount((a:any)=>({...a,...d}));lastChecked.current=Date.now();setStale(false);setDenied(false)}catch(error:any){if(error?.name!=='AbortError')setStale(true)}finally{inflight.current=false}},[initialAccount.workspace.id])
 useEffect(()=>{
  // The layout already supplied fresh server state. Periodic polling is only a
  // safety net; API mutations still enforce access from the database directly.
  const refreshIfOld=()=>{if(!document.hidden&&Date.now()-lastChecked.current>=60000)void refresh()}
  const changed=()=>void refresh()
  const id=setInterval(refreshIfOld,300000)
  window.addEventListener('focus',refreshIfOld)
  window.addEventListener('online',refreshIfOld)
  window.addEventListener('workspace-state-changed',changed)
  document.addEventListener('visibilitychange',refreshIfOld)
  return()=>{clearInterval(id);controller.current?.abort();window.removeEventListener('focus',refreshIfOld);window.removeEventListener('online',refreshIfOld);window.removeEventListener('workspace-state-changed',changed);document.removeEventListener('visibilitychange',refreshIfOld)}
 },[refresh])
 const evaluate=({area,feature,meter,write=true}:Control)=>{
  if(stale||denied)return{allowed:false,reason:'Refreshing account access'}
  const e=account.entitlements
  const stopped=e.restriction_stage==='stopped'||e.operational_state==='suspended'
  if(stopped)return{allowed:false,reason:'Workspace services are paused'}
  if(area&&!memberCan(account.role,area,write,account.permissions))return{allowed:false,reason:'Your team access does not allow this action'}
  const dashboardWrite=typeof e.dashboard_write_allowed==='boolean'?e.dashboard_write_allowed:e.operational_state==='active'&&['active','trialing'].includes(e.access_state)
  if(write&&!dashboardWrite)return{allowed:false,reason:e.restriction_stage==='grace'?'Read-only during account transition':'New activity is paused for this account'}
  if(feature&&!e.features[feature])return{allowed:false,reason:'Feature not included in your current access'}
  const u=account.usage?.find((u:any)=>u.meter===meter)
  if(u&&u.remaining<=0&&e.enforcement_mode==='enforced')return{allowed:false,reason:'Allowance reached',remaining:0}
  return{allowed:true,reason:'',remaining:u?.remaining}
 }
 const e=account.entitlements,stopped=e.restriction_stage==='stopped'||e.operational_state==='suspended',recovery=path.startsWith('/settings/support')||path.startsWith('/settings/billing')
 const pageArea=dashboardArea(path),pageAllowed=memberCan(account.role,pageArea,false,account.permissions)
 const readOnly=typeof e.dashboard_write_allowed==='boolean'?!e.dashboard_write_allowed:e.operational_state!=='active'||!['active','trialing'].includes(e.access_state)
 const creationRoute=/\/(new|create|add)(?:\/|$)/.test(path)
 const unavailable=<main className="m-auto max-w-lg p-10"><h1 className="text-xl font-semibold">Workspace services are paused</h1><p className="my-4 text-sm text-slate-500">Live services and workspace changes are unavailable. Your existing data remains stored.</p><Link href="/settings/support" className="text-blue-600">Account support</Link></main>
 const readOnlyPage=<main className="m-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-10"><h1 className="text-xl font-semibold text-amber-950">Workspace is read-only</h1><p className="my-4 text-sm text-amber-900">New resources and configuration changes are paused during this account transition. Existing data is still available from the list pages.</p><Link href="/settings/billing" className="font-medium text-amber-950 underline">View plan and account</Link></main>
 const noAccess=<main className="m-auto max-w-lg rounded-2xl border bg-white p-10"><h1 className="text-xl font-semibold">You do not have access to this area</h1><p className="my-4 text-sm text-slate-500">Ask your workspace administrator to update your permissions in Team & Access.</p><Link href="/overview" className="font-medium text-blue-600">Return to your workspace</Link></main>
 return <Context.Provider value={{account,stale,evaluate,refresh}}>{denied?<main className="m-auto max-w-lg p-10"><h1 className="text-xl font-semibold">Workspace access changed</h1><p className="my-4 text-sm text-slate-500">Your membership or session is no longer active.</p><Link href="/auth/login" className="text-blue-600">Sign in again</Link></main>:stopped&&!recovery?unavailable:!pageAllowed&&!recovery?noAccess:readOnly&&creationRoute&&!recovery?readOnlyPage:children}</Context.Provider>
}
