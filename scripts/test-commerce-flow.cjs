const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const cache = new Map()
let stock = 5
let held = 0
let placed = 0
let released = 0
let activeOffers = false
let lastOrderInput = null
let catalogSearches = 0
let savedContactAddress = false
const product = {id:'product-1',name:'Masala Tea',sku:'TEA-1',description:'Fresh spice blend',image_url:'https://example.com/tea.jpg',price:250,currency:'INR',stock_quantity:stock,available_quantity:stock,track_inventory:true,allow_backorder:false,status:'active'}
const shoes = [
 {id:'product-2',name:'Road Running Shoes',sku:'SHOE-1',category:'Shoes',description:'Light daily running shoes',price:3200,currency:'INR',stock_quantity:8,available_quantity:8,track_inventory:true,allow_backorder:false,status:'active'},
 {id:'product-3',name:'Everyday Leather Shoes',sku:'SHOE-2',category:'Shoes',description:'Smart casual leather pair',price:4400,currency:'INR',stock_quantity:4,available_quantity:4,track_inventory:true,allow_backorder:false,status:'active'},
]
const lamps = [
 {id:'product-4',name:'Arc Floor Lamp',sku:'LAMP-ARC',category:'Lighting',description:'Tall reading lamp',price:2800,currency:'INR',stock_quantity:6,available_quantity:6,track_inventory:true,allow_backorder:false,status:'active'},
 {id:'product-5',name:'Desk Lamp',sku:'LAMP-DESK',category:'Lighting',description:'Compact task light',price:1200,currency:'INR',stock_quantity:9,available_quantity:9,track_inventory:true,allow_backorder:false,status:'active'},
]
const unrelated={id:'product-6',name:'Test 1',sku:'TEST-1',category:'Test',description:'Unrelated product',price:100,currency:'INR',stock_quantity:1,available_quantity:1,track_inventory:true,allow_backorder:false,status:'active'}
const offer={id:'offer-1',name:'Tea launch price',product_id:product.id,price:200,currency:'INR',remaining:10,max_per_customer:5,status:'active',segment_rule:{}}
const coupon={id:'coupon-1',code:'TEA10',description:'Ten percent off eligible orders',discount_type:'percentage',discount_value:10,min_cart_value:100,is_active:true}
const rows = table => table==='catalog_product_availability'?[{...product,stock_quantity:stock,available_quantity:stock-held},...shoes,...lamps,unrelated]:table==='booking_offer_stats'&&activeOffers?[offer]:table==='coupons'?[coupon]:table==='sessions'&&savedContactAddress?[{contacts:{custom_fields:{address:'18 Saved Avenue',postal_code:'411001',country:'IN',city:'Pune',state:'Maharashtra'}}}]:[]
const supabase = {from(table){const q={select(){return q},eq(){return q},order(){return q},not(){return q},lte(){return q},gt(){return q},limit(){return q},upsert(){return q},insert(){return q},update(){return q},single(){return q},maybeSingle(){return q},then(resolve){resolve({data:rows(table),error:null})}};return q}}
const redis = {get:async key=>cache.get(key)||null,set:async(key,value)=>cache.set(key,structuredClone(value)),del:async key=>cache.delete(key),exists:async key=>cache.has(key)?1:0}
const config = {configured:false,booking_enabled:true,ordering_enabled:true,show_catalog:true,allow_booking_management:true,allow_order_management:true,menu_title:'Shop',catalogue_label:'Browse products',serviceIds:new Set(),offerIds:new Set(),productIds:new Set(),serviceLabels:new Map(),offerLabels:new Map(),productLabels:new Map()}

