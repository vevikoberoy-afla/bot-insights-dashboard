import { createHash,randomUUID } from 'crypto'
import { redis } from '@/lib/redis'
import { supabase } from '@/lib/supabase'
import { checked } from '@/lib/booking'
import { changeOrder,holdInventory,holdInventoryBatch,joinCommerceWaitlist,placeOrder,releaseInventoryHolds } from '@/lib/commerce'
import { getBotCommerceBundle, type BotCommerceBundle } from '@/lib/chat/commerceBundleCache'
import { isCatalogueRequest,isOrderManagementRequest,isPotentialCommerceRequest,isProductInformationRequest,isPurchaseRequest } from '@/lib/commerceIntent'
import { isExplicitBookingRequest } from '@/lib/bookingIntent'
import { BOOKING_ORDER_FLOW_RETENTION_MS, BOOKING_ORDER_FLOW_RETENTION_SECONDS } from '@/lib/retention'
import type { FlowInteraction,FlowMessage,FlowMeta } from '@/lib/interactiveReturnFlow'
import { upsertCustomerContact } from '@/lib/customerContacts'
import { extractConversationEntities } from '@/lib/conversationEntities'
import { FRIENDLY_RETRY_MESSAGE } from '@/lib/customerErrorMessage'
import { discoverOfferings,recommendationScope } from '@/lib/offeringDiscovery'
import type { ChatRequestContext } from '@/lib/chat/requestContext'
import { searchBotCatalog } from '@/lib/chat/catalogRepository'
import { featureAllowed } from '@/lib/saas/entitlements'
import {initializeOrderPayment,paymentOptions} from '@/lib/paymentSecurity'

