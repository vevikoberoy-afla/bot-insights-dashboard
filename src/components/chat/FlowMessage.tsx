'use client'

import React, { useEffect, useState } from 'react'
import {
  VerifiedCard,
  ReturnItemCard,
  ChoiceChips,
  PhotoCard,
  ProductCard,
  ProductActions
} from './ConciergeCards'
import {
  AppleAddonPicker,
  AppleCartCard,
  AppleConfirmCard,
  AppleContactForm,
  AppleCommerceOffers,
  AppleLocationForm,
  AppleBookingNote,
  AppleBookingScheduler,
  AppleOfferCard,
  ApplePaymentCard,
  ApplePickerCard,
  AppleProductGrid,
  AppleProductSearch,
  AppleQuantityCard,
  AppleRatingCard,
  AppleReceiptCard,
  AppleSavedAddress,
  AppleStatusCard,
  AppleSummaryCard,
  AppleWaitlistCard,
} from './AppleChatCards'

export type FlowMeta = { id: string; name: string; step: number; totalSteps: number; canGoBack: boolean; revision?: number }
export type FlowInput = { kind: string; value?: any; label?: string; flowId: string; stepId: string; silent?: boolean; expectedRevision: number; actionId: string }
export type StructuredMessage = { 
  id: string
  role: 'assistant'
  content: string
  type: string
  flowId: string
  stepId: string
  interactive: boolean
  payload: any
  created_at: string
  locked?: boolean
  selectedValue?: any
  selectedLabel?: string
  revision?: number
}

function getItemInitials(name?: string): string {
  if (!name) return 'GB'
  const clean = name.trim()
  const words = clean.split(/\s+/)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return clean.slice(0, 2).toUpperCase()
}

const formatMoney = (currency: string, value?: number | null) => {
  if (value == null) return ''
  const sym = currency === 'INR' || !currency ? '₹' : currency === 'USD' ? '$' : currency
  return `${sym}${Number(value).toFixed(2)}`
}

export function FlowProgress({ flow }: { flow: FlowMeta }) {
  const pct = Math.min(100, Math.round((flow.step / flow.totalSteps) * 100))
  return (
    <div className="px-5 py-2.5 border-b border-slate-100 bg-white/90 backdrop-blur-md" aria-label={`Step ${flow.step} of ${flow.totalSteps}`}>
      <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
        <span>{flow.name === 'booking' ? 'Booking request' : flow.name === 'order' ? 'Order' : 'Return request'}</span>
        <span className="mono">Step {flow.step} of {flow.totalSteps}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div 
          className="h-full rounded-full bg-[#007aff] transition-all duration-300 ease-out" 
          style={{ width: `${pct}%` }} 
        />
      </div>
    </div>
  )
}

