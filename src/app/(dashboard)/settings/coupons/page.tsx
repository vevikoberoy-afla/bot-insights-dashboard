'use client'
import {useEffect,useMemo,useState} from 'react'
import {AlertCircle,Edit,Percent,Plus,Tag,Trash2,X} from 'lucide-react'
import {toast} from 'sonner'
import {PageHeader} from '@/components/shared/page-header'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Switch} from '@/components/ui/switch'

const blank={code:'',description:'',discount_type:'percentage',discount_value:'',min_cart_value:'0',max_uses:'',expires_at:'',product_ids:[] as string[],service_ids:[] as string[],categories:[] as string[],stackable:false,compatible_offer_ids:[] as string[],is_active:true}

function Editor({value,products,services,offers,onClose,onSaved}:{value:any;products:any[];services:any[];offers:any[];onClose:()=>void;onSaved:(coupon:any)=>void}){
 const [form,setForm]=useState({...blank,...value,expires_at:value?.expires_at?.slice(0,10)||''}),[busy,setBusy]=useState(false)
 const categories=useMemo(()=>Array.from(new Set<string>(products.map(product=>product.category).filter(Boolean))),[products])
 const set=(key:string,next:any)=>setForm((old:any)=>({...old,[key]:next}))
 const toggle=(key:'categories'|'product_ids'|'service_ids'|'compatible_offer_ids',item:string)=>set(key,form[key].includes(item)?form[key].filter((value:string)=>value!==item):[...form[key],item])
 const previewTargets=[...products.filter(product=>form.product_ids.includes(product.id)||(!form.product_ids.length&&form.categories.includes(product.category))),...services.filter(service=>form.service_ids.includes(service.id))].slice(0,6)
 const discountFor=(price:number)=>Math.min(Number(price||0),form.discount_type==='percentage'?Number(price||0)*Math.min(100,Number(form.discount_value||0))/100:Number(form.discount_value||0))
 async function save(){setBusy(true);try{const response=await fetch('/api/settings/coupons',{method:value?.id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}),body=await response.json();if(!response.ok)throw new Error(body.error);onSaved(body);onClose();toast.success(value?.id?'Coupon updated':'Coupon created')}catch(error:any){toast.error(error.message)}finally{setBusy(false)}}
 return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
  <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={event=>event.stopPropagation()}>
   <header className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold">{value?.id?'Edit':'Create'} coupon</h2><p className="text-xs text-ink-muted">Set the unlock value and applicable catalogue scope.</p></div><button onClick={onClose}><X className="h-5 w-5"/></button></header>
   <div className="grid gap-4 sm:grid-cols-2">
    <label className="text-xs font-semibold">Code<Input className="mt-1" value={form.code} onChange={e=>set('code',e.target.value.toUpperCase())}/></label>
    <label className="text-xs font-semibold">Type<select className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" value={form.discount_type} onChange={e=>set('discount_type',e.target.value)}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>
    <label className="text-xs font-semibold">Discount value<Input className="mt-1" type="number" min="0" value={form.discount_value} onChange={e=>set('discount_value',e.target.value)}/></label>
    <label className="text-xs font-semibold">Unlock at cart value<Input className="mt-1" type="number" min="0" value={form.min_cart_value} onChange={e=>set('min_cart_value',e.target.value)}/></label>
    <label className="text-xs font-semibold">Maximum uses (optional)<Input className="mt-1" type="number" min="1" value={form.max_uses||''} onChange={e=>set('max_uses',e.target.value)}/></label>
    <label className="text-xs font-semibold">Expiry (optional)<Input className="mt-1" type="date" value={form.expires_at||''} onChange={e=>set('expires_at',e.target.value)}/></label>
   </div>
   <label className="mt-4 block text-xs font-semibold">Description<Input className="mt-1" value={form.description||''} onChange={e=>set('description',e.target.value)}/></label>
   <div className="mt-5 grid gap-4 sm:grid-cols-2">
    <Scope title="Categories" empty="No categories yet." items={categories.map(category=>({id:category,label:category}))} selected={form.categories} onToggle={id=>toggle('categories',id)}/>
    <Scope title="Specific products" empty="No products yet." items={products.map(product=>({id:product.id,label:`${product.name} · ${product.sku}`}))} selected={form.product_ids} onToggle={id=>toggle('product_ids',id)}/>
    <Scope title="Booking services" empty="No booking services yet." items={services.map(service=>({id:service.id,label:service.name}))} selected={form.service_ids} onToggle={id=>toggle('service_ids',id)}/>
   </div>
   <p className="mt-3 text-[11px] text-ink-muted">Leave product/category scope empty for every product. Select services when this coupon is intended for bookings.</p>
   {previewTargets.length>0&&<section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"><p className="text-xs font-bold text-emerald-900">Estimated customer discount</p><div className="mt-2 grid gap-1 sm:grid-cols-2">{previewTargets.map(item=><p key={item.id} className="text-[11px] text-emerald-800">{item.name}: {item.currency||'INR'} {discountFor(Number(item.price||0)).toLocaleString()} off · final {item.currency||'INR'} {Math.max(0,Number(item.price||0)-discountFor(Number(item.price||0))).toLocaleString()}</p>)}</div></section>}
   <section className="mt-4 rounded-xl border p-3"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Allow offer stacking</p><p className="text-[11px] text-ink-muted">Off by default. A coupon is combined only with offers explicitly selected below.</p></div><Switch checked={form.stackable} onCheckedChange={value=>setForm((old:any)=>({...old,stackable:value,compatible_offer_ids:value?old.compatible_offer_ids:[]}))}/></div>{form.stackable&&<div className="mt-3"><Scope title="Can be combined with" empty="Create an offer first." items={offers.filter(offer=>offer.status!=='ended').map(offer=>({id:offer.id,label:`${offer.name} · ${offer.product_id?'Product':'Booking'}`}))} selected={form.compatible_offer_ids} onToggle={id=>toggle('compatible_offer_ids',id)}/>{!form.compatible_offer_ids.length&&<p className="mt-2 text-[11px] font-medium text-amber-700">No offer selected, so this coupon still cannot be stacked.</p>}</div>}</section>
   <div className="mt-4 flex items-center justify-between rounded-xl border p-3"><span className="text-sm font-semibold">Coupon active</span><Switch checked={form.is_active} onCheckedChange={value=>set('is_active',value)}/></div>
   <footer className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={save}>{busy?'Saving…':'Save coupon'}</Button></footer>
  </div>
 </div>
}
function Scope({title,empty,items,selected,onToggle}:{title:string;empty:string;items:{id:string;label:string}[];selected:string[];onToggle:(id:string)=>void}){return <section className="rounded-xl border p-3"><p className="mb-2 text-xs font-bold">{title}</p><div className="max-h-36 space-y-2 overflow-y-auto">{items.length?items.map(item=><label key={item.id} className="flex gap-2 text-xs"><input type="checkbox" checked={selected.includes(item.id)} onChange={()=>onToggle(item.id)}/><span>{item.label}</span></label>):<p className="text-xs text-ink-muted">{empty}</p>}</div></section>}

export default function CouponsPage(){
 const [data,setData]=useState<any>({coupons:[],products:[]}),[loading,setLoading]=useState(true),[editing,setEditing]=useState<any|null>(null)
 useEffect(()=>{fetch('/api/settings/coupons').then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error);setData(body)}).catch(error=>toast.error(error.message)).finally(()=>setLoading(false))},[])
 const saved=(coupon:any)=>setData((old:any)=>({...old,coupons:[coupon,...old.coupons.filter((item:any)=>item.id!==coupon.id)]}))
 async function remove(id:string){if(!confirm('Delete this coupon?'))return;const response=await fetch(`/api/settings/coupons?id=${id}`,{method:'DELETE'}),body=await response.json();if(!response.ok)return toast.error(body.error);setData((old:any)=>({...old,coupons:old.coupons.filter((coupon:any)=>coupon.id!==id)}));toast.success('Coupon deleted')}
 return <div className="pb-12">
  <PageHeader title="Coupons & upsell offers" description="Create checkout coupons, scope them to products or categories, then assign them per bot."><Button onClick={()=>setEditing({})}><Plus className="mr-2 h-4 w-4"/>Create coupon</Button></PageHeader>
  {editing&&(
   <Editor value={editing} products={data.products} services={data.services||[]} offers={data.offers||[]} onClose={()=>setEditing(null)} onSaved={saved}/>
  )}
  <div className="mb-5 flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900"><AlertCircle className="h-4 w-4 shrink-0"/><p>Assign coupons in <strong>Bot edit → Booking & Commerce</strong>. The bot can show how much more unlocks an offer, then apply it automatically or let the shopper choose.</p></div>
  <div className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h3 className="text-sm font-bold">Coupon library</h3><p className="text-xs text-ink-muted">{data.coupons.length} configured</p></div>
   {loading
    ? <div className="space-y-2 p-5">{[1,2,3].map(item=><div key={item} className="h-12 animate-pulse rounded-xl bg-slate-100"/>)}</div>
    : !data.coupons.length
     ? <div className="p-10 text-center text-sm text-ink-muted">Create your first coupon to enable cart upsells.</div>
     : <CouponTable coupons={data.coupons} offers={data.offers||[]} edit={setEditing} remove={remove}/>
   }
  </div>
 </div>
}
function CouponTable({coupons,offers,edit,remove}:{coupons:any[];offers:any[];edit:(coupon:any)=>void;remove:(id:string)=>void}){return <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-ink-muted"><tr><th className="px-5 py-3">Coupon</th><th className="px-4 py-3">Discount</th><th className="px-4 py-3">Unlock</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Can combine with</th><th className="px-4 py-3">Usage</th><th className="px-4 py-3">Status</th><th/></tr></thead><tbody className="divide-y">{coupons.map(coupon=><CouponRow key={coupon.id} coupon={coupon} offers={offers} edit={edit} remove={remove}/>)}</tbody></table></div>}
function CouponRow({coupon,offers,edit,remove}:{coupon:any;offers:any[];edit:(coupon:any)=>void;remove:(id:string)=>void}){const expired=coupon.expires_at&&new Date(coupon.expires_at)<new Date(),exhausted=coupon.max_uses!=null&&coupon.used_count>=coupon.max_uses,active=coupon.is_active&&!expired&&!exhausted,scope=coupon.service_ids?.length?`${coupon.service_ids.length} services`:coupon.product_ids?.length?`${coupon.product_ids.length} products`:coupon.categories?.length?coupon.categories.join(', '):'All products',compatible=coupon.stackable?(coupon.compatible_offer_ids||[]).map((id:string)=>offers.find(offer=>offer.id===id)?.name).filter(Boolean):[];return <tr><td className="px-5 py-4"><code className="font-bold">{coupon.code}</code><p className="mt-1 max-w-xs truncate text-ink-muted">{coupon.description||'No description'}</p></td><td className="px-4 font-semibold">{coupon.discount_type==='percentage'?<><Percent className="mr-1 inline h-3 w-3"/>{coupon.discount_value}%</>:<><Tag className="mr-1 inline h-3 w-3"/>INR {Number(coupon.discount_value).toLocaleString()}</>}</td><td className="px-4">INR {Number(coupon.min_cart_value||0).toLocaleString()}</td><td className="max-w-44 px-4">{scope}</td><td className="max-w-44 px-4">{compatible.length?compatible.join(', '):'Not stackable'}</td><td className="px-4">{coupon.used_count||0} / {coupon.max_uses||'∞'}</td><td className="px-4"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${active?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-600'}`}>{active?'Active':expired?'Expired':exhausted?'Exhausted':'Off'}</span></td><td className="px-4"><div className="flex justify-end"><Button variant="ghost" size="sm" onClick={()=>edit(coupon)}><Edit className="h-3.5 w-3.5"/></Button><Button variant="ghost" size="sm" onClick={()=>remove(coupon.id)}><Trash2 className="h-3.5 w-3.5 text-red-500"/></Button></div></td></tr>}
