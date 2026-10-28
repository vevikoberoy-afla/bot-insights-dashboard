'use client'

import {useEffect,useRef,useState} from 'react'
import {CheckCircle2,RefreshCw,ShieldAlert} from 'lucide-react'

export function WhatsAppReadiness({botId}:{botId:string}){
 const[state,setState]=useState<any>(null),[busy,setBusy]=useState(false)
 const request=useRef<AbortController|null>(null)
 async function load(live=false){if(!botId)return;request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);try{const response=await fetch(`/api/whatsapp/readiness?botId=${encodeURIComponent(botId)}${live?'&live=1':''}`,{cache:'no-store',signal:controller.signal}),body=await response.json();if(!controller.signal.aborted)setState(response.ok?body:{ready:false,checks:[],live:{ok:false,detail:body.error||'Readiness check failed.'}})}catch(error:any){if(error.name!=='AbortError')setState({ready:false,checks:[],live:{ok:false,detail:'Readiness check failed.'}})}finally{if(!controller.signal.aborted)setBusy(false)}}
 useEffect(()=>{setState(null);void load();return()=>request.current?.abort()},[botId])
 if(!botId)return null
 const failed=(state?.checks||[]).filter((check:any)=>!check.ok)
 return <div className={`rounded-2xl border p-4 text-xs ${state?.ready?'border-emerald-200 bg-emerald-50 text-emerald-900':'border-amber-200 bg-amber-50 text-amber-950'}`}>
  <div className="flex items-center justify-between gap-3"><strong className="flex items-center gap-2">{state?.ready?<CheckCircle2 className="h-4 w-4"/>:<ShieldAlert className="h-4 w-4"/>}Production readiness</strong><button disabled={busy} onClick={()=>load(true)} className="flex items-center gap-1 rounded-lg border border-current/20 bg-white/60 px-2 py-1 disabled:opacity-50"><RefreshCw className={`h-3 w-3 ${busy?'animate-spin':''}`}/>Test Meta</button></div>
  {!state?<p className="mt-2">Checking configuration…</p>:state.ready?<p className="mt-2">Queue, Redis, signatures, storage, and Meta settings are ready.</p>:<ul className="mt-2 space-y-1">{failed.slice(0,3).map((check:any)=><li key={check.key}>• {check.label}: {check.detail}</li>)}{state.live&&!state.live.ok&&<li>• Live Meta: {state.live.detail}</li>}</ul>}
  {state?.phoneHealth&&<p className="mt-2 border-t border-current/10 pt-2">Meta tier: <strong>{String(state.phoneHealth.messaging_limit_tier||'TIER_1K').replace('TIER_','')}</strong> · {Number(state.phoneHealth.max_daily_recipients||1000).toLocaleString()} unique recipients / rolling 24h · <span className="capitalize">{String(state.phoneHealth.status||'connected').toLowerCase()}</span></p>}
 </div>
}
