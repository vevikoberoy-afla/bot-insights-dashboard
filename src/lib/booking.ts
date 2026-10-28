import { createHash } from 'crypto'
import { supabase } from '@/lib/supabase'
import { createExternalEvent,externalAvailableStarts,providerAllows,updateExternalEvent } from '@/lib/calendarAdapters'

export const featureTables = { services: 'booking_services', offers: 'booking_offers', bookings: 'feature_bookings', events: 'booking_events', notifications: 'booking_notifications', flows:'booking_flow_sessions' } as const
export function checked<T extends { error: any; data: any }>(result: T): T['data'] {
  if (result.error) throw new Error(result.error.message)
  return result.data
}
const integer = (v: unknown, min: number, max: number, name: string) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be ${min}–${max}`)
  return n
}
export function validateFeature(kind: 'services' | 'offers', input: any) {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 150) throw new Error('Enter a name (up to 150 characters)')
  const base = { name: input.name.trim(), description: String(input.description || '').slice(0, 4000) }
  if (kind === 'services') {
    new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format()
    if (!input.timezone || !input.working_hours || typeof input.working_hours !== 'object') throw new Error('Timezone and working hours are required')
    for (const [day, ranges] of Object.entries(input.working_hours)) {
      if (!/^[0-6]$/.test(day) || !Array.isArray(ranges)) throw new Error('Invalid working hours')
      for (const r of ranges) if (!Array.isArray(r) || r.length !== 2 || !r.every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || r[0] >= r[1]) throw new Error('Working hours need valid opening and closing times')
    }
    const dates = input.blackout_dates || []
    if (!Array.isArray(dates) || dates.some((d: any) => typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)))) throw new Error('Invalid blackout dates')
    if (!Array.isArray(input.reminder_minutes || []) || (input.reminder_minutes || []).length > 10) throw new Error('Maximum ten reminders')
    const configuration=input.configuration&&typeof input.configuration==='object'?input.configuration:{}
    const restaurantInput=configuration.restaurant&&typeof configuration.restaurant==='object'?configuration.restaurant:{},restaurantTables=Array.isArray(restaurantInput.tables)?restaurantInput.tables.slice(0,250).map((v:any)=>({id:String(v.id||crypto.randomUUID()).slice(0,100),name:String(v.name||'').slice(0,80),area:String(v.area||'Main dining').slice(0,100),location_id:String(v.location_id||'').slice(0,100)||null,min_party:integer(v.min_party||1,1,1000,'Minimum party size'),max_party:integer(v.max_party||v.seats||1,1,1000,'Maximum party size'),combine_group:String(v.combine_group||'').slice(0,80)||null,accessible:v.accessible===true,active:v.active!==false})).filter((v:any)=>v.name&&v.max_party>=v.min_party):[],restaurantEnabled=restaurantInput.enabled===true
    const turnTimes=Array.isArray(restaurantInput.turn_times)?restaurantInput.turn_times.slice(0,20).map((v:any)=>({max_party:integer(v.max_party||1,1,1000,'Turn-time party size'),duration_min:integer(v.duration_min||input.duration_min,15,720,'Turn time')})).sort((a:any,b:any)=>a.max_party-b.max_party):[]
    if(restaurantEnabled&&!restaurantTables.some((table:any)=>table.active))throw new Error('Add at least one active restaurant table')
    if(new Set(restaurantTables.map((table:any)=>table.id)).size!==restaurantTables.length)throw new Error('Every restaurant table needs a unique ID')
    const safeConfiguration={
      category:String(configuration.category||'').slice(0,100),
      capacity_mode:['per_seat','per_booking'].includes(configuration.capacity_mode)?configuration.capacity_mode:'per_seat',
      slots_per_interval:integer(configuration.slots_per_interval??input.capacity??1,1,1000,'Bookings per time period'),
      booking_window_days:integer(configuration.booking_window_days??90,1,730,'Maximum advance window'),
      max_bookings_per_day:integer(configuration.max_bookings_per_day??0,0,10000,'Daily booking limit'),
      customer_cancel_enabled:configuration.customer_cancel_enabled!==false,
      customer_reschedule_enabled:configuration.customer_reschedule_enabled!==false,
      cancellation_policy:String(configuration.cancellation_policy||'').slice(0,1000),
      no_show_policy:String(configuration.no_show_policy||'').slice(0,1000),
      availability_overrides:Array.isArray(configuration.availability_overrides)?configuration.availability_overrides.slice(0,366).map((v:any)=>({date:String(v.date||''),closed:v.closed===true,ranges:Array.isArray(v.ranges)?v.ranges.slice(0,8).map((range:any)=>[String(range?.[0]||''),String(range?.[1]||'')]):[]})).filter((v:any)=>/^\d{4}-\d{2}-\d{2}$/.test(v.date)&&Number.isFinite(Date.parse(v.date))&&v.ranges.every((range:any)=>range.length===2&&range.every((time:any)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(time))&&range[0]<range[1])):[],
      staff:Array.isArray(configuration.staff)?configuration.staff.slice(0,100).map((v:any)=>({id:String(v.id||crypto.randomUUID()).slice(0,100),name:String(v.name||'').slice(0,150),photo_url:String(v.photo_url||'').slice(0,1000),active:v.active!==false,working_hours:v.working_hours&&typeof v.working_hours==='object'?v.working_hours:null})).filter((v:any)=>v.name):[],
      locations:Array.isArray(configuration.locations)?configuration.locations.slice(0,50).map((v:any)=>({id:String(v.id||crypto.randomUUID()).slice(0,100),name:String(v.name||'').slice(0,150),address:String(v.address||'').slice(0,500)})).filter((v:any)=>v.name):[],
      addons:Array.isArray(configuration.addons)?configuration.addons.slice(0,50).map((v:any)=>{const kind=v.kind==='product'?'product':'service',durationUnit=v.duration_unit==='hours'?'hours':'minutes',durationMin=integer(v.duration_min||0,0,480,'Add-on duration'),quantity=integer(v.quantity||1,1,1000,'Add-on quantity');return{id:String(v.id||crypto.randomUUID()).slice(0,100),name:String(v.name||'').slice(0,150),kind,product_id:kind==='product'?String(v.product_id||'').slice(0,100)||null:null,duration_unit:durationUnit,duration_value:Number(v.duration_value??(durationUnit==='hours'?durationMin/60:durationMin)),duration_min:durationMin,quantity,price:Math.max(0,Number(v.price||0))}}).filter((v:any)=>v.name):[],
      questions:Array.isArray(configuration.questions)?configuration.questions.slice(0,30).map((v:any)=>({id:String(v.id||crypto.randomUUID()).slice(0,100),label:String(v.label||'').slice(0,250),type:['text','textarea','select','checkbox'].includes(v.type)?v.type:'text',required:v.required===true,options:Array.isArray(v.options)?v.options.slice(0,30).map((x:any)=>String(x).slice(0,150)):[]})).filter((v:any)=>v.label):[],
      recurring_enabled:configuration.recurring_enabled===true,
      payment_mode:['offline','deposit','full'].includes(configuration.payment_mode)?configuration.payment_mode:'offline',
      deposit_required:configuration.payment_mode==='deposit'||configuration.deposit_required===true,
      deposit_amount:Math.max(0,Number(configuration.deposit_amount||0)),
      restaurant:{enabled:restaurantEnabled,slot_interval_min:integer(restaurantInput.slot_interval_min||input.duration_min,5,240,'Slot interval'),max_combined_tables:integer(restaurantInput.max_combined_tables||2,1,8,'Maximum combined tables'),auto_assign:true,turn_times:turnTimes,tables:restaurantTables},
    }
    for(const override of safeConfiguration.availability_overrides){
      const day=String(new Date(`${override.date}T12:00:00Z`).getUTCDay()),normalRanges=input.working_hours[day]||[]
      if(!override.closed&&override.ranges.some((range:any)=>!normalRanges.some((normal:any)=>range[0]>=normal[0]&&range[1]<=normal[1])))throw new Error('Date-specific hours must stay within the normal hours for that weekday')
    }
    const price=input.price===''||input.price==null?null:Number(input.price)
    if(price!=null&&(!Number.isFinite(price)||price<0||price>100000000))throw new Error('Invalid service price')
    const configuredCapacity=restaurantEnabled&&restaurantTables.length?restaurantTables.reduce((sum:number,table:any)=>sum+table.max_party,0):integer(input.capacity,1,1000,'Capacity')
    return { ...base, timezone: input.timezone, duration_min: integer(input.duration_min,5,480,'Duration'), buffer_min: integer(input.buffer_min,0,240,'Buffer'), capacity: Math.min(1000,configuredCapacity), notice_hours: integer(input.notice_hours,0,720,'Notice'), cancellation_hours: integer(input.cancellation_hours,0,720,'Change deadline'), working_hours: input.working_hours, blackout_dates: dates, is_active: input.is_active === true, confirmation_email: input.confirmation_email === true, confirmation_whatsapp: input.confirmation_whatsapp === true, reminder_whatsapp: input.reminder_whatsapp === true, reminder_minutes: Array.from(new Set((input.reminder_minutes || []).map((v: unknown) => integer(v,1,43200,'Reminder')))), integration_id: input.integration_id || null, external_calendar_id: String(input.external_calendar_id || '').slice(0,500) || null, external_event_type_id: String(input.external_event_type_id || '').slice(0,1000) || null, price, currency:/^[A-Z]{3}$/.test(input.currency)?input.currency:'INR', configuration:safeConfiguration }
  }
  if (!['draft','active','paused','ended'].includes(input.status)) throw new Error('Invalid offer status')
  if (!Number.isFinite(Date.parse(input.start_at)) || !Number.isFinite(Date.parse(input.end_at)) || Date.parse(input.start_at)>=Date.parse(input.end_at)) throw new Error('Enter a valid offer date range')
  return { ...base, quantity: integer(input.quantity,0,10000000,'Stock'), max_per_customer: integer(input.max_per_customer,1,1000,'Customer limit'), displayed_claimed_override: input.displayed_claimed_override === null || input.displayed_claimed_override === '' || input.displayed_claimed_override === undefined ? null : integer(input.displayed_claimed_override,0,10000000,'Displayed claims'), price: input.price === '' || input.price == null ? null : integer(input.price * 100,0,1000000000,'Price')/100, currency: /^[A-Z]{3}$/.test(input.currency) ? input.currency : 'INR', service_id: input.service_id || null, product_id: input.product_id || null, segment_rule: input.segment_rule && typeof input.segment_rule==='object' ? input.segment_rule : {}, copy_variants: Array.isArray(input.copy_variants) ? input.copy_variants.slice(0,10).map((v:any)=>String(v).slice(0,500)) : [], waitlist_enabled: input.waitlist_enabled === true, start_at: new Date(input.start_at).toISOString(), end_at: new Date(input.end_at).toISOString(), status: input.status }
}
type RestaurantTable={id:string;name:string;area:string;location_id?:string|null;min_party:number;max_party:number;combine_group?:string|null;active:boolean}
export function restaurantDuration(service:any,quantity:number){const rules=service.configuration?.restaurant?.turn_times||[];return Number(rules.find((rule:any)=>quantity<=Number(rule.max_party))?.duration_min||service.duration_min)}
export function selectRestaurantTables(tables:RestaurantTable[],quantity:number,maxCombined:number){const single=tables.filter(table=>quantity>=table.min_party&&quantity<=table.max_party).sort((a,b)=>(a.max_party-quantity)-(b.max_party-quantity))[0];if(single)return[single];const groups=new Map<string,RestaurantTable[]>();for(const table of tables)if(table.combine_group){const group=groups.get(table.combine_group)||[];group.push(table);groups.set(table.combine_group,group)}let best:RestaurantTable[]|null=null;for(const group of Array.from(groups.values())){const picked:RestaurantTable[]=[];let seats=0;for(const table of [...group].sort((a,b)=>b.max_party-a.max_party)){if(picked.length>=maxCombined)break;picked.push(table);seats+=table.max_party;if(seats>=quantity)break}if(seats>=quantity&&(!best||picked.reduce((n,t)=>n+t.max_party,0)<best.reduce((n,t)=>n+t.max_party,0)))best=picked}return best||[]}
type BookingOccupancy={bookings:any[];table_assignments:any[]}
let rangeOccupancyRpcAvailable:boolean|undefined
function validateBookingDate(date:string){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) throw new Error('Invalid date')
  if (Date.parse(date)<Date.now()-86400000 || Date.parse(date)>Date.now()+730*86400000) throw new Error('Choose a date within the supported booking window')
}
async function loadBookingRangeOccupancy(clientId:string,service:any,dates:string[]):Promise<BookingOccupancy>{
 const first=dates[0],last=dates[dates.length-1],windowStart=new Date(Date.parse(`${first}T00:00:00Z`)-14*3600000).toISOString(),windowEnd=new Date(Date.parse(`${last}T00:00:00Z`)+62*3600000).toISOString()
 if(rangeOccupancyRpcAvailable!==false){
  const result=await supabase.rpc('get_booking_range_occupancy',{p_client_id:clientId,p_service_id:service.id,p_window_start:windowStart,p_window_end:windowEnd})
  if(!result.error&&result.data){rangeOccupancyRpcAvailable=true;return{bookings:result.data.bookings||[],table_assignments:result.data.table_assignments||[]}}
  if(!['42883','PGRST202'].includes(result.error?.code||'')&&!/get_booking_range_occupancy|schema cache|does not exist/i.test(result.error?.message||''))throw new Error(result.error?.message||'Availability could not be loaded')
  rangeOccupancyRpcAvailable=false
 }
 const restaurantMode=service.configuration?.restaurant?.enabled===true
 const [bookingsResult,assignmentsResult]=await Promise.all([
  supabase.from('feature_bookings').select('slot_start,slot_end,quantity').eq('client_id',clientId).eq('service_id',service.id).eq('status','confirmed').lt('slot_start',windowEnd).gt('slot_end',windowStart),
  restaurantMode?supabase.from('booking_table_assignments').select('table_id,occupied_start,occupied_end').eq('client_id',clientId).eq('service_id',service.id).is('released_at',null).lt('occupied_start',windowEnd).gt('occupied_end',windowStart):Promise.resolve({data:[],error:null}),
 ])
 if(bookingsResult.error)throw new Error(bookingsResult.error.message)
 if(assignmentsResult.error)throw new Error(/does not exist|schema cache/i.test(assignmentsResult.error.message)?'Restaurant table storage is not installed. Apply supabase/065_restaurant_table_inventory.sql.':assignmentsResult.error.message)
 return{bookings:bookingsResult.data||[],table_assignments:assignmentsResult.data||[]}
}
function computeBookingSlots(service:any,date:string,quantity:number,locationId:string|undefined,occupancy:BookingOccupancy,external:any){
  const configuration=service.configuration||{},override=(configuration.availability_overrides||[]).find((item:any)=>item.date===date)
  if (!service.is_active || service.blackout_dates.includes(date) || override?.closed) return []
  const dateFormatter=new Intl.DateTimeFormat('en',{timeZone:service.timezone,year:'numeric',month:'2-digit',day:'2-digit'}),dateKey=(value:Date)=>{const parts=Object.fromEntries(dateFormatter.formatToParts(value).map(part=>[part.type,part.value]));return`${parts.year}-${parts.month}-${parts.day}`},today=dateKey(new Date()),windowDays=Math.max(1,Number(configuration.booking_window_days||90)),lastDate=new Date(`${today}T12:00:00Z`);lastDate.setUTCDate(lastDate.getUTCDate()+windowDays)
  if(date>lastDate.toISOString().slice(0,10))return[]
  const day = new Date(date+'T12:00:00Z').getUTCDay()
  const ranges = override?.ranges?.length?override.ranges:(service.working_hours[String(day)] || [])
  const floor = Date.parse(date+'T00:00:00Z')-14*3600000
  const restaurant=service.configuration?.restaurant||{},restaurantMode=restaurant.enabled===true
  const tables:RestaurantTable[]=restaurantMode?(restaurant.tables||[]).filter((table:any)=>table.active!==false&&(!locationId||!table.location_id||table.location_id===locationId)):[]
  const allBookings=occupancy.bookings||[],bookings=restaurantMode?[]:allBookings,assignments=restaurantMode?occupancy.table_assignments:[]
  const dailyBookings=allBookings.filter((booking:any)=>dateKey(new Date(booking.slot_start))===date).length,maxDaily=Math.max(0,Number(configuration.max_bookings_per_day||0))
  if(maxDaily&&dailyBookings>=maxDaily)return[]
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: service.timezone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' })
  const slots: Array<{value:string;label:string;availableTables?:number;availableSeats?:number;tableNames?:string[]}> = []
  // Iterate UTC instants so DST gaps disappear and repeated hours retain distinct identities.
  for (let t=floor; t<floor+52*3600000; t+=60000) {
    if(t<Date.now()+service.notice_hours*3600000) continue
    const parts=Object.fromEntries(format.formatToParts(t).map(p=>[p.type,p.value]))
    if (`${parts.year}-${parts.month}-${parts.day}`!==date) continue
    const minute=Number(parts.hour)*60+Number(parts.minute)
    const duration=restaurantMode?restaurantDuration(service,quantity):service.duration_min,interval=restaurantMode?Number(restaurant.slot_interval_min||30):service.duration_min+service.buffer_min
    const allowed=ranges.some((r:string[])=> { const a=r[0].split(':').map(Number), b=r[1].split(':').map(Number); return minute>=a[0]*60+a[1] && minute+duration<=b[0]*60+b[1] && (minute-a[0]*60-a[1])%interval===0 })
    if(!allowed) continue
    const end=t+duration*60000
    const overlapping=(bookings || []).filter((b:any)=>Date.parse(b.slot_start)<end+service.buffer_min*60000 && Date.parse(b.slot_end)+service.buffer_min*60000>t),used=overlapping.reduce((sum:number,b:any)=>sum+b.quantity,0),bookingCount=overlapping.length,slotsPerInterval=Math.max(1,Number(service.configuration?.slots_per_interval||service.capacity||1))
    const freeTables=restaurantMode?tables.filter(table=>!assignments.some(assignment=>assignment.table_id===table.id&&Date.parse(assignment.occupied_start)<end+service.buffer_min*60000&&Date.parse(assignment.occupied_end)>t-service.buffer_min*60000)):[],allocation=restaurantMode?selectRestaurantTables(freeTables,quantity,Number(restaurant.max_combined_tables||2)):[]
    if((restaurantMode?allocation.length>0:used+quantity<=service.capacity&&bookingCount<slotsPerInterval)&&providerAllows(new Date(t).toISOString(),new Date(end).toISOString(),external)) slots.push({value:new Date(t).toISOString(),label:new Intl.DateTimeFormat('en',{timeZone:service.timezone,hour:'numeric',minute:'2-digit'}).format(t),...(restaurantMode?{availableTables:freeTables.length,availableSeats:freeTables.reduce((sum,table)=>sum+table.max_party,0),tableNames:allocation.map(table=>table.name)}:{})})
  }
  return slots
}
export async function bookingSlotsRange(clientId:string,service:any,dates:string[],quantity=1,locationId?:string){
 const unique=Array.from(new Set(dates));if(!unique.length)return{}
 unique.forEach(validateBookingDate)
 const occupancy=await loadBookingRangeOccupancy(clientId,service,unique)
 const external=await Promise.all(unique.map(date=>externalAvailableStarts(service,date)))
 return Object.fromEntries(unique.map((date,index)=>[date,computeBookingSlots(service,date,quantity,locationId,occupancy,external[index])]))
}
export async function bookingSlots(clientId: string, serviceId: string, date: string, quantity = 1, locationId?:string) {
 validateBookingDate(date)
 const service = checked(await supabase.from('booking_services').select('*').eq('client_id',clientId).eq('id',serviceId).single())
 return (await bookingSlotsRange(clientId,service,[date],quantity,locationId))[date]||[]
}
export async function reserveBooking(clientId:string, input:any) {
  if(!input.service_id && !input.offer_id) throw new Error('Select a service or an offer')
  if(typeof input.customer_name!=='string' || !input.customer_name.trim() || input.customer_name.length>150) throw new Error('Customer name is required')
  const email=typeof input.customer_email==='string'?input.customer_email.trim().toLowerCase():''
  const phone=typeof input.customer_phone==='string'?input.customer_phone.trim():''
  if(!email&&!phone) throw new Error('A phone number or email address is required')
  if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)) throw new Error('Enter a valid email address')
  if(phone&&!/^\+?[0-9\s()-]{7,20}$/.test(phone)) throw new Error('Enter a valid phone number')
  if(typeof input.idempotency_key!=='string' || !input.idempotency_key || input.idempotency_key.length>200) throw new Error('Missing booking attempt ID')
  integer(input.quantity,1,1000,'Quantity')
  const service=input.service_id?checked(await supabase.from('booking_services').select('*').eq('client_id',clientId).eq('id',input.service_id).single()):null,restaurantMode=service?.configuration?.restaurant?.enabled===true
  const payload={...input,restaurant_mode:restaurantMode,customer_email:email||null,customer_phone:phone||null,details:{...(input.details||{}),location_id:input.location_id||input.details?.location_id||null}}
  let reservationResult:any
  if(input.session_id){
   const requestHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex')
   reservationResult=await supabase.rpc('commit_chat_booking',{p_client:clientId,p_session:String(input.session_id),p_operation:input.idempotency_key,p_request_hash:requestHash,p_input:payload})
   if(reservationResult.error&&/commit_chat_booking|schema cache|does not exist/i.test(reservationResult.error.message||'')){
    console.warn('[booking] atomic commit unavailable; apply supabase/091_atomic_chat_commits.sql')
    reservationResult=await supabase.rpc(restaurantMode?'reserve_restaurant_booking':'reserve_feature_booking',{p_client:clientId,p_input:payload})
   }
  }else reservationResult=await supabase.rpc(restaurantMode?'reserve_restaurant_booking':'reserve_feature_booking',{p_client:clientId,p_input:payload})
  if(reservationResult.error&&restaurantMode&&/does not exist|schema cache/i.test(reservationResult.error.message||''))throw new Error('Restaurant table storage is not installed. Apply supabase/065_restaurant_table_inventory.sql.')
  // Compatibility for workspaces that have not yet applied migration 058. The
  // legacy atomic function requires a non-null email even when phone is valid.
  if(reservationResult.error&&!restaurantMode&&!email&&phone&&/Invalid customer or quantity/i.test(reservationResult.error.message||'')){
   const phoneIdentity=`phone-${phone.replace(/\D/g,'')}@booking.invalid`
   reservationResult=await supabase.rpc('reserve_feature_booking',{p_client:clientId,p_input:{...input,customer_email:phoneIdentity,customer_phone:phone}})
  }
  let booking=checked(reservationResult)
  if(booking?._atomic_commit&&booking?.id){
   const fresh=await supabase.from('feature_bookings').select('*').eq('client_id',clientId).eq('id',booking.id).maybeSingle()
   if(!fresh.error&&fresh.data)booking={...fresh.data,_atomic_commit:true}
  }
  if(booking.service_id&&booking.status==='confirmed'){
   const bookingService=service||checked(await supabase.from('booking_services').select('*').eq('client_id',clientId).eq('id',booking.service_id).single())
   try{const external=await createExternalEvent(bookingService,booking);if(external){await supabase.from('feature_bookings').update({external_event_id:external.id,external_manage_url:external.url}).eq('id',booking.id);booking.external_event_id=external.id;booking.external_manage_url=external.url}}
   catch(error){await supabase.rpc('change_feature_booking',{p_client:clientId,p_id:booking.id,p_status:'cancelled',p_start:null});throw error}
  }
  return booking
}
export async function changeBooking(clientId:string,id:string,status:string,start?:string) {
  const booking=checked(await supabase.from('feature_bookings').select('*').eq('client_id',clientId).eq('id',id).single())
  const service=booking.service_id?checked(await supabase.from('booking_services').select('*').eq('client_id',clientId).eq('id',booking.service_id).single()):null
  if(service&&booking.external_event_id&&(start||status==='cancelled'))await updateExternalEvent(service,booking,start?'reschedule':'cancel',start,start?new Date(Date.parse(start)+restaurantDuration(service,booking.quantity)*60000).toISOString():undefined)
  if(start&&service?.configuration?.restaurant?.enabled===true){const result=await supabase.rpc('reschedule_restaurant_booking',{p_client:clientId,p_id:id,p_start:start});if(result.error&&/does not exist|schema cache/i.test(result.error.message||''))throw new Error('Restaurant table storage is not installed. Apply supabase/065_restaurant_table_inventory.sql.');return checked(result)}
  return checked(await supabase.rpc('change_feature_booking',{p_client:clientId,p_id:id,p_status:status,p_start:start || null}))
}