type Line={productId:string;name:string;sku:string;quantity:number;price:number;originalPrice?:number;currency:string;offerId?:string;waitlist?:boolean;variantId?:string;variantName?:string}
type DeferredBillDiscount={bookingId:string;bookingReference:string;type:'percentage'|'fixed';value:number;label:string;code?:string;currency?:string;customerEmail?:string|null;customerPhone?:string|null}
type SavedAddress={address:string;pincode:string;country:string;city?:string;state?:string}
type State={id:string;stepId:string;step:string;cart:Line[];selected?:any;focusProductId?:string;matchIds?:string[];draftSelections?:Array<{productId:string;quantity:number}>;catalogSnapshotById?:Record<string,any>;recommendationBrief?:string;recommendationReasons?:Record<string,string>;recommendationBriefShown?:boolean;editingCart?:boolean;offersReviewed?:boolean;appliedOfferId?:string;couponId?:string;couponCode?:string;couponDiscount?:number;bookingDiscount?:DeferredBillDiscount;paymentMethod?:'cash_on_delivery'|'direct_upi'|'gateway';name?:string;email?:string;phone?:string;address?:string;pincode?:string;country?:string;city?:string;region?:string;savedAddress?:SavedAddress;addressLookupDone?:boolean;useNewAddress?:boolean;reference?:string;orderId?:string;choices?:Array<{value:string;label:string}>;history:Array<any>}
const commerceWords=new Set(['i','me','my','a','an','the','want','need','would','like','to','buy','order','get','some','something','please','show','find','product','products','item','items','do','does','did','you','your','have','has','it','this','that','there','any','can','could','for','looking','is','are','how','much','price','cost','available','availability','stock'])
const searchText=(value:unknown)=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const stem=(value:string)=>value.endsWith('s')&&value.length>3?value.slice(0,-1):value
const productMatches=(query:string,products:any[])=>{const normalized=searchText(query),terms=normalized.split(' ').filter(word=>word.length>1&&!commerceWords.has(word)).map(stem);if(!terms.length)return[];return products.map(product=>{const name=searchText(product.name),sku=searchText(product.sku),category=searchText(product.category),haystack=`${name} ${sku} ${category}`,words=haystack.split(' ').filter(Boolean).map(stem),matched=terms.filter(term=>words.some(word=>word===term||word.includes(term)||term.includes(word))).length,exact=name===normalized||sku===normalized;return {product,score:exact?100:matched/terms.length+(terms.every(term=>name.includes(term)||sku.includes(term))?2:0)+(terms.every(term=>category.includes(term))?1:0)}}).filter(item=>item.score>=.6).sort((a,b)=>b.score-a.score||String(a.product.name).localeCompare(String(b.product.name))).map(item=>item.product)}
const calculateCouponDiscount=(coupon:any,subtotal:number)=>{if(!coupon||subtotal<Number(coupon.min_cart_value||0))return 0;const raw=coupon.discount_type==='percentage'?subtotal*Math.min(100,Math.max(0,Number(coupon.discount_value)))/100:Math.max(0,Number(coupon.discount_value));return Math.min(subtotal,Math.round(raw*100)/100)}
const couponAvailable=(coupon:any)=>coupon?.is_active!==false&&(!coupon.expires_at||new Date(coupon.expires_at).getTime()>Date.now())&&(coupon.max_uses==null||Number(coupon.used_count||0)<Number(coupon.max_uses))
const couponMatchesCart=(coupon:any,cart:Line[],products:any[])=>{const productIds=Array.isArray(coupon.product_ids)?coupon.product_ids:[],categories=(Array.isArray(coupon.categories)?coupon.categories:[]).map((value:any)=>String(value).toLowerCase());if(!productIds.length&&!categories.length)return true;return cart.every(line=>productIds.includes(line.productId)||categories.includes(String(products.find(product=>product.id===line.productId)?.category||'').toLowerCase()))}
const couponLabel=(coupon:any,currency:string)=>coupon.discount_type==='percentage'?`${Number(coupon.discount_value)}% off`:`${currency} ${Number(coupon.discount_value).toLocaleString()} off`
const couponStacksWithOffer=(coupon:any,offer:any)=>!!coupon&&!!offer&&coupon.stackable===true&&Array.isArray(coupon.compatible_offer_ids)&&coupon.compatible_offer_ids.includes(offer.id)
const calculateBookingDiscount=(discount:DeferredBillDiscount|undefined,subtotal:number)=>{if(!discount)return 0;const raw=discount.type==='percentage'?subtotal*Math.min(100,Math.max(0,Number(discount.value)))/100:Math.max(0,Number(discount.value));return Math.min(subtotal,Math.round(raw*100)/100)}
const digits=(value:unknown)=>String(value||'').replace(/\D/g,'').slice(-10)
const bookingDiscountMatches=(discount:DeferredBillDiscount|undefined,email?:string,phone?:string)=>!!discount&&((!!discount.customerEmail&&!!email&&discount.customerEmail.toLowerCase()===email.toLowerCase())||(!!digits(discount.customerPhone)&&digits(discount.customerPhone)===digits(phone)))
const discountIdentity=(value:unknown)=>createHash('sha256').update(String(value||'').trim().toLowerCase().replace(/\s+/g,'')).digest('hex')
const discountPhoneIdentity=(value:unknown)=>discountIdentity(digits(value))
const productSnapshot=(product:any)=>({id:product.id,name:product.name,sku:product.sku,category:product.category,description:product.description,image_url:product.image_url,price:Number(product.price),currency:product.currency,available_quantity:Number(product.available_quantity),track_inventory:product.track_inventory!==false,allow_backorder:product.allow_backorder===true,attributes:{variants:Array.isArray(product.attributes?.variants)?product.attributes.variants.slice(0,100):[]}})
export async function handleCommerceFlow(input:{clientId:string;botId:string;sessionId:string;text:string;interaction?:FlowInteraction;channel?:string;knownContact?:{name?:string|null;email?:string|null;phone?:string|null};requestContext?:ChatRequestContext;prefetchedState?:State|null;prefetchedBundle?:BotCommerceBundle}){
 const key=`commerce_flow:${input.clientId}:${input.botId}:${input.sessionId}`,holdKey=`order:${input.clientId}:${input.sessionId}`,bookingDiscountKey=`booking_bill_discount:${input.clientId}:${input.botId}:${input.sessionId}`
 const [storedState,pendingBookingDiscount,bundle]=await Promise.all([
  input.prefetchedState===undefined?redis.get<State>(key):Promise.resolve(input.prefetchedState),
  redis.get<DeferredBillDiscount>(bookingDiscountKey),
  input.prefetchedBundle||getBotCommerceBundle({clientId:input.clientId,botId:input.botId,loadConfig:input.requestContext?()=>input.requestContext!.getBotCommerceConfig():undefined}),
 ])
 let state=storedState
 const currentEntitlements=input.requestContext?await input.requestContext.getEntitlements():null
 const config=currentEntitlements?{...bundle.config,ordering_enabled:bundle.config.ordering_enabled&&featureAllowed(currentEntitlements,'commerce.enabled'),show_catalog:bundle.config.show_catalog&&featureAllowed(currentEntitlements,'commerce.enabled')}:bundle.config
 // A plain customer message with an unambiguous booking intent starts a new
 // task even when an unfinished cart exists. Card interactions remain locked
 // to their originating flow, so a button label can never trigger this switch.
 if(state&&!input.interaction?.flowId&&isExplicitBookingRequest(input.text)){
  await releaseInventoryHolds(input.clientId,holdKey).catch(()=>null)
  await redis.del(key)
  await supabase.from('booking_flow_sessions').update({status:'cancelled',recover_at:null,updated_at:new Date().toISOString()}).eq('client_id',input.clientId).eq('bot_id',input.botId).eq('session_key',input.sessionId).eq('flow_type','order')
  return null
 }
 if(!state&&input.interaction?.flowId&&!input.interaction.flowId.startsWith('order-'))return null
 if(!state&&!input.interaction?.flowId&&!isPotentialCommerceRequest(input.text))return null
 if(!state&&(await redis.exists(`return_flow:${input.botId}:${input.sessionId}`)||await redis.exists(`booking_flow:${input.clientId}:${input.botId}:${input.sessionId}`)))return null
 // Compatibility for sessions/tests created before bot-scoped coupons existed.
 config.couponIds=config.couponIds||new Set<string>();config.autoApplyCouponIds=config.autoApplyCouponIds||new Set<string>();config.upsell_enabled=config.upsell_enabled!==false;config.upsell_max_gap=Number(config.upsell_max_gap??1000)
 const managementIntent=isOrderManagementRequest(input.text)
 const catalogueIntent=isCatalogueRequest(input.text)
 // Generic phrases such as "I want" can introduce either commerce or an
 // appointment. Reservation language must be left to the booking router even
 // when no configured service name was included in the sentence.
 const bookingLanguage=/\b(?:book(?:ing)?|appointment|schedule|reserve|reservation|table|seat|slot)\b/i.test(input.text)
 const purchaseIntent=isPurchaseRequest(input.text)&&!bookingLanguage&&!/\b(?:return|refund|exchange|replace|track|order\s+status)\b/i.test(input.text)
 if(!state&&!input.interaction?.flowId&&((managementIntent&&!config.allow_order_management)||(!managementIntent&&!config.ordering_enabled)||(catalogueIntent&&!config.show_catalog)))return null
 const discoveryScope=!state&&!managementIntent?recommendationScope(input.text):null
 const retainedProductIds=state?Array.from(new Set([...state.cart.map(line=>line.productId),...(state.matchIds||[]),...(state.draftSelections||[]).map(line=>line.productId),...(state.focusProductId?[state.focusProductId]:[])])):[]
 const queryTerms=searchText(input.text).split(' ').filter(word=>word.length>1&&!commerceWords.has(word)).map(stem)
 const catalogueQuery=discoveryScope||catalogueIntent||state&&state.step!=='ask_product'&&state.step!=='cart'&&state.step!=='choose'?'':queryTerms.join(' ')
 const pureCardAction=!!state&&!!input.interaction?.flowId&&(
  (state.step==='choose'&&input.interaction.kind==='products')||
  (state.step==='cart'&&input.interaction.kind!=='search')||
  ['quantity','offers','name','phone','address','pincode','email','review','manage','cancel_review'].includes(state.step)
 )
 const snapshotProducts=Object.values(state?.catalogSnapshotById||{})
 const [allProducts,discovery]=await Promise.all([
  pureCardAction&&snapshotProducts.length?Promise.resolve(snapshotProducts):searchBotCatalog({clientId:input.clientId,botId:input.botId,query:catalogueQuery,productIds:retainedProductIds,limit:20}),
  discoveryScope&&discoveryScope!=='service'?discoverOfferings({clientId:input.clientId,botId:input.botId,query:input.text,scope:'product'}):Promise.resolve(null),
 ])
 const rawOffers=bundle.offers
 const coupons=bundle.coupons.filter((coupon:any)=>couponAvailable(coupon)&&(!config.configured||config.couponIds.has(coupon.id)))
 let products=config.configured?allProducts.filter((p:any)=>config.productIds.has(p.id)):allProducts
 const configuredOffers=config.configured?rawOffers.filter((o:any)=>config.offerIds.has(o.id)):rawOffers
 const offers=configuredOffers.filter((o:any)=>{const r=o.segment_rule||{},channelOk=!r.channels?.length||r.channels.includes(input.channel||'web'),domain=String(input.knownContact?.email||'').split('@')[1];return products.some((p:any)=>p.id===o.product_id)&&channelOk&&(!r.email_domains?.length||r.email_domains.includes(domain))})
 const exactMatches=!state&&!managementIntent?productMatches(input.text,products):[]
 const missingDiscoveryIds=(discovery?.items||[]).map(item=>item.id).filter(id=>!products.some((product:any)=>product.id===id))
 if(missingDiscoveryIds.length){const hydrated=await searchBotCatalog({clientId:input.clientId,botId:input.botId,query:'__selected_records_only__',productIds:missingDiscoveryIds,limit:1});products=[...products,...hydrated.filter((row:any)=>!config.configured||config.productIds.has(row.id))]}
 const discoveredProducts=(discovery?.items||[]).map(item=>products.find((product:any)=>product.id===item.id)).filter(Boolean)
 const initialMatches=discoveredProducts.length?discoveredProducts:(!catalogueIntent?exactMatches:[])
 const mentionedProduct=initialMatches.length===1?initialMatches[0]:undefined
 if(!state&&!managementIntent&&!catalogueIntent&&!initialMatches.length&&!purchaseIntent&&!discovery)return null
 if(!state&&!managementIntent&&!products.length)return null
 const fresh=!state
 const entities=fresh?extractConversationEntities(input.text):{}
 const initialReference=managementIntent?input.text.match(/ORD-[A-Z0-9_-]+/i)?.[0]?.toUpperCase():undefined
 const initialProductStep=initialMatches.length?'choose':catalogueIntent?'choose':purchaseIntent?'ask_product':'choose'
 state=state||{id:'order-'+randomUUID(),stepId:randomUUID(),step:managementIntent?(initialReference?'verify':'reference'):initialProductStep,reference:initialReference,cart:[],matchIds:initialMatches.length&&initialProductStep==='choose'?initialMatches.map((product:any)=>product.id):undefined,recommendationBrief:discovery?.brief,recommendationReasons:Object.fromEntries((discovery?.items||[]).map(item=>[item.id,item.reason||'Recommended for you'])),focusProductId:mentionedProduct&&!purchaseIntent?mentionedProduct.id:undefined,bookingDiscount:pendingBookingDiscount||undefined,name:entities.name||input.knownContact?.name||undefined,email:entities.email||input.knownContact?.email||undefined,phone:entities.phone||input.knownContact?.phone||undefined,history:[]}
 if(fresh&&state.step==='quantity'&&state.selected&&entities.quantity){const variants=Array.isArray(state.selected.attributes?.variants)?state.selected.attributes.variants:[],normalized=input.text.toLowerCase(),variant=variants.filter((item:any)=>item.name&&normalized.includes(String(item.name).toLowerCase())).length===1?variants.find((item:any)=>item.name&&normalized.includes(String(item.name).toLowerCase())):undefined,stockMax=state.selected.track_inventory&&!state.selected.allow_backorder?Number(state.selected.available_quantity):1000,variantMax=variant&&Number.isFinite(Number(variant.stock))?Number(variant.stock):1000,max=Math.min(1000,stockMax,variantMax);if(Number.isInteger(entities.quantity)&&entities.quantity>=1&&entities.quantity<=max){await holdInventory(input.clientId,{product_id:state.selected.id,hold_key:holdKey,quantity:entities.quantity});state.cart=[{productId:state.selected.id,name:state.selected.name,sku:variant?.sku||state.selected.sku,quantity:entities.quantity,price:Number(variant?.price??state.selected.price),currency:state.selected.currency,variantId:variant?.id,variantName:variant?.name}];state.step='cart';state.stepId=randomUUID()}}
 const message=async(text:string,choices?:Array<{value:string;label:string}>,done=false,type:any=choices?'quick_replies':'text',payload:any={})=>{
  state!.choices=choices;const m:FlowMessage={id:randomUUID(),role:'bot',type,flowId:state!.id,stepId:state!.stepId,interactive:!done,payload:{text,title:text,choices,...payload}}
  supabase.from('booking_flow_sessions').upsert({client_id:input.clientId,bot_id:input.botId,session_key:input.sessionId,flow_type:'order',step:state!.step,contact:{name:state!.name||input.knownContact?.name,email:state!.email||input.knownContact?.email,phone:state!.phone||input.knownContact?.phone},context:{cart:state!.cart.map(x=>({product_id:x.productId,quantity:x.quantity}))},status:done?'completed':'active',recover_at:done?null:new Date(Date.now()+BOOKING_ORDER_FLOW_RETENTION_MS).toISOString(),updated_at:new Date().toISOString()},{onConflict:'client_id,session_key,flow_type'}).then(()=>{})
  const stateCommit=done?redis.del(key):redis.set(key,state!,{ex:BOOKING_ORDER_FLOW_RETENTION_SECONDS})
  const steps=['ask_product','choose','quantity','cart','offers','name','phone','address','pincode','email','payment','review'];const flow:FlowMeta|null=done?null:{id:state!.id,name:'order',step:Math.max(1,steps.indexOf(state!.step)+1),totalSteps:steps.length,canGoBack:state!.history.length>0}
  return {answer:text+(choices?'\n'+choices.map((c,i)=>`${i+1}. ${c.label}`).join('\n'):''),source:'commerce_flow',messages:[m],flow,orderId:type==='order_receipt'?payload.orderId:undefined,_stateCommit:stateCommit}
 }
 const next=(step:string)=>{const {history,...snapshot}=state!;state={...state!,step,stepId:randomUUID(),history:[...history,snapshot]}}
 const resolveSavedAddress=async()=>{
  if(state!.addressLookupDone)return state!.savedAddress
  state!.addressLookupDone=true
  let sessionResult:any={data:null,error:null}
  try{sessionResult=await supabase.from('sessions').select('contacts(custom_fields)').eq('client_id',input.clientId).eq('bot_id',input.botId).eq('session_id',input.sessionId).maybeSingle()}catch{}
  const sessionRow=Array.isArray(sessionResult?.data)?sessionResult.data[0]:sessionResult?.data,contact=Array.isArray(sessionRow?.contacts)?sessionRow.contacts[0]:sessionRow?.contacts,fields=contact?.custom_fields||{}
  const saved={address:String(fields.address||'').trim().slice(0,500),pincode:String(fields.postal_code||'').trim().slice(0,12),country:String(fields.country||'IN').trim().toUpperCase().slice(0,2),city:String(fields.city||'').trim().slice(0,120),state:String(fields.state||'').trim().slice(0,120)}
  if(saved.address.length>=5&&/^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/.test(saved.pincode)&&/^[A-Z]{2}$/.test(saved.country))state!.savedAddress=saved
  return state!.savedAddress
 }
 const render=async():Promise<any>=>{
  if(state!.step==='reference')return message('Enter your order reference (ORD-…) to view or cancel an order.')
  if(state!.step==='verify')return message('Enter the email address or phone number used for this order.')
  if(state!.step==='manage')return message(`Order ${state!.reference}: choose an action.`,[{value:'view_order',label:'View receipt'},{value:'change_order',label:'Change order'},{value:'cancel_order',label:'Cancel order'},{value:'keep',label:'Keep order'}])
  if(state!.step==='cancel_review')return message('Are you sure you want to cancel this order?',[{value:'confirm_cancel',label:'Confirm cancellation'},{value:'keep',label:'Keep order'}])
  if(state!.step==='ask_product')return message('Of course—what would you like to order? Please tell me the product name or category.',undefined,false,'product_search')
  if(state!.step==='choose'){
   const visible=products.filter((product:any)=>state!.matchIds?.length?state!.matchIds.includes(product.id):!state!.focusProductId||product.id===state!.focusProductId)
   state!.catalogSnapshotById=Object.fromEntries(products.slice(0,50).map((product:any)=>[product.id,productSnapshot(product)]))
   const rows=visible.map((p:any)=>{
    const heldHere=state!.editingCart?Number(state!.cart.find(line=>line.productId===p.id)?.quantity||0):0,available=p.track_inventory?Number(p.available_quantity)+heldHere:null,reason=state!.recommendationReasons?.[p.id]
    const offer=offers.filter((item:any)=>item.product_id===p.id&&Number(item.remaining)>0&&item.price!=null).sort((a:any,b:any)=>Number(a.price)-Number(b.price))[0]
    const productLine:Line={productId:p.id,name:p.name,sku:p.sku,quantity:1,price:Number(p.price),currency:p.currency}
    const coupon=coupons.filter((item:any)=>couponMatchesCart(item,[productLine],products)&&Number(item.min_cart_value||0)<=Number(p.price)).sort((a:any,b:any)=>calculateCouponDiscount(b,Number(p.price))-calculateCouponDiscount(a,Number(p.price)))[0]
    const offerSaving=offer?Math.max(0,Number(p.price)-Number(offer.price)):0,couponSaving=calculateCouponDiscount(coupon,Number(p.price)),useCoupon=!!coupon&&couponSaving>offerSaving,saving=useCoupon?couponSaving:offerSaving
    return {value:`product:${p.id}`,label:config.productLabels.get(p.id)||p.name,name:config.productLabels.get(p.id)||p.name,description:reason||p.description,recommendationReason:reason,sku:p.sku,imageUrl:p.image_url,price:Number(p.price),currency:p.currency,offerLabel:saving>0?(useCoupon?`${coupon.code} · ${couponLabel(coupon,p.currency||'INR')}`:`${offer.name} · save ${p.currency||'INR'} ${saving.toLocaleString()}`):undefined,offerPrice:saving>0?Math.max(0,Number(p.price)-saving):undefined,availableQuantity:available,inStock:!p.track_inventory||p.allow_backorder||Number(available)>0,availabilityText:p.track_inventory?`${available} available`:'Available'}
   })
   const initialQuantities=Object.fromEntries((state!.editingCart?state!.cart.map(line=>({productId:line.productId,quantity:line.quantity})):state!.draftSelections||[]).filter(line=>visible.some((product:any)=>product.id===line.productId)).map(line=>[line.productId,line.quantity]))
   const showBrief=!!state!.recommendationBrief&&!state!.recommendationBriefShown;if(showBrief)state!.recommendationBriefShown=true
   const result=await message(state!.editingCart?'Edit the quantities in your order.':(state!.matchIds?.length||0)>1?'Choose quantities, then proceed.':`${config.catalogue_label}`,rows,false,'product_grid',{title:state!.recommendationBrief?'Recommended for you':undefined,products:rows,initialQuantities})
   if(showBrief){const card=result.messages[0],intro:FlowMessage={id:randomUUID(),role:'bot',type:'text',flowId:state!.id,stepId:state!.stepId,interactive:false,payload:{text:state!.recommendationBrief}};result.answer=`${state!.recommendationBrief}\n\n${result.answer}`;result.messages=[intro,card]}
   return result
  }
  if(state!.step==='quantity'){const max=state!.selected?.track_inventory&&!state!.selected?.allow_backorder?Number(state!.selected?.available_quantity||0):Math.min(1000,Number(state!.selected?.offerRemaining||1000));return message(`How many ${state!.selected?.name} would you like?`,undefined,false,'product_detail',{product:{name:state!.selected?.name,description:state!.selected?.description,imageUrl:state!.selected?.image_url,price:Number(state!.selected?.price),currency:state!.selected?.currency,variants:state!.selected?.attributes?.variants||[]},variants:state!.selected?.attributes?.variants||[],min:1,max:Math.max(1,max)})}
  if(state!.step==='cart'){const subtotal=state!.cart.reduce((n,x)=>n+x.price*x.quantity,0),currency=state!.cart[0]?.currency||'INR',hasBookingDiscount=!!state!.bookingDiscount,matching=hasBookingDiscount?[]:coupons.filter((coupon:any)=>couponMatchesCart(coupon,state!.cart,products)),qualified=matching.filter((coupon:any)=>subtotal>=Number(coupon.min_cart_value||0)),auto=qualified.filter((coupon:any)=>config.autoApplyCouponIds.has(coupon.id)).sort((a:any,b:any)=>calculateCouponDiscount(b,subtotal)-calculateCouponDiscount(a,subtotal))[0];if(auto&&state!.couponId!==auto.id){state!.couponId=auto.id;state!.couponCode=auto.code}if(state!.couponId&&!qualified.some((coupon:any)=>coupon.id===state!.couponId)){state!.couponId=undefined;state!.couponCode=undefined}const eligibleCoupons=qualified.map((coupon:any)=>({id:coupon.id,code:coupon.code,label:couponLabel(coupon,currency),description:coupon.description||'',autoApplied:config.autoApplyCouponIds.has(coupon.id)})),applied=qualified.find((coupon:any)=>coupon.id===state!.couponId),discount=hasBookingDiscount?calculateBookingDiscount(state!.bookingDiscount,subtotal):calculateCouponDiscount(applied,subtotal),nearest=config.upsell_enabled&&!hasBookingDiscount?matching.filter((coupon:any)=>Number(coupon.min_cart_value||0)>subtotal&&Number(coupon.min_cart_value||0)-subtotal<=config.upsell_max_gap).sort((a:any,b:any)=>Number(a.min_cart_value)-Number(b.min_cart_value))[0]:undefined,gap=nearest?Number(nearest.min_cart_value)-subtotal:0,upsell=nearest?{couponId:nearest.id,code:nearest.code,gap,label:couponLabel(nearest,currency),message:`Add ${currency} ${gap.toLocaleString()} more to unlock ${couponLabel(nearest,currency)} with ${nearest.code}.`}:undefined;state!.couponDiscount=discount;return message(`Cart: ${state!.cart.map(x=>`${x.name}${x.variantName?` (${x.variantName})`:''} × ${x.quantity}${x.waitlist?' (waitlist)':''}`).join(', ')}`,undefined,false,'cart_card',{title:'Your selected order',items:state!.cart,total:subtotal,discount,currency,discountLabel:hasBookingDiscount?`Reservation · ${state!.bookingDiscount!.label}`:'Coupon discount',coupons:eligibleCoupons,appliedCoupon:state!.couponId,upsell})}
  if(state!.step==='offers'){
   const eligible=state!.cart.length===1
    ? offers.filter((offer:any)=>Number(offer.remaining)>0&&state!.cart[0].productId===offer.product_id)
    : []
   const activeCoupon=coupons.find((coupon:any)=>coupon.id===state!.couponId)
   const rows=eligible.map((offer:any)=>{
    const product=products.find((item:any)=>item.id===offer.product_id)
    const saving=offer.price==null?0:Math.max(0,Number(product?.price||0)-Number(offer.price))
    const canCombine=couponStacksWithOffer(activeCoupon,offer)
    return {
     value:`offer:${offer.id}`,
     name:config.offerLabels.get(offer.id)||offer.name,
     label:config.offerLabels.get(offer.id)||offer.name,
     description:`For ${product?.name||'the item in your cart'} · ${Math.max(0,Number(offer.remaining))} remaining`,
     price:offer.price==null?undefined:Number(offer.price),
     currency:offer.currency||product?.currency,
     savingLabel:saving>0?`Save ${offer.currency||product?.currency||'INR'} ${saving.toLocaleString()}`:undefined,
     compatibilityLabel:activeCoupon
      ? (canCombine?`Can combine with ${activeCoupon.code}`:`Replaces ${activeCoupon.code} — offers cannot be stacked`)
      : 'Cannot combine with another offer unless explicitly configured',
    }
   })
   return message(
    `${eligible.length} offer${eligible.length===1?' is':'s are'} available. Only explicitly compatible discounts can be combined.`,
    [...rows.map((row:any)=>({value:row.value,label:row.label})),{value:'skip',label:'Continue without an offer'}],
    false,
    'commerce_offer_picker',
    {offers:rows,currency:state!.cart[0]?.currency||'INR'},
   )
  }
  if(state!.step==='name'){
   const saved=!state!.useNewAddress&&state!.name&&state!.phone?await resolveSavedAddress():undefined
   if(saved)return message('Use your saved delivery address, or add a new one.',undefined,false,'saved_address',{address:saved})
   return message('Please add your contact and delivery details.',undefined,false,'checkout_form',{title:'Where should we send your order?',initial:{name:state!.name||input.knownContact?.name||'',email:state!.email||input.knownContact?.email||'',phone:state!.phone||input.knownContact?.phone||'',address:state!.address||'',pincode:state!.pincode||'',country:state!.country||'',city:state!.city||'',state:state!.region||''},includeAddress:true,requireEmail:false,requirePhone:true,requireAddress:true,requirePincode:true})
  }
  if(state!.step==='phone')return message('What phone number should we use for delivery updates?')
  if(state!.step==='address')return message('Please enter the full delivery or collection address.')
  if(state!.step==='pincode')return message('Enter the delivery postal or PIN code.')
  if(state!.step==='email')return message('Share an email for the receipt, or choose Skip.',[{value:'skip',label:'Skip'}])
  if(state!.step==='payment'){
   const options=await paymentOptions(input.clientId),methods=[
    ...(options.cashOnDelivery?[{value:'cash_on_delivery',label:'Cash on delivery',description:'Pay when your order arrives.'}]:[]),
    ...(options.directUpi?[{value:'direct_upi',label:'Pay securely with UPI',description:'Pay the locked amount, then submit the 12-digit UPI reference.'}]:[]),
    ...(options.gateway?[{value:'gateway',label:'Card / online payment',description:`Secure checkout${options.activeGateway?` via ${options.activeGateway}`:''}.`}]:[]),
   ]
   if(!methods.length)throw new Error('No payment method is currently available')
   const amount=Math.max(0,state!.cart.reduce((sum,line)=>sum+line.price*line.quantity,0)-Number(state!.couponDiscount||0))
   return message('Choose how you want to pay.',methods.map(({value,label})=>({value,label})),false,'payment_method',{methods,amount,currency:state!.cart[0]?.currency||'INR'})
  }
  const subtotal=state!.cart.reduce((n,x)=>n+x.price*x.quantity,0),activeBookingDiscount=bookingDiscountMatches(state!.bookingDiscount,state!.email,state!.phone)?state!.bookingDiscount:undefined,calculatedDiscount=activeBookingDiscount?calculateBookingDiscount(activeBookingDiscount,subtotal):Number(state!.couponDiscount||0),total=Math.max(0,subtotal-calculatedDiscount),currency=state!.cart[0]?.currency||'INR'
  const savings=state!.cart.reduce((sum,line)=>sum+Math.max(0,Number(line.originalPrice||line.price)-line.price)*line.quantity,0)
  return message(`Review order\n${state!.cart.map(x=>`${x.name}${x.variantName?` (${x.variantName})`:''} × ${x.quantity} — ${currency} ${(x.price*x.quantity).toLocaleString()}`).join('\n')}\nTotal: ${currency} ${total.toLocaleString()}\n${state!.name} · ${state!.phone}`,[{value:'confirm',label:'Place order'},{value:'edit',label:'Edit cart'},{value:'cancel',label:'Cancel'}],false,'order_summary',{title:'Invoice · Review your order',rows:[...state!.cart.map(x=>[`${x.name}${x.variantName?` · ${x.variantName}`:''} × ${x.quantity}`,`${currency} ${(x.price*x.quantity).toLocaleString()}`]),...(savings>0?[['Offer savings',`− ${currency} ${savings.toLocaleString()}`]]:[]),...(activeBookingDiscount?[['Reservation discount',`${activeBookingDiscount.label} · − ${currency} ${calculatedDiscount.toLocaleString()}`],...(activeBookingDiscount.code?[['Coupon',activeBookingDiscount.code]]:[])]:state!.couponDiscount?[['Coupon '+state!.couponCode,`− ${currency} ${Number(state!.couponDiscount).toLocaleString()}`]]:[]),['Total',`${currency} ${total.toLocaleString()}`],['Payment',state!.paymentMethod==='cash_on_delivery'?'Cash on delivery':state!.paymentMethod==='direct_upi'?'UPI':'Secure online payment'],['Name',state!.name],['Phone',state!.phone],['Address',`${state!.address} · ${state!.pincode}`],...(state!.email?[['Email',state!.email]]:[])],confirmLabel:'Place order'})
 }
 try{
  if(input.interaction?.flowId&&(input.interaction.flowId!==state.id||input.interaction.stepId!==state.stepId))return render()
  if(input.interaction?.kind==='resume')return render()
  if(input.interaction?.kind==='cancel'||/^(cancel|stop|cancel request)$/i.test(input.text)){await releaseInventoryHolds(input.clientId,holdKey).catch(()=>null);return message('Order request cancelled. No order was placed.',undefined,true)}
  if(input.interaction?.kind==='back'||/^back$/i.test(input.text)){const prev=state.history.pop();if(prev)state={...prev,stepId:randomUUID(),history:state.history};return render()}
  if(fresh)return render()
  let value=input.interaction?.value!=null?String(input.interaction.value):input.text.trim()
  if(!input.interaction&&state.choices?.length){const c=state.choices[Number(value)-1]||state.choices.find(c=>c.label.toLowerCase()===value.toLowerCase());if(c)value=c.value}
  if(state.step==='reference'){const ref=value.match(/ORD-[A-Z0-9]+/i)?.[0];if(!ref)return render();state.reference=ref.toUpperCase();next('verify');return render()}
  if(state.step==='verify'){
   const order=checked(await supabase.from('commerce_orders').select('*,commerce_order_items(*)').eq('client_id',input.clientId).eq('reference',state.reference).maybeSingle())
   const suppliedPhone=value.replace(/\D/g,'').slice(-10),emailMatch=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&String(order?.customer_email||'').toLowerCase()===value.toLowerCase(),phoneMatch=!!suppliedPhone&&suppliedPhone===String(order?.customer_phone||'').replace(/\D/g,'').slice(-10)
   if(!order||(!emailMatch&&!phoneMatch))return message('The reference and customer email or phone did not match. Try again.')
   state.orderId=order.id;state.cart=order.commerce_order_items.map((x:any)=>({productId:x.product_id,name:x.name,sku:x.sku,quantity:x.quantity,price:Number(x.unit_price),currency:order.currency}));state.name=order.customer_name;state.email=order.customer_email;state.phone=order.customer_phone;
   await upsertCustomerContact({clientId:input.clientId,botId:input.botId,sessionId:input.sessionId,name:order.customer_name,email:order.customer_email,phone:order.customer_phone,channel:input.channel,source:'commerce_flow',customFields:{last_order_reference:order.reference}})
   next('manage');return render()
  }
  if(state.step==='manage'){
   if(value==='keep')return message('Your order is unchanged.',undefined,true)
   if(value==='cancel_order'){next('cancel_review');return render()}
   if(value==='change_order')return message('For inventory safety, a placed order cannot be edited in place. You can keep it or cancel it and place a replacement order.',[{value:'cancel_order',label:'Cancel this order'},{value:'keep',label:'Keep order'}])
   if(value==='view_order'){const order=checked(await supabase.from('commerce_orders').select('*').eq('id',state.orderId).single());return message(`Receipt ${order.receipt_number}\nOrder ${order.reference}\n${state.cart.map(x=>`${x.name} × ${x.quantity}`).join('\n')}\nTotal ${order.currency} ${Number(order.total).toLocaleString()}\nStatus: ${order.status}`,undefined,true,'order_receipt',{orderId:order.id,reference:order.reference,receiptNumber:order.receipt_number,status:order.status,total:order.total,currency:order.currency,items:state.cart})}
  }
  if(state.step==='cancel_review'){if(value==='keep')return message('Your order is unchanged.',undefined,true);if(value==='confirm_cancel'){const order=await changeOrder(input.clientId,state.orderId!,'cancelled');return message(`Order ${order.reference} was cancelled.`,undefined,true)}return render()}
  if(state.step==='ask_product'){
   const matches=productMatches(value,products)
   if(!matches.length)return message(`I couldn't find “${value}” in the current catalogue. Try another product name or category.`,undefined,false,'product_search')
   state.matchIds=matches.map((product:any)=>product.id);state.selected=undefined;state.editingCart=false;next('choose')
   return render()
  }
  if(state.step==='choose'){
   if(input.interaction?.kind==='search'){
    const raw=typeof input.interaction.value==='object'&&input.interaction.value?input.interaction.value:{query:input.interaction.value},query=String(raw.query||'').trim(),knownIds=new Set(products.map((product:any)=>product.id)),matches=productMatches(query,products),draft=Array.isArray(raw.selections)?raw.selections.map((item:any)=>({productId:String(item.productId||''),quantity:Number(item.quantity)})).filter((item:any)=>knownIds.has(item.productId)&&Number.isInteger(item.quantity)&&item.quantity>0):[]
    if(!matches.length)return message(`I couldn't find “${query}” in the catalogue. Try another product name, SKU, or category.`,undefined,false,'product_search')
    // Each search renders a new result card. The selected draft is retained
    // independently, so earlier cards remain visible and editable without
    // inflating the new carousel with unrelated products.
    state.draftSelections=draft;state.matchIds=matches.map((product:any)=>product.id);state.selected=undefined;state.stepId=randomUUID();return render()
   }
   if(input.interaction?.kind==='products'&&Array.isArray(input.interaction.value)){
    const visibleIds=new Set([...products.filter((product:any)=>state!.matchIds?.length?state!.matchIds.includes(product.id):!state!.focusProductId||product.id===state!.focusProductId).map((product:any)=>product.id),...(state!.draftSelections||[]).map(item=>item.productId)]),selections=input.interaction.value.map((item:any)=>({productId:String(item.productId||''),quantity:Number(item.quantity)})).filter((item:any)=>visibleIds.has(item.productId)&&Number.isInteger(item.quantity)&&item.quantity>0)
    if(!selections.length)return render()
    const editing=!!state.editingCart
    for(const selection of selections){const product=products.find((item:any)=>item.id===selection.productId),heldHere=editing?Number(state.cart.find(line=>line.productId===product.id)?.quantity||0):0,max=product.track_inventory&&!product.allow_backorder?Number(product.available_quantity)+heldHere:1000,existing=state.cart.find(line=>line.productId===product.id&&!line.variantId),finalQuantity=editing?selection.quantity:(existing?.quantity||0)+selection.quantity;if(finalQuantity>max)throw new Error(`Only ${max} ${product.name} available`)}
    if(editing){await releaseInventoryHolds(input.clientId,holdKey).catch(()=>null);state.cart=[]}
    for(const selection of selections){const product=products.find((item:any)=>item.id===selection.productId),existing=state.cart.find(line=>line.productId===product.id&&!line.variantId),finalQuantity=editing?selection.quantity:(existing?.quantity||0)+selection.quantity;await holdInventory(input.clientId,{product_id:product.id,hold_key:holdKey,quantity:finalQuantity});if(existing)existing.quantity=finalQuantity;else state.cart.push({productId:product.id,name:product.name,sku:product.sku,quantity:finalQuantity,price:Number(product.price),currency:product.currency})}
    state.editingCart=false;state.draftSelections=undefined;state.matchIds=undefined;state.couponId=undefined;state.couponCode=undefined;state.couponDiscount=undefined;next('cart');return render()
   }
   if(!input.interaction&&!value.startsWith('product:')){const matches=productMatches(value,products);if(!matches.length){next('ask_product');return message(`I couldn't find “${value}” by product name, SKU, or category. Try another search.`,undefined,false,'product_search')}state.matchIds=matches.map((product:any)=>product.id);state.selected=undefined;state.stepId=randomUUID();return render()}
   const parts=value.split(':'),product=products.find((p:any)=>p.id===parts[1]);if(parts[0]!=='product'||!product||state.matchIds?.length&&!state.matchIds.includes(product.id))return render()
   state.selected={...product};state.matchIds=undefined
   next('quantity');return render()
  }
  if(state.step==='quantity'){
   const selectedValue=typeof input.interaction?.value==='object'?input.interaction.value:null,qty=Number(selectedValue?.quantity??value),variant=selectedValue?.variant,stockMax=state.selected.track_inventory&&!state.selected.allow_backorder?Number(state.selected.available_quantity):1000,variantMax=variant&&Number.isFinite(Number(variant.stock))?Number(variant.stock):1000,offerMax=state.selected.offerId?Number(state.selected.offerRemaining):1000,waitlist=!!state.selected.offerId&&!!state.selected.waitlistEnabled&&(stockMax<qty||variantMax<qty||offerMax<qty),max=waitlist?Number(state.selected.maxPerCustomer||1000):Math.min(1000,stockMax,variantMax,offerMax);if(!Number.isInteger(qty)||qty<1||qty>(waitlist?Math.min(1000,Number(state.selected.maxPerCustomer||1000)):max))return message(`Enter a quantity from 1 to ${Math.max(1,waitlist?Math.min(1000,Number(state.selected.maxPerCustomer||1000)):max)}.`)
   if(!waitlist)await holdInventory(input.clientId,{product_id:state.selected.id,hold_key:holdKey,quantity:qty})
   const existing=state.cart.find(x=>x.productId===state!.selected.id&&x.variantId===(variant?.id||undefined));if(existing){existing.quantity=qty;existing.waitlist=waitlist}else state.cart.push({productId:state.selected.id,name:state.selected.name,sku:variant?.sku||state.selected.sku,quantity:qty,price:Number(variant?.price??state.selected.price),currency:state.selected.currency,offerId:state.selected.offerId,waitlist,variantId:variant?.id,variantName:variant?.name})
   next('cart');return render()
  }
  if(state.step==='cart'){
   const cart=state.cart
   if(value==='cancel'){await releaseInventoryHolds(input.clientId,holdKey).catch(()=>null);return message('Order request cancelled.',undefined,true)}
   if(!input.interaction&&!['checkout','edit'].includes(value)){const subtotal=state.cart.reduce((sum,line)=>sum+line.price*line.quantity,0),coupon=coupons.find((item:any)=>String(item.code).toLowerCase()===value.toLowerCase()&&subtotal>=Number(item.min_cart_value||0)&&couponMatchesCart(item,cart,products));if(coupon){state.couponId=coupon.id;state.couponCode=coupon.code;state.couponDiscount=calculateCouponDiscount(coupon,subtotal);state.stepId=randomUUID();return render()}const matches=productMatches(value,products);if(!matches.length)return message(`I couldn't find “${value}” in the catalogue. Search by product name or SKU.`,undefined,false,'product_search');state.matchIds=matches.map((product:any)=>product.id);state.editingCart=false;next('choose');return render()}
   if(input.interaction?.kind==='search'){const raw=typeof input.interaction.value==='object'&&input.interaction.value?input.interaction.value:{query:input.interaction.value},query=String(raw.query||'').trim(),matches=productMatches(query,products);if(!matches.length)return message(`I couldn't find “${query}” in the catalogue. Try another product name or SKU.`,undefined,false,'product_search');state.matchIds=Array.from(new Set([...state.cart.map(line=>line.productId),...matches.map((product:any)=>product.id)]));state.editingCart=true;next('choose');return render()}
   if(input.interaction?.kind==='edit_cart'||value==='edit'){state.matchIds=state.cart.map(line=>line.productId);state.editingCart=true;next('choose');return render()}
   if(input.interaction?.kind==='coupon'){const subtotal=state.cart.reduce((sum,line)=>sum+line.price*line.quantity,0),coupon=coupons.find((item:any)=>item.id===String(input.interaction?.value)&&subtotal>=Number(item.min_cart_value||0)&&couponMatchesCart(item,cart,products));if(!coupon)return render();state.couponId=coupon.id;state.couponCode=coupon.code;state.couponDiscount=calculateCouponDiscount(coupon,subtotal);state.stepId=randomUUID();return render()}
   if(input.interaction?.kind==='cart_checkout'&&Array.isArray(input.interaction.value)){
    const requested=new Map<string,number>()
    for(const item of input.interaction.value){const productId=String(item?.productId||''),quantity=Number(item?.quantity);if(!state.cart.some(line=>line.productId===productId)||!Number.isInteger(quantity)||quantity<0||quantity>1000)return render();requested.set(productId,quantity)}
    const nextCart=state.cart.filter(line=>(requested.get(line.productId)??line.quantity)>0).map(line=>({...line,quantity:requested.get(line.productId)??line.quantity}))
    if(!nextCart.length)return render()
    const previousCart=state.cart.map(line=>({...line}))
    await releaseInventoryHolds(input.clientId,holdKey).catch(()=>null)
    const nextHolds=nextCart.filter(line=>!line.waitlist).map(line=>({product_id:line.productId,quantity:line.quantity})),previousHolds=previousCart.filter(line=>!line.waitlist).map(line=>({product_id:line.productId,quantity:line.quantity}))
    try{if(nextHolds.length)await holdInventoryBatch(input.clientId,holdKey,nextHolds)}catch(error){if(previousHolds.length)await holdInventoryBatch(input.clientId,holdKey,previousHolds).catch(()=>null);throw error}
    state.cart=nextCart
    // The widget's Proceed button submits the final cart quantities. Keep a
    // selected coupon when the adjusted cart is still eligible and resolve an
    // auto-apply rule here as well; this path advances directly to delivery
    // and therefore does not render the cart a second time.
    if(!state.bookingDiscount){
     const subtotal=nextCart.reduce((sum,line)=>sum+line.price*line.quantity,0)
     const qualified=coupons.filter((coupon:any)=>couponMatchesCart(coupon,nextCart,products)&&subtotal>=Number(coupon.min_cart_value||0))
     let selected=qualified.find((coupon:any)=>coupon.id===state!.couponId)
     if(!selected)selected=qualified.filter((coupon:any)=>config.autoApplyCouponIds.has(coupon.id)).sort((a:any,b:any)=>calculateCouponDiscount(b,subtotal)-calculateCouponDiscount(a,subtotal))[0]
     state.couponId=selected?.id;state.couponCode=selected?.code;state.couponDiscount=calculateCouponDiscount(selected,subtotal)
    }
    const eligible=state.cart.length===1&&offers.some((offer:any)=>Number(offer.remaining)>0&&state!.cart[0].productId===offer.product_id);next(eligible&&!state.offersReviewed?'offers':'name');return render()
   }
   if(value==='checkout'){const eligible=state.cart.length===1&&offers.some((offer:any)=>Number(offer.remaining)>0&&state!.cart[0].productId===offer.product_id);next(eligible&&!state.offersReviewed?'offers':'name')}
   return render()
  }
  if(state.step==='offers'){state.offersReviewed=true;if(value!=='skip'){const offerId=value.startsWith('offer:')?value.slice(6):'',offer=offers.find((item:any)=>item.id===offerId&&Number(item.remaining)>0),line=offer&&state.cart.find(item=>item.productId===offer.product_id);if(!offer||!line)return render();line.offerId=offer.id;line.originalPrice=line.price;if(offer.price!=null&&Number(offer.price)>=0)line.price=Number(offer.price);state.appliedOfferId=offer.id;const subtotal=state.cart.reduce((sum,item)=>sum+item.price*item.quantity,0),coupon=coupons.find((item:any)=>item.id===state!.couponId);if(coupon&&!couponStacksWithOffer(coupon,offer)){state.couponId=undefined;state.couponCode=undefined;state.couponDiscount=0}else state.couponDiscount=calculateCouponDiscount(coupon,subtotal);await supabase.from('booking_events').insert({client_id:input.clientId,action:'commerce_offer_applied',details:{offer_id:offer.id,product_id:line.productId,coupon_id:state.couponId||null,stacked:!!state.couponId,channel:input.channel||'web'}})}next('name');return render()}
  if(state.step==='name'){
   if(input.interaction?.kind==='saved_address'){
    if(value==='new'){state.useNewAddress=true;state.stepId=randomUUID();return render()}
    if(value==='saved'){const saved=state.savedAddress;if(!saved||!state.name||!state.phone){state.useNewAddress=true;state.stepId=randomUUID();return render()}state.address=saved.address;state.pincode=saved.pincode;state.country=saved.country;state.city=saved.city;state.region=saved.state;next('payment');return render()}
   }
   if(typeof input.interaction?.value==='object'){const contact=input.interaction.value,email=String(contact.email||'').trim(),phone=String(contact.phone||'').trim(),address=String(contact.address||'').trim(),pincode=String(contact.pincode||'').trim(),country=String(contact.country||'IN').trim().toUpperCase(),city=String(contact.city||'').trim().slice(0,120),region=String(contact.state||'').trim().slice(0,120);if(String(contact.name||'').trim().length<2||!/^[+0-9][0-9\s()-]{6,19}$/.test(phone)||address.length<5||!/^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/.test(pincode)||!/^([A-Z]{2})$/.test(country)||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return render();state.name=String(contact.name).trim();state.email=email?email.toLowerCase():undefined;state.phone=phone;state.address=address.slice(0,500);state.pincode=pincode;state.country=country;state.city=city;state.region=region;state.savedAddress={address:state.address,pincode,country,city,state:region};if(state.bookingDiscount&&!bookingDiscountMatches(state.bookingDiscount,state.email,state.phone)){state.bookingDiscount=undefined;state.couponDiscount=undefined}if(!state.bookingDiscount){const identityKeys=[`booking_bill_discount_contact:${input.clientId}:phone:${discountPhoneIdentity(phone)}`,email?`booking_bill_discount_contact:${input.clientId}:email:${discountIdentity(email)}`:''].filter(Boolean);for(const identityKey of identityKeys){const benefit=await redis.get<DeferredBillDiscount>(identityKey);if(bookingDiscountMatches(benefit||undefined,state.email,state.phone)){state.bookingDiscount=benefit!;state.couponId=undefined;state.couponCode=undefined;break}}}await upsertCustomerContact({clientId:input.clientId,botId:input.botId,sessionId:input.sessionId,name:state.name,email:state.email,phone:state.phone,channel:input.channel,source:'commerce_flow',customFields:{active_order_flow:state.id,address:state.address,postal_code:pincode,country,city,state:region}});next('payment');return render()}if(value.length<2||value.length>150)return render();state.name=value.trim();next('phone');return render()
  }
  if(state.step==='phone'){if(!/^[+0-9][0-9\s()-]{6,19}$/.test(value))return message('Please enter a valid phone number for delivery updates.');state.phone=value.trim();next('address');return render()}
  if(state.step==='address'){if(value.trim().length<5)return message('Please enter a complete delivery or collection address.');state.address=value.trim().slice(0,500);next('pincode');return render()}
  if(state.step==='pincode'){if(!/^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/.test(value.trim()))return message('Please enter a valid postal or PIN code.');state.pincode=value.trim();next('email');return render()}
  if(state.step==='email'){if(value!=='skip'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return render();state.email=value==='skip'?undefined:value.toLowerCase();next('payment');return render()}
  if(state.step==='payment'){if(!['cash_on_delivery','direct_upi','gateway'].includes(value))return render();const options=await paymentOptions(input.clientId);if((value==='cash_on_delivery'&&!options.cashOnDelivery)||(value==='direct_upi'&&!options.directUpi)||(value==='gateway'&&!options.gateway))return render();state.paymentMethod=value as State['paymentMethod'];next('review');return render()}
  if(value==='edit'){state.matchIds=state.cart.map(line=>line.productId);state.editingCart=true;next('choose');return render()}if(value==='cancel'){await releaseInventoryHolds(input.clientId,holdKey).catch(()=>null);return message('Order request cancelled.',undefined,true)}if(value!=='confirm')return render()
  if(!state.name||!state.phone||!state.address||!state.pincode){next('name');return render()}
  const contact=await upsertCustomerContact({clientId:input.clientId,botId:input.botId,sessionId:input.sessionId,name:state.name,email:state.email,phone:state.phone,channel:input.channel,source:'commerce_flow',customFields:{active_order_flow:state.id,address:state.address,postal_code:state.pincode}})
  const offerIds=Array.from(new Set(state.cart.map(x=>x.offerId).filter(Boolean)));if(offerIds.length>1)throw new Error('Checkout campaign products separately')
  const waitlisted=state.cart.find(x=>x.waitlist);if(waitlisted){if(state.cart.length!==1||!waitlisted.offerId)throw new Error('Checkout a waitlisted campaign item separately');const entry=await joinCommerceWaitlist(input.clientId,{offer_id:waitlisted.offerId,product_id:waitlisted.productId,quantity:waitlisted.quantity,customer_name:state.name,customer_email:state.email,customer_phone:state.phone,shipping_address:{text:state.address},channel:input.channel||'web'});return message(`You joined the waitlist for ${waitlisted.name} × ${waitlisted.quantity}. We will create the order automatically and send the receipt when campaign stock becomes available.`,undefined,true,'order_receipt',{orderId:entry.id,reference:'WAITLIST',status:'waiting',total:waitlisted.price*waitlisted.quantity,currency:waitlisted.currency,items:state.cart})}
  await holdInventoryBatch(input.clientId,holdKey,state.cart.map(line=>({product_id:line.productId,quantity:line.quantity})))
  const activeBookingDiscount=bookingDiscountMatches(state.bookingDiscount,state.email,state.phone)?state.bookingDiscount:undefined
  const order=await placeOrder(input.clientId,{customer_name:state.name,customer_email:state.email,customer_phone:state.phone,shipping_address:{text:state.address,pincode:state.pincode,country:state.country||'IN',city:state.city||'',state:state.region||''},items:state.cart.map(x=>({product_id:x.productId,quantity:x.quantity})),offer_id:offerIds[0],coupon_id:activeBookingDiscount?undefined:state.couponId,booking_id:activeBookingDiscount?.bookingId,hold_key:holdKey,session_id:input.sessionId,operation_id:state.id,idempotency_key:state.id,channel:input.channel||'web'})
  const payment=await initializeOrderPayment(input.clientId,order,state.paymentMethod||'cash_on_delivery')
  await supabase.from('commerce_orders').update({contact_id:contact.id}).eq('id',order.id).eq('client_id',input.clientId)
  for(const line of state.cart.filter(x=>x.variantId))await supabase.from('commerce_order_items').update({metadata:{variant_id:line.variantId,variant_name:line.variantName}}).eq('order_id',order.id).eq('product_id',line.productId)
  await supabase.from('contacts').update({custom_fields:{...(contact.custom_fields||{}),last_order_reference:order.reference,active_order_flow:null},last_active_at:new Date().toISOString()}).eq('client_id',input.clientId).eq('id',contact.id)
  if(activeBookingDiscount){const identityKeys=[activeBookingDiscount.customerPhone?`booking_bill_discount_contact:${input.clientId}:phone:${discountPhoneIdentity(activeBookingDiscount.customerPhone)}`:'',activeBookingDiscount.customerEmail?`booking_bill_discount_contact:${input.clientId}:email:${discountIdentity(activeBookingDiscount.customerEmail)}`:''].filter(Boolean);await Promise.all([redis.del(bookingDiscountKey),...identityKeys.map(identityKey=>redis.del(identityKey))])}
  const confirmation=`Order placed — ${order.reference}. Receipt ${order.receipt_number}. Total ${order.currency} ${Number(order.total).toLocaleString()}. ${payment.method==='cash_on_delivery'?'Payment is due on delivery.':'Complete payment below to confirm processing.'}`
  const receiptSubtotal=state.cart.reduce((sum,line)=>sum+Number(line.originalPrice??line.price)*line.quantity,0),receiptDiscount=Math.max(0,receiptSubtotal-Number(order.total))
  const paidLater=payment.method==='cash_on_delivery',result=await message(confirmation,undefined,true,'order_confirmation',{title:paidLater?'Order confirmed':'Order created · payment pending',text:confirmation,orderId:order.id,reference:order.reference,receiptNumber:order.receipt_number,status:paidLater?'cash on delivery':'awaiting payment',total:order.total,currency:order.currency,items:state.cart,rows:[...state.cart.map(line=>[`${line.name} × ${line.quantity}`,`${line.currency} ${(Number(line.originalPrice??line.price)*line.quantity).toLocaleString()}`]),['Full amount',`${order.currency} ${receiptSubtotal.toLocaleString()}`],...((activeBookingDiscount?.code||state.couponCode)?[['Coupon',activeBookingDiscount?.code||state.couponCode]]:[]),...(receiptDiscount>0?[[activeBookingDiscount?'Reservation discount':'Discount',`− ${order.currency} ${receiptDiscount.toLocaleString()}`]]:[]),['Final amount',`${order.currency} ${Number(order.total).toLocaleString()}`],['Payment',paidLater?'Cash on delivery':'Pending'],['Deliver to',`${state.address} · ${state.pincode}`]]})
  const successText=paidLater?'Your order is confirmed. Here is your receipt.':'Your order has been created. Complete the secure payment step below.'
  result.answer=`${successText}\n\n${result.answer}`
  result.messages.unshift({id:randomUUID(),role:'bot',type:'text',flowId:state.id,stepId:state.stepId,interactive:false,payload:{text:successText}})
  if(payment.method!=='cash_on_delivery')result.messages.push({id:randomUUID(),role:'bot',type:'payment_checkout',flowId:state.id,stepId:state.stepId,interactive:true,payload:{amount:Number(order.total),currency:order.currency,reference:order.reference,upiUri:payment.upiUri,qrUrl:payment.qrUrl,upiId:payment.upiId,payeeName:payment.payeeName,accountLabel:payment.accountLabel,token:payment.token,gatewayOrderId:payment.gatewayOrderId,gatewayKeyId:payment.gatewayKeyId,customer:payment.customer,expiresAt:payment.expiresAt}})
  return result
 }catch(e:any){console.error('[commerce flow]',e?.message||e);return message(FRIENDLY_RETRY_MESSAGE,state?.choices)}
}