export function FlowMessage({ 
  message, 
  disabled, 
  apiBase, 
  botId, 
  contextId, 
  sessionId, 
  onInput,
  onCartPreview,
}: { 
  message: StructuredMessage
  disabled: boolean
  apiBase: string
  botId: string
  contextId: string
  sessionId: string
  onInput: (input: FlowInput) => void 
  onCartPreview?: (items:any[]) => void
}) {
  const p = message.payload || {}
  const [photos, setPhotos] = useState<File[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [selectedChoice, setSelectedChoice] = useState<any>(
    message.selectedValue ?? p.selectedValue ?? null
  )

  useEffect(() => {
    if (message.selectedValue != null) {
      setSelectedChoice(message.selectedValue)
    }
  }, [message.selectedValue])

  const send = (kind: string, value: any, label: string, silent = true) => {
    setSelectedChoice(value)
    onInput({ kind, value, label, flowId: message.flowId, stepId: message.stepId, silent, expectedRevision: Number(p.revision ?? message.revision ?? 0), actionId: crypto.randomUUID() })
  }

  if (message.type === 'service_picker' || message.type === 'staff_picker' || message.type === 'branch_picker' || message.type === 'addon_picker') {
    const options=p.services||p.staff||p.branches||p.addons||p.choices||[]
    if(message.type==='addon_picker')return <AppleAddonPicker title={p.title} addons={options} currency={p.currency||'INR'} locked={disabled||!!message.locked} selectedIds={Array.isArray(selectedChoice)?selectedChoice:[]} onSubmit={(ids,items)=>send('addons',ids,items.length?items.map((item:any)=>item.name||item.label).join(', '):'No add-ons')}/>
    return <ApplePickerCard title={p.title||'Choose an option'} subtitle={p.subtitle} kind={message.type==='staff_picker'?'staff':message.type==='branch_picker'?'branch':'service'} items={options} locked={disabled||!!message.locked} selected={selectedChoice} onSelect={(option:any)=>send('choice',option.value||option.id,option.label||option.name)}/>
  }

  if (message.type === 'date_picker' || message.type === 'reschedule_picker') {
    return <AppleBookingScheduler title={p.title||'Choose a date and time'} minDate={p.minDate} maxDate={p.maxDate} blackoutDates={p.disabledDates||[]} selectedDate={p.selectedDate||(typeof selectedChoice==='string'?selectedChoice:undefined)} slots={[]} quantity={Number(p.quantity)||1} maxQuantity={Number(p.maxQuantity)||99} locked={disabled||!!message.locked} onDateSelect={(value,quantity)=>send('preview_date',{date:value,quantity},new Date(`${value}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'}),true)} onProceed={()=>{}}/>
  }

  if (message.type === 'slot_picker') {
    const slots=p.slots||p.choices||[]
    const slotVal = typeof selectedChoice==='string'?selectedChoice:((selectedChoice as any)?.slot || (selectedChoice as any)?.value || message.selectedLabel)
    return <AppleBookingScheduler title={p.title||'Choose a date and time'} minDate={p.minDate} maxDate={p.maxDate} blackoutDates={p.disabledDates||[]} selectedDate={p.selectedDate} slots={slots} slotsByDate={p.slotsByDate||{}} quantity={Number((selectedChoice as any)?.quantity)||Number(p.quantity)||1} maxQuantity={Number(p.maxQuantity)||99} discountLabel={p.discountLabel} locked={disabled||!!message.locked} selectedSlot={slotVal} onDateSelect={(value,quantity)=>send('preview_date',{date:value,quantity},new Date(`${value}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'}),true)} onProceed={(slot:any,quantity,date)=>send('slot',{slot:slot.value||slot.id,date,quantity},slot.label||slot.time)}/>
  }

  if (message.type === 'quantity_stepper') {
    const initialQty = typeof message.selectedValue === 'number' ? message.selectedValue : Number(p.min) || 1
    return <AppleQuantityCard title={p.title} product={{name:p.label||p.name||'Guests',price:p.price,currency:p.currency}} min={Number(p.min)||1} max={Number(p.max)||1} locked={disabled||!!message.locked} selectionLabel={message.locked?message.selectedLabel:undefined} initialQuantity={initialQty} actionLabel={p.actionLabel||'Continue'} onSubmit={quantity=>send('quantity',quantity,String(quantity))}/>
  }

  if (message.type === 'contact_form' || message.type === 'checkout_form') {
    return <AppleContactForm title={p.title||'Your details'} initial={message.selectedValue||p.initial||{}} includeAddress={message.type==='checkout_form'||p.includeAddress} requireEmail={p.requireEmail!==false} requirePhone={p.requirePhone===true} requireAddress={p.requireAddress===true} requirePincode={p.requirePincode===true} locked={disabled||!!message.locked} onSubmit={value=>send('contact',value,value.name||'Details added')}/>
  }

  if(message.type==='saved_address')return <AppleSavedAddress address={p.address||{}} locked={disabled||!!message.locked} onUse={()=>send('saved_address','saved','Deliver here')} onNew={()=>send('saved_address','new','Add new address')}/>

  if (message.type === 'location_form') {
    return <AppleLocationForm title={p.title} placeholder={p.placeholder} locked={disabled||!!message.locked} onSubmit={location=>send('location',location,location)}/>
  }

  if (message.type === 'booking_note') {
    return <AppleBookingNote locked={disabled||!!message.locked} onSubmit={note=>send('note',note,'Note added')} onSkip={()=>send('choice','skip','No thanks')}/>
  }

  if (message.type === 'custom_question_form') {
    return <CustomQuestionForm title={p.title||'A few details'} questions={p.questions||[]} disabled={disabled||!!message.locked} onSubmit={value=>send('answers',value,'Details added')}/>
  }

  if (message.type === 'cancellation_confirm') {
    return <AppleConfirmCard title={p.title||'Cancel this booking?'} text={p.text} choices={p.choices||[]} locked={disabled||!!message.locked} onChoice={(choice:any)=>send('choice',choice.value,choice.label)}/>
  }

  if (message.type === 'booking_summary' || message.type === 'order_summary') {
    const rows=p.rows||[]
    return <AppleSummaryCard title={p.title||'Review your request'} rows={rows} confirmLabel={p.confirmLabel||'Confirm'} locked={disabled||!!message.locked} decision={selectedChoice} onConfirm={()=>send('confirm','confirm',p.confirmLabel||'Confirm')} onEdit={()=>send('edit','edit','Edit')} onCancel={()=>send('cancel','cancel','Cancel')}/>
  }

  if(message.type==='payment_method')return <ApplePaymentCard methods={p.methods||[]} amount={Number(p.amount)||0} currency={p.currency} locked={disabled||!!message.locked} onSelect={(value,label)=>send('payment',value,label)}/>
  if(message.type==='payment_checkout')return <ApplePaymentCard amount={Number(p.amount)||0} currency={p.currency} upiUri={p.upiUri} qrUrl={p.qrUrl} upiId={p.upiId} payeeName={p.payeeName} accountLabel={p.accountLabel} token={p.token} reference={p.reference} gatewayOrderId={p.gatewayOrderId} gatewayKeyId={p.gatewayKeyId} customer={p.customer} locked={disabled||!!message.locked}/>

  if (message.type === 'cart_card') {
    return <AppleCartCard title={p.title||'Your cart'} items={p.items||[]} total={Number(p.total)||0} discount={Number(p.discount)||0} discountLabel={p.discountLabel} currency={p.currency} coupons={p.coupons||[]} appliedCoupon={p.appliedCoupon} upsell={p.upsell} locked={disabled||!!message.locked} onQuantitiesChange={disabled||message.locked?undefined:onCartPreview} onCheckout={items=>send('cart_checkout',items,`Proceed with ${items.reduce((sum,item)=>sum+item.quantity,0)} items`)} onSearch={query=>send('search',query,query)} onCoupon={id=>send('coupon',id,(p.coupons||[]).find((coupon:any)=>coupon.id===id)?.code||'Coupon applied')} onCancel={()=>send('cancel','cancel','Cancel order')}/>
  }

  if (message.type === 'booking_confirmation' || message.type === 'order_confirmation' || message.type === 'claim_confirmation' || message.type === 'waitlist_card') {
    const isWait=message.type==='waitlist_card'
    const downloadReceipt=()=>{const escape=(value:any)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char)),isOrder=message.type==='order_confirmation',reference=String(p.reference||(isOrder?'order-receipt':'booking-receipt')).replace(/[^a-z0-9_-]/gi,''),rows=(p.rows||[]).map((row:any)=>Array.isArray(row)?row:[row.label,row.value]),html=`<!doctype html><meta charset="utf-8"><title>${escape(reference)} receipt</title><style>body{font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:560px;margin:48px auto;color:#1c1c1e}main{border:1px solid #ddd;border-radius:20px;padding:28px}h1{font-size:22px}small{color:#6e6e73}.row{display:flex;justify-content:space-between;gap:24px;padding:10px 0;border-bottom:1px solid #eee}.note{margin-top:18px;padding:14px;background:#f5f5f7;border-radius:12px}</style><main><small>${isOrder?'ORDER':'BOOKING'} RECEIPT</small><h1>${escape(p.title||(isOrder?'Order confirmed':'Booking confirmed'))}</h1><p><strong>${escape(p.reference)}</strong> · ${escape(p.status)}</p>${rows.map((row:any)=>`<div class="row"><span>${escape(row[0])}</span><strong>${escape(row[1])}</strong></div>`).join('')}${p.text?`<div class="note">${escape(p.text).replace(/\n/g,'<br>')}</div>`:''}</main>`,url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download=`${reference}-receipt.html`;anchor.click();URL.revokeObjectURL(url)}
    if(isWait&&message.interactive)return <AppleWaitlistCard title={p.title} message={p.text} locked={disabled||!!message.locked} onJoin={()=>send('choice','join','Join waitlist')} onDecline={()=>send('choice','decline','No thanks')}/>
    const receiptRows=p.rows||(p.items||[]).map((item:any)=>({label:`${item.name} × ${item.quantity}`,value:formatMoney(item.currency||p.currency,Number(item.price)*Number(item.quantity))}))
    return <AppleReceiptCard heading={p.title||'Confirmed'} reference={p.reference} status={p.status} rows={receiptRows} note={p.text} actions={[...(['booking_confirmation','order_confirmation'].includes(message.type)?[{key:'receipt',label:'Download receipt',variant:'primary'}]:[]),...(p.choices||[]).map((choice:any)=>({key:choice.value,label:choice.label}))]} onAction={(key:string)=>key==='receipt'?downloadReceipt():send('choice',key,(p.choices||[]).find((choice:any)=>choice.value===key)?.label||key)}/>
  }

  if (message.type === 'offer_card') {
    return <AppleOfferCard name={p.name||p.title||'Special offer'} description={p.description||p.text} price={p.price} currency={p.currency} claimed={Number(p.claimed)||0} quantity={Number(p.quantity)||0} endsInLabel={p.endsInLabel} claimLabel={p.claimLabel} skipLabel={p.skipLabel} locked={disabled||!!message.locked} onClaim={()=>send('choice',p.value||'claim',p.claimLabel||'Claim this offer')} onSkip={p.skipValue?()=>send('choice',p.skipValue,p.skipLabel||'Continue without offer'):undefined}/>
  }

  if (message.type === 'product_catalog' || message.type === 'product_grid') {
    const selectedItems = Array.isArray(selectedChoice) ? selectedChoice : p.selected || []
    const initialQtys = {
      ...(p.initialQuantities || {}),
      ...(Array.isArray(selectedItems) ? Object.fromEntries(selectedItems.map((item: any) => [String(item.productId || item.id).replace(/^product:/, ''), Number(item.quantity || item.qty || 1)])) : {})
    }
    return <AppleProductGrid title={p.title} products={p.products||[]} selected={selectedItems} initialQuantities={initialQtys} locked={disabled||!!message.locked} onQuantitiesChange={p.factCard||disabled||message.locked?undefined:onCartPreview} onBrowse={p.factCard?undefined:(query,items)=>send('search',{query,selections:items},query)} onProceed={items=>p.factCard?onInput({kind:'text',value:`I want to order ${(p.products||[]).find((product:any)=>String(product.value||product.id).replace(/^product:/,'')===items[0]?.productId)?.sku||(p.products||[]).find((product:any)=>String(product.value||product.id).replace(/^product:/,'')===items[0]?.productId)?.name}`,label:'Add selected product',flowId:'',stepId:'',silent:true,expectedRevision:0,actionId:crypto.randomUUID()}):send('products',items,`${items.reduce((sum,item)=>sum+item.quantity,0)} item${items.reduce((sum,item)=>sum+item.quantity,0)===1?'':'s'} selected`)}/>
  }

  if (message.type === 'product_search') {
    return <AppleProductSearch locked={disabled||!!message.locked} onSubmit={query=>send('search',query,query)}/>
  }

  if (message.type === 'commerce_offer_picker') {
    return <AppleCommerceOffers offers={p.offers||[]} currency={p.currency} locked={disabled||!!message.locked} onApply={offer=>send('choice',offer.value||offer.id,offer.name||offer.label)} onSkip={()=>send('choice','skip','Continue without an offer')}/>
  }

  if (message.type === 'order_quantity' || message.type === 'product_detail') {
    const initialQty = typeof message.selectedValue === 'number' ? message.selectedValue : message.selectedValue?.quantity
    const product=p.product||p
    return <AppleQuantityCard product={product} min={Number(p.min)||1} max={Number(p.max)||1} locked={disabled||!!message.locked||p.actionLabel==='Out of stock'} selectionLabel={message.locked?message.selectedLabel:undefined} initialQuantity={initialQty} variants={p.variants||p.product?.variants||[]} actionLabel={p.actionLabel||'Add to cart'} onSubmit={(quantity,variant)=>p.factCard?onInput({kind:'text',value:`I want to order ${product.sku||product.name}`,label:`Add ${product.name}`,flowId:'',stepId:'',silent:true,expectedRevision:0,actionId:crypto.randomUUID()}):send('quantity',variant?{quantity,variant}:quantity,variant?`${variant.name} × ${quantity}`:String(quantity))}/>
  }

  if (message.type === 'order_receipt') {
    return <AppleReceiptCard heading={p.status==='waiting'?'Waitlist joined':'Order placed'} reference={p.reference} status={p.status} rows={[...(p.items||[]).map((item:any)=>({label:`${item.name} × ${item.quantity}`,value:formatMoney(item.currency||p.currency,Number(item.price)*Number(item.quantity))})),{label:'Total',value:formatMoney(p.currency,p.total),strong:true}]} note={p.receiptNumber?`Receipt ${p.receiptNumber}`:undefined}/>
  }

  if (message.type === 'order_status_card') {
    const status=String(p.fulfillmentStatus||p.status||'processing').replace(/_/g,' ')
    const safeTrackingUrl=typeof p.trackingUrl==='string'&&/^https:\/\//i.test(p.trackingUrl)?p.trackingUrl:null
    const normalizedStatus=String(p.fulfillmentStatus||p.status||'').toLowerCase(),canReturn=/delivered|fulfilled/.test(normalizedStatus),canCancel=p.source==='commerce'&&/placed|processing|pending|confirmed/.test(normalizedStatus)
    const startOrderAction=(text:string,label:string)=>onInput({kind:'text',value:text,label,flowId:'',stepId:'',silent:true,expectedRevision:0,actionId:crypto.randomUUID()})
    const details=[...(p.items||[]).map((item:any)=>({label:`${item.name} × ${item.quantity}`,value:item.unitPrice!=null?formatMoney(p.currency,item.unitPrice*item.quantity):''})),...(p.total!=null?[{label:'Total',value:formatMoney(p.currency,p.total)}]:[]),...(p.placedAt?[{label:'Ordered',value:new Date(p.placedAt).toLocaleDateString()}]:[]),...(p.deliveredAt?[{label:'Delivered',value:new Date(p.deliveredAt).toLocaleDateString()}]:[]),...(p.trackingNumber?[{label:'Tracking',value:p.trackingNumber}]:[]),...(p.carrier?[{label:'Carrier',value:p.carrier}]:[])]
    const actions=[...(safeTrackingUrl?[{key:'track',label:'Track shipment',href:safeTrackingUrl,primary:true}]:[]),...(canReturn?[{key:'return',label:'Return an item'}]:[]),...(canCancel?[{key:'cancel',label:'Cancel order',danger:true}]:[])]
    const stageNames=['Placed','Processing','Shipped','Delivered'],stageIndex=Math.max(0,stageNames.findIndex(stage=>normalizedStatus.includes(stage.toLowerCase())))
    return <AppleStatusCard reference={p.reference} title="Order status" status={status} stages={stageNames} currentStage={stageIndex} details={details} timeline={p.timeline||[]} actions={actions} onAction={(key:string)=>key==='return'?startOrderAction(`I want to return ${p.reference}`,'Return an item'):key==='cancel'?startOrderAction(`Cancel order ${p.reference}`,'Cancel order'):undefined}/>
  }

  if (message.type === 'booking_card') {
    const downloadReceipt=()=>{const ref=String(p.reference||'booking').replace(/[^a-z0-9_-]/gi,''),body=[`Booking receipt: ${p.reference||''}`,`Status: ${p.status||''}`,p.text||''].join('\n'),url=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`${ref}-receipt.txt`;a.click();URL.revokeObjectURL(url)}
    return <AppleReceiptCard heading={p.title||'Booking'} reference={p.reference} status={p.status} rows={p.rows||[]} note={p.text} actions={[...(p.status==='confirmed'?[{key:'receipt',label:'Download receipt',variant:'primary'}]:[]),...(p.choices||[]).map((choice:any)=>({key:choice.value,label:choice.label}))]} onAction={(key:string)=>key==='receipt'?downloadReceipt():send(key,key,(p.choices||[]).find((choice:any)=>choice.value===key)?.label||key)}/>
  }

  if (message.type === 'text') {
    return (
      <div className="assistant-bubble">
        <p>{p.text || message.content}</p>
      </div>
    )
  }

  // 1. Order Verified Card
  if (message.type === 'order_card') {
    const formattedDate = p.deliveredAt 
      ? new Date(p.deliveredAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
      : '3 Oct'
    const daysLeft = p.daysLeft != null ? p.daysLeft : 19

    return (
      <VerifiedCard
        orderNumber={p.orderNumber || 'ORD–005'}
        date={formattedDate}
        daysLeft={daysLeft}
      />
    )
  }

  // 2. Item Picker Card
  if (message.type === 'item_picker') {
    const items = p.items || []
    const firstItem = items[0] || { id: 'default', name: 'Gadget B', unit_price: 50, quantity: 3 }
    const initialQty = message.selectedValue?.qty || 2
    return (
      <ItemPickerFlow
        item={firstItem}
        currency={p.currency || 'INR'}
        initialQuantity={initialQty}
        locked={!!message.locked}
        disabled={disabled}
        prompt={p.title}
        onReturn={(qty) => send('item', { orderItemId: firstItem.id, qty }, `${firstItem.name} × ${qty}`)}
      />
    )
  }

  // 3. Quick Replies Choice Chips
  if (message.type === 'quick_replies') {
    const choices = p.choices || p.options || [
      'Damaged',
      'Wrong item',
      'Missing parts',
      'Defective',
      'Changed my mind'
    ]
    const optionStrings = choices.map((c: any) => typeof c === 'string' ? c : c.label || c.value)
    const selected = message.selectedLabel || (typeof message.selectedValue === 'string' ? message.selectedValue : undefined)

    return (
      <div className="space-y-2">
        {p.title && (
          <div className="assistant-bubble">
            <p>{p.title}</p>
          </div>
        )}
        <ChoiceChips
          options={optionStrings}
          selected={selected}
          locked={!!message.locked}
          disabled={disabled}
          onSelect={(opt) => {
            const rawChoice = choices.find((c: any) => (typeof c === 'string' ? c : (c.label || c.value)) === opt)
            const val = typeof rawChoice === 'string' ? rawChoice : (rawChoice?.value || opt)
            send('choice', val, opt)
          }}
        />
      </div>
    )
  }

  // 4. Photo Request Card
  if (message.type === 'photo_request') {
    return (
      <div className="space-y-2">
        <div className="assistant-bubble">
          <p>{p.title || 'Sorry about that. Add at least one photo of the damaged product.'}</p>
        </div>
        <PhotoCard
          disabled={disabled || !!message.locked || uploadingPhotos}
          onPhotosChange={setPhotos}
          onContinue={async () => {
            if(!photos.length)return
            setUploadingPhotos(true);setPhotoError('')
            try{
              const uploaded:Array<{url:string;path:string;sizeBytes?:number}>=[]
              for(const file of photos){
                const form=new FormData();form.append('file',file,file.name);form.append('session_id',sessionId);form.append('bot_id',botId);form.append('context_id',contextId);form.append('flow_id',message.flowId);form.append('step_id',message.stepId)
                const params=new URLSearchParams();if(contextId)params.set('ctx',contextId);if(botId)params.set('bot',botId)
                const response=await fetch(`${apiBase}/api/chat/media?${params.toString()}`,{method:'POST',body:form})
                const data=await response.json().catch(()=>({}))
                if(!response.ok)throw new Error(data.error||'Photo upload failed')
                uploaded.push({url:data.url,path:data.storagePath,sizeBytes:data.sizeBytes})
              }
              send('photos',{photos:uploaded,skipped:false},`${uploaded.length} photo${uploaded.length===1?'':'s'} added`)
            }catch(error:any){setPhotoError(error?.message||'Photo upload failed. Please try again.')}finally{setUploadingPhotos(false)}
          }}
        />
        {uploadingPhotos&&<p className="px-1 text-xs text-slate-500">Compressing and securely uploading…</p>}
        {photoError&&<p role="alert" className="px-1 text-xs text-rose-600">{photoError}</p>}
      </div>
    )
  }

  // 5. Review Card
  if (message.type === 'summary_card') {
    const rows = p.rows || []
    return <AppleSummaryCard title={p.title||'Review your request'} rows={rows} locked={disabled||!!message.locked} decision={selectedChoice} onConfirm={()=>send('confirm','confirm','Confirm')} onEdit={()=>send('edit','edit','Edit')} onCancel={()=>send('cancel','cancel','Cancel')}/>
  }

  // 6. Ticket Card
  if (message.type === 'ticket_card') {
    const ticketStatus=String(p.subStatus||p.status||'In review'),stage=/resolved|refunded/i.test(ticketStatus)?3:/pickup/i.test(ticketStatus)?2:/review|progress/i.test(ticketStatus)?1:0
    return <AppleStatusCard reference={p.ticketNumber||'Ticket'} title={`${String(p.type||'Return').replace(/^./,(value:string)=>value.toUpperCase())} · ${p.orderNumber||''}`} status={ticketStatus} stages={['Created','Review','Pickup','Refund']} currentStage={stage} details={p.nextStep?[{label:'Next step',value:p.nextStep}]:[]}/>
  }

  // 7. CSAT Card
  if (message.type === 'csat') {
    return (
      <AppleRatingCard locked={disabled||!!message.locked} onSubmit={async (val) => {
          try {
            await fetch(`${apiBase}/api/csat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticketId: p.ticketId, sessionId, score: val, channel: 'widget' })
            })
          } catch {}
        }}/>
    )
  }

  return (
    <div className="assistant-bubble">
      <p>{message.content}</p>
    </div>
  )
}

function CustomQuestionForm({title,questions,disabled,onSubmit}:{title:string;questions:any[];disabled:boolean;onSubmit:(value:any)=>void}){
 const [answers,setAnswers]=useState<Record<string,any>>({})
 const valid=questions.every(question=>!question.required||String(answers[question.id]??'').trim())
 return <section className="rounded-[22px] border border-slate-200 bg-white/95 p-4 shadow-sm"><h3 className="font-semibold text-slate-900">{title}</h3><div className="mt-3 grid gap-3">{questions.map(question=><label key={question.id} className="text-xs font-medium text-slate-500">{question.label}{question.required?' *':''}{question.type==='select'?<select disabled={disabled} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900" value={answers[question.id]||''} onChange={event=>setAnswers({...answers,[question.id]:event.target.value})}><option value="">Choose…</option>{(question.options||[]).map((option:string)=><option key={option}>{option}</option>)}</select>:question.type==='checkbox'?<input disabled={disabled} className="ml-2" type="checkbox" checked={!!answers[question.id]} onChange={event=>setAnswers({...answers,[question.id]:event.target.checked})}/>:<input disabled={disabled} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900" value={answers[question.id]||''} onChange={event=>setAnswers({...answers,[question.id]:event.target.value})}/>}</label>)}</div><button disabled={disabled||!valid} onClick={()=>onSubmit(answers)} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500">Continue</button></section>
}

function ItemPickerFlow({
  item,
  currency,
  initialQuantity,
  locked,
  disabled,
  prompt,
  onReturn,
}: {
  item: any
  currency: string
  initialQuantity: number
  locked: boolean
  disabled: boolean
  prompt?: string
  onReturn: (qty: number) => void
}) {
  const [quantity, setQuantity] = useState(initialQuantity || 2)
  const priceStr = formatMoney(currency, item.unit_price ?? 50)
  const orderedCount = item.quantity ?? 3

  return (
    <div className="space-y-2">
      {prompt && (
        <div className="assistant-bubble">
          <p>{prompt}</p>
        </div>
      )}
      <ReturnItemCard
        name={item.name}
        initials={getItemInitials(item.name)}
        price={priceStr}
        ordered={orderedCount}
        imageUrl={item.image_url}
        quantity={quantity}
        onQuantity={setQuantity}
        onReturn={() => onReturn(quantity)}
        locked={locked}
        disabled={disabled}
      />
    </div>
  )
}