function transpile(path){return ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}
function load(code,mocks){const moduleObject={exports:{}};vm.runInNewContext(code,{exports:moduleObject.exports,module:moduleObject,require:name=>mocks[name]||require(name),Date,console,Intl,Set,Map,Array,String,Number,Math});return moduleObject.exports}
const intent = load(transpile('src/lib/commerceIntent.ts'),{})
const bookingIntent = load(transpile('src/lib/bookingIntent.ts'),{})
const entities = load(transpile('src/lib/conversationEntities.ts'),{})
const mocks={
 '@/lib/redis':{redis},'@/lib/supabase':{supabase},'@/lib/booking':{checked:result=>result.data},'@/lib/botCommerceConfig':{getBotCommerceConfig:async()=>config},'@/lib/commerceIntent':intent,'@/lib/bookingIntent':bookingIntent,
 '@/lib/chat/commerceBundleCache':{getBotCommerceBundle:async()=>({clientId:'client-1',botId:'bot-1',config,offers:rows('booking_offer_stats'),coupons:rows('coupons'),cachedAt:Date.now()})},
 '@/lib/saas/entitlements':{featureAllowed:()=>true},
 '@/lib/retention':{BOOKING_ORDER_FLOW_RETENTION_MS:86400000,BOOKING_ORDER_FLOW_RETENTION_SECONDS:86400},'@/lib/conversationEntities':entities,'@/lib/customerErrorMessage':{FRIENDLY_RETRY_MESSAGE:'Friendly retry'},'@/lib/customerContacts':{upsertCustomerContact:async input=>({id:'contact-1',custom_fields:{},...input})},
 '@/lib/offeringDiscovery':{recommendationScope:text=>/girlfriend/i.test(text)?'product':null,discoverOfferings:async()=>({brief:'That is a lovely idea. Here is a thoughtful option.',source:'hybrid_rrf',items:[{id:'product-4',reason:'Warm romantic ambience'}]})},
 '@/lib/chat/catalogRepository':{searchBotCatalog:async()=>{catalogSearches++;return rows('catalog_product_availability')}},
 '@/lib/paymentSecurity':{paymentOptions:async()=>({cashOnDelivery:true,directUpi:false,gateway:false}),initializeOrderPayment:async()=>({method:'cash_on_delivery',status:'cash_on_delivery',expiresAt:null})},
 '@/lib/commerce':{
 holdInventory:async(_client,input)=>{assert.ok([product.id,...shoes.map(item=>item.id),...lamps.map(item=>item.id),unrelated.id].includes(input.product_id));if(input.product_id===product.id){if(input.quantity>stock)throw new Error('Insufficient inventory');held=input.quantity}return {quantity:input.quantity}},
  holdInventoryBatch:async(client,holdKey,items)=>{const holds=[];for(const item of items)holds.push(await mocks['@/lib/commerce'].holdInventory(client,{...item,hold_key:holdKey}));return{holds,count:holds.length}},
  releaseInventoryHolds:async()=>{released++;held=0;return 1},
  placeOrder:async(_client,input)=>{placed++;lastOrderInput=input;const quantity=input.items[0].quantity,subtotal=250*quantity,total=input.booking_id?subtotal*.7:input.coupon_id?subtotal*.9:subtotal;assert.equal(held,quantity);stock-=quantity;held=0;return {id:'order-1',reference:'ORD-TEST',receipt_number:'RCT-TEST',status:'placed',total,currency:'INR',customer_email:input.customer_email}},
  joinCommerceWaitlist:async()=>{throw new Error('Unexpected waitlist')},changeOrder:async()=>{throw new Error('Unexpected order change')}
 }
}
const flow = load(transpile('src/lib/commerceFlow.ts'),mocks).handleCommerceFlow
const base={clientId:'client-1',botId:'bot-1',channel:'web'}
async function start(text,sessionId='session-123'){return flow({...base,sessionId,text})}
async function answer(previous,value,kind='choice',sessionId='session-123'){return flow({...base,sessionId,text:String(value),interaction:{kind,value,flowId:previous.flow.id,stepId:previous.messages[0].stepId}})}

async function main(){
 assert.equal(intent.isPotentialCommerceRequest('track my order'),false)
 assert.equal(intent.isOrderManagementRequest('I want to cancel the order'),true)
 assert.equal(intent.isOrderManagementRequest('I want to change my order'),true)
 assert.equal(await start('I want to return ORD-123','return-route'),null)
 assert.equal(await start('I want to reserve a table','reservation-route'),null)
 assert.equal(await start('I want to book a seat','seat-booking-route'),null)
 assert.equal(bookingIntent.isExplicitBookingRequest('I need to book a table for 6 on 18 October at 8pm in Satya Nagar branch. Are tables free?'),true)
 assert.equal(await start('hello'),null)
 const browse=await start('Browse products','browse-catalogue')
 assert.equal(browse.messages[0].type,'product_grid')
 assert.match(browse.messages[0].payload.products.find(item=>item.name==='Masala Tea').offerLabel,/TEA10/,'eligible catalogue cards should advertise the coupon before the item is added')
 let recommended=await start('I want to gift my girlfriend something special','gift-discovery')
 assert.deepEqual(Array.from(recommended.messages,message=>message.type),['text','product_grid'])
 assert.match(recommended.messages[0].payload.text,/lovely idea/i)
 assert.deepEqual(Array.from(recommended.messages[1].payload.products,item=>item.name),['Arc Floor Lamp'])
 assert.equal(recommended.messages[1].payload.products[0].recommendationReason,'Warm romantic ambience')
 let discovery=await start('I need to order something','generic-discovery')
 assert.equal(discovery.messages[0].type,'product_search')
 discovery=await answer(discovery,'Masala Tea','search','generic-discovery')
 assert.equal(discovery.messages[0].type,'product_grid')
 let category=await start('I need to buy something','category-discovery')
 category=await answer(category,'shoes','search','category-discovery')
 assert.equal(category.messages[0].type,'product_grid')
 assert.deepEqual(Array.from(category.messages[0].payload.products,item=>item.name),shoes.map(item=>item.name))
 let lampSearch=await start('I need to order lamp do you have it?','lamp-direct')
 assert.equal(lampSearch.messages[0].type,'product_grid')
 assert.deepEqual(Array.from(lampSearch.messages[0].payload.products,item=>item.name).sort(),lamps.map(item=>item.name).sort())
 assert.ok(!lampSearch.messages[0].payload.products.some(item=>item.name==='Test 1'))
 let carouselSearch=await start('I want shoes','carousel-search')
 carouselSearch=await answer(carouselSearch,'lamp','search','carousel-search')
 assert.equal(carouselSearch.messages[0].type,'product_grid')
 assert.deepEqual(Array.from(carouselSearch.messages[0].payload.products,item=>item.name).sort(),lamps.map(item=>item.name).sort(),'browse must return a separate focused card while the widget preserves earlier cards')
 assert.deepEqual(Object.keys(carouselSearch.messages[0].payload.initialQuantities),[],'browsing another product must not duplicate cart quantities')
 carouselSearch=await answer(carouselSearch,[{productId:lamps[1].id,quantity:1}],'products','carousel-search')
 assert.deepEqual(Array.from(carouselSearch.messages[0].payload.items,item=>item.name),[lamps[1].name])
 carouselSearch=await answer(carouselSearch,'cancel','cancel','carousel-search')
 let draftSearch=await start('I want shoes','draft-search')
 draftSearch=await answer(draftSearch,{query:'lamp',selections:[{productId:shoes[0].id,quantity:2}]},'search','draft-search')
 assert.equal(draftSearch.messages[0].type,'product_grid')
 assert.equal(draftSearch.messages[0].payload.initialQuantities[shoes[0].id],undefined,'the new result card must not duplicate an earlier card')
 assert.ok(!draftSearch.messages[0].payload.products.some(item=>item.value===`product:${shoes[0].id}`),'the original product remains in its earlier widget card')
 assert.ok(draftSearch.messages[0].payload.products.some(item=>item.value===`product:${lamps[0].id}`),'the new card must contain the requested results')
 assert.deepEqual(Array.from(cache.get('commerce_flow:client-1:bot-1:draft-search').draftSelections,item=>[item.productId,item.quantity]),[[shoes[0].id,2]],'the shared draft must preserve selections from earlier cards')
 draftSearch=await answer(draftSearch,'cancel','cancel','draft-search')
 let existingPicker=await start('Show me your products','picker-search')
 assert.ok(existingPicker.messages[0].payload.products.some(item=>item.name==='Test 1'))
 existingPicker=await start('lamp','picker-search')
 assert.deepEqual(Array.from(existingPicker.messages[0].payload.products,item=>item.name).sort(),lamps.map(item=>item.name).sort())
 const releasedBeforeSwitch=released
 const switched=await start('I need to book a table for 6 on 18 October at 8pm in Satya Nagar branch. Are tables free?','picker-search')
 assert.equal(switched,null)
 assert.equal(cache.has('commerce_flow:client-1:bot-1:picker-search'),false)
 assert.equal(released,releasedBeforeSwitch+1)
 let multi=await start('I want shoes','multi-cart')
 multi=await answer(multi,[{productId:shoes[0].id,quantity:2},{productId:shoes[1].id,quantity:1}],'products','multi-cart')
 assert.equal(multi.messages[0].type,'cart_card')
 assert.equal(multi.messages[0].payload.items.length,2)
 assert.equal(multi.messages[0].payload.items.reduce((sum,item)=>sum+item.quantity,0),3)
 multi=await answer(multi,'lamp','search','multi-cart')
 assert.equal(multi.messages[0].type,'product_grid')
 multi=await answer(multi,[{productId:shoes[0].id,quantity:2},{productId:shoes[1].id,quantity:1},{productId:lamps[0].id,quantity:1}],'products','multi-cart')
 assert.equal(multi.messages[0].payload.items.length,3)
 assert.deepEqual(Array.from(multi.messages[0].payload.items,item=>item.name),[shoes[0].name,shoes[1].name,lamps[0].name])
 assert.equal(multi.messages[0].payload.items.reduce((sum,item)=>sum+item.quantity,0),4)
 multi=await answer(multi,'edit','edit_cart','multi-cart')
 assert.equal(multi.messages[0].type,'product_grid')
 assert.equal(Object.keys(multi.messages[0].payload.initialQuantities).length,3)
 multi=await answer(multi,[{productId:shoes[0].id,quantity:1},{productId:lamps[0].id,quantity:2}],'products','multi-cart')
 assert.equal(multi.messages[0].payload.items.length,2)
 multi=await answer(multi,'cancel','cancel','multi-cart')
 let adjustable=await start('I want shoes','adjustable-cart')
 adjustable=await answer(adjustable,[{productId:shoes[0].id,quantity:2},{productId:shoes[1].id,quantity:1}],'products','adjustable-cart')
 adjustable=await answer(adjustable,[{productId:shoes[0].id,quantity:3},{productId:shoes[1].id,quantity:0}],'cart_checkout','adjustable-cart')
 assert.equal(adjustable.messages[0].type,'checkout_form','the final cart proceed should advance directly to delivery')
 const adjustableState=cache.get('commerce_flow:client-1:bot-1:adjustable-cart')
 assert.deepEqual(Array.from(adjustableState.cart,line=>[line.productId,line.quantity]),[[shoes[0].id,3]],'quantity zero must remove the product and the final quantity must be retained')
 await answer(adjustable,'cancel','cancel','adjustable-cart')
 activeOffers=true
 let discounted=await start('I want Masala Tea','offer-flow')
 discounted=await answer(discounted,[{productId:product.id,quantity:1}],'products','offer-flow')
 discounted=await answer(discounted,'checkout','choice','offer-flow')
 assert.equal(discounted.messages[0].type,'commerce_offer_picker')
 discounted=await answer(discounted,'offer:offer-1','choice','offer-flow')
 assert.equal(discounted.messages[0].type,'checkout_form')
 discounted=await answer(discounted,{name:'Offer Customer',phone:'+91 90000 00000',address:'45 Offer Street, Pune',pincode:'411001',email:''},'contact','offer-flow')
 assert.equal(discounted.messages[0].type,'payment_method')
 discounted=await answer(discounted,'cash_on_delivery','payment','offer-flow')
 assert.equal(discounted.messages[0].type,'order_summary')
 assert.ok(discounted.messages[0].payload.rows.some(row=>row[0]==='Offer savings'&&/50/.test(row[1])))
 discounted=await answer(discounted,'cancel','cancel','offer-flow')
 activeOffers=false
 coupon.min_cart_value=500
 let upsellFlow=await start('I want Masala Tea','upsell-flow')
 upsellFlow=await answer(upsellFlow,[{productId:product.id,quantity:1}],'products','upsell-flow')
 assert.equal(upsellFlow.messages[0].payload.upsell.code,'TEA10')
 assert.equal(upsellFlow.messages[0].payload.upsell.gap,250)
 await answer(upsellFlow,'cancel','cancel','upsell-flow')
 coupon.min_cart_value=100
 let couponFlow=await start('I want Masala Tea','coupon-flow')
 couponFlow=await answer(couponFlow,[{productId:product.id,quantity:1}],'products','coupon-flow')
 assert.equal(couponFlow.messages[0].payload.coupons[0].code,'TEA10')
 assert.equal(couponFlow.messages[0].payload.coupons[0].description,coupon.description)
 couponFlow=await answer(couponFlow,'coupon-1','coupon','coupon-flow')
 assert.equal(couponFlow.messages[0].payload.appliedCoupon,'coupon-1')
 couponFlow=await answer(couponFlow,[{productId:product.id,quantity:1}],'cart_checkout','coupon-flow')
 assert.equal(cache.get('commerce_flow:client-1:bot-1:coupon-flow').couponId,'coupon-1','the widget Proceed action must retain an eligible selected coupon')
 couponFlow=await answer(couponFlow,{name:'Coupon Customer',phone:'+91 91111 11111',address:'10 Coupon Road, Pune',pincode:'411001',email:''},'contact','coupon-flow')
 assert.equal(couponFlow.messages[0].type,'payment_method')
 couponFlow=await answer(couponFlow,'cash_on_delivery','payment','coupon-flow')
 assert.ok(couponFlow.messages[0].payload.rows.some(row=>row[0]==='Coupon TEA10'&&/25/.test(row[1])))
 couponFlow=await answer(couponFlow,'confirm','confirm','coupon-flow')
 const couponReceipt=couponFlow.messages.find(message=>message.type==='order_confirmation')
 assert.ok(couponReceipt.payload.rows.some(row=>row[0]==='Coupon'&&row[1]==='TEA10'),'the confirmed receipt must retain the claimed coupon')
 assert.ok(couponReceipt.payload.rows.some(row=>row[0]==='Discount'&&/25/.test(row[1])))
 assert.equal(couponReceipt.payload.total,225)
 config.autoApplyCouponIds=new Set(['coupon-1'])
 let automaticCoupon=await start('I want Masala Tea','auto-coupon-flow')
 automaticCoupon=await answer(automaticCoupon,[{productId:product.id,quantity:1}],'products','auto-coupon-flow')
 assert.equal(automaticCoupon.messages[0].payload.appliedCoupon,'coupon-1','an assigned automatic coupon should be selected as soon as the cart qualifies')
 automaticCoupon=await answer(automaticCoupon,[{productId:product.id,quantity:2}],'cart_checkout','auto-coupon-flow')
 const automaticState=cache.get('commerce_flow:client-1:bot-1:auto-coupon-flow')
 assert.equal(automaticState.couponId,'coupon-1')
 assert.equal(automaticState.couponDiscount,50,'the automatic discount must be recalculated after quantity changes on Proceed')
 await answer(automaticCoupon,'cancel','cancel','auto-coupon-flow')
 config.autoApplyCouponIds=new Set()
 coupon.categories=['Lighting']
 let scopedCoupon=await start('I want shoes','scoped-coupon-shoes')
 assert.ok(scopedCoupon.messages[0].payload.products.every(item=>!item.offerLabel),'a Lighting coupon must not be advertised on shoe recommendations')
 scopedCoupon=await answer(scopedCoupon,[{productId:shoes[0].id,quantity:1}],'products','scoped-coupon-shoes')
 assert.equal(scopedCoupon.messages[0].payload.coupons.length,0,'an out-of-scope cart must not receive the coupon card')
 await answer(scopedCoupon,'cancel','cancel','scoped-coupon-shoes')
 const scopedLamp=await start('I want a lamp','scoped-coupon-lamp')
 assert.ok(scopedLamp.messages[0].payload.products.every(item=>/TEA10/.test(item.offerLabel)),'matching category recommendations should display the coupon')
 await answer(scopedLamp,'cancel','cancel','scoped-coupon-lamp')
 coupon.categories=[]
 let info=await start('How much is Masala Tea?','price-info')
 assert.equal(info.messages[0].type,'product_grid')
 info=await start('Is Masala Tea available?','stock-info')
 assert.equal(info.messages[0].type,'product_grid')
 const cancellation=await start('Cancel order ORD-TEST','cancel-order')
 assert.match(cancellation.answer,/email address or phone number/i)
 const changeOrderRequest=await start('I want to change the order','change-order')
 assert.match(changeOrderRequest.answer,/order reference/i)
 // Start the independent order-commit scenarios from a fresh inventory fixture.
 stock=5;held=0
 let response=await start('Show me your products')
 const searchesAfterGrid=catalogSearches
 assert.equal(response.messages[0].type,'product_grid')
 assert.equal(response.messages[0].payload.products[0].name,'Masala Tea')
 assert.equal(response.messages[0].payload.products[0].price,250)
 const catalogue=response
 response=await answer(response,[{productId:product.id,quantity:2}],'products')
 assert.equal(catalogSearches,searchesAfterGrid,'product selection must reuse the signed flow snapshot')
 assert.equal(held,2)
 assert.match(response.answer,/Masala Tea × 2/)
 response=await answer(response,'checkout')
 assert.equal(catalogSearches,searchesAfterGrid,'cart to checkout must not reload the catalogue')
 assert.equal(response.messages[0].type,'checkout_form')
 response=await answer(response,{name:'Test Customer',phone:'+91 98765 43210',address:'221 Market Road, Pune',pincode:'411001',email:''},'contact')
 assert.equal(response.messages[0].type,'payment_method')
 response=await answer(response,'cash_on_delivery','payment')
 assert.equal(response.messages[0].type,'order_summary')
 assert.equal(placed,1)
 const stale=await answer(catalogue,'confirm')
 assert.equal(placed,1)
 assert.equal(stale.messages[0].type,'order_summary')
 response=await answer(response,'confirm','confirm')
 const orderReceipt=response.messages.find(message=>message.type==='order_confirmation')
 assert.equal(response.messages[0].payload.text,'Your order is confirmed. Here is your receipt.')
 assert.equal(orderReceipt.type,'order_confirmation')
 assert.equal(orderReceipt.payload.reference,'ORD-TEST')
 assert.equal(response.flow,null)
 assert.equal(placed,2)
 assert.equal(stock,3)

 cache.set('booking_bill_discount:client-1:bot-1:restaurant-bill',{bookingId:'booking-1',bookingReference:'BKG-TEST',type:'percentage',value:30,label:'30% off final bill',code:'TABLE30',currency:'INR',customerPhone:'+91 96666 66666'})
 let restaurantBill=await start('I want Masala Tea','restaurant-bill')
 restaurantBill=await answer(restaurantBill,[{productId:product.id,quantity:1}],'products','restaurant-bill')
 assert.equal(restaurantBill.messages[0].payload.discount,75)
 assert.match(restaurantBill.messages[0].payload.discountLabel,/30% off final bill/)
 restaurantBill=await answer(restaurantBill,'checkout','choice','restaurant-bill')
 restaurantBill=await answer(restaurantBill,{name:'Restaurant Guest',phone:'+91 96666 66666',address:'10 Dining Street, Pune',pincode:'411001',email:''},'contact','restaurant-bill')
 assert.equal(restaurantBill.messages[0].type,'payment_method')
 restaurantBill=await answer(restaurantBill,'cash_on_delivery','payment','restaurant-bill')
 assert.equal(restaurantBill.messages[0].payload.rows.some(row=>row[0]==='Reservation discount'&&/75/.test(row[1])),true)
 assert.equal(restaurantBill.messages[0].payload.rows.some(row=>row[0]==='Total'&&/175/.test(row[1])),true)
 restaurantBill=await answer(restaurantBill,'confirm','confirm','restaurant-bill')
 const restaurantReceipt=restaurantBill.messages.find(message=>message.type==='order_confirmation')
 assert.equal(lastOrderInput.booking_id,'booking-1')
 assert.equal(restaurantReceipt.payload.total,175)
 assert.equal(restaurantReceipt.payload.rows.some(row=>row[0]==='Coupon'&&row[1]==='TABLE30'),true)
 assert.equal(cache.has('booking_bill_discount:client-1:bot-1:restaurant-bill'),false)
 assert.equal(placed,3)

 response=await start('I want Masala Tea','natural-order')
 assert.equal(response.messages[0].type,'product_grid')
 response=await answer(response,[{productId:product.id,quantity:1}],'products','natural-order')
 response=await answer(response,'cancel','cancel','natural-order')
 assert.equal(response.flow,null)
 assert.ok(released>0)
 assert.equal(held,0)
 savedContactAddress=true
 base.knownContact={name:'Returning Customer',phone:'+91 98888 88888',email:'returning@example.com'}
 let returning=await start('I want Masala Tea','saved-address-order')
 returning=await answer(returning,[{productId:product.id,quantity:1}],'products','saved-address-order')
 returning=await answer(returning,'checkout','choice','saved-address-order')
 assert.equal(returning.messages[0].type,'saved_address','returning customers should be offered their saved delivery address')
 assert.equal(returning.messages[0].payload.address.city,'Pune')
 returning=await answer(returning,'saved','saved_address','saved-address-order')
 assert.equal(returning.messages[0].type,'payment_method')
 returning=await answer(returning,'cash_on_delivery','payment','saved-address-order')
 assert.ok(returning.messages[0].payload.rows.some(row=>row[0]==='Address'&&/18 Saved Avenue/.test(row[1])))
 returning=await answer(returning,'cancel','cancel','saved-address-order')
 let newAddress=await start('I want Masala Tea','new-address-order')
 newAddress=await answer(newAddress,[{productId:product.id,quantity:1}],'products','new-address-order')
 newAddress=await answer(newAddress,'checkout','choice','new-address-order')
 assert.equal(newAddress.messages[0].type,'saved_address')
 newAddress=await answer(newAddress,'new','saved_address','new-address-order')
 assert.equal(newAddress.messages[0].type,'checkout_form','Add new must open the verified address form')
 newAddress=await answer(newAddress,'cancel','cancel','new-address-order')
 delete base.knownContact
 savedContactAddress=false
 response=await start('Please order 2 masala tea','prefilled-order')
 assert.equal(response.messages[0].type,'product_grid')
 response=await answer(response,[{productId:product.id,quantity:2}],'products','prefilled-order')
 assert.equal(response.messages[0].type,'cart_card')
 assert.match(response.answer,/Masala Tea × 2/)
 response=await answer(response,'cancel','cancel','prefilled-order')
 assert.equal(response.flow,null)
 assert.equal(intent.findMentionedProduct('I want masla tea',[product]).id,product.id)
 console.log('PASS: generic product discovery, category carousel, exact-product quantity UI, multi-item cart path, inventory hold, structured delivery checkout, stale-click safety, atomic order/stock update, invoice and confirmation cards, cancellation release')
}
main().catch(error=>{console.error(error);process.exitCode=1})
