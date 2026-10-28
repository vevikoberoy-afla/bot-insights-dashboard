/** Shared display and validation metadata. Database plan versions are authoritative. */
export const FEATURES = {
  'bots.enabled': 'AI bots', 'commerce.enabled': 'Product catalogue & new orders',
  'booking.enabled': 'Appointments & reservations', 'restaurant.enabled': 'Restaurant table allocation',
  'support.enabled': 'Customer support & returns', 'knowledge.enabled': 'Knowledge bases',
  'sources.enabled': 'Connected databases', 'email.enabled': 'Email bots',
  'knowledge.crawl.discovery': 'Website page discovery & selection',
  'knowledge.crawl.autonomous': 'Automatic website crawling',
  'campaigns.enabled': 'Marketing campaigns', 'offers.targeted.enabled': 'Targeted offers',
  'contacts.messaging.enabled': 'Direct customer messaging',
  'analytics.enabled': 'Analytics', 'api.enabled': 'API access',
} as const
export const LIMITS = {
  'bots.active': 'Active bots', 'bots.retained': 'Stored bots', 'members.seats': 'Team seats',
  'storefronts.total': 'Stores per workspace',
  'products.active': 'Active products', 'products.retained': 'Stored products',
  'services.active': 'Booking services', 'restaurant.tables.active': 'Restaurant tables',
  'offers.active': 'Offers', 'contacts.stored': 'Contacts', 'sources.active': 'Data sources',
  'knowledge.datasets': 'Knowledge datasets', 'channels.active': 'Channel connections',
  'knowledge.crawl.pages.monthly': 'Website pages / billing cycle',
  'knowledge.crawl.maps.monthly': 'Website discoveries / billing cycle',
  'knowledge.crawl.pages_per_job': 'Website pages per import',
  'knowledge.crawl.max_depth': 'Website crawl depth',
  'knowledge.documents.max_file_mb': 'Knowledge document size limit (MB)',
  'channels.mailboxes': 'Email mailboxes', 'ai.credits.monthly': 'AI answers / month',
  'email.transactional.monthly': 'Transactional emails / month',
  'email.marketing.monthly': 'Marketing emails / month', 'email.outbound.daily': 'Emails / day',
} as const
export const STAFF_ROLES = ['platform_owner','operations_admin','support_specialist','billing_specialist','security_operator','readonly_analyst'] as const
export const MEMBER_ROLES = ['owner','workspace_admin','agent','booking_commerce_operator','analyst','billing_manager'] as const
export const ACCESS_LEVELS = ['none','read','write'] as const
export type AccessLevel = typeof ACCESS_LEVELS[number]
export type MemberPermissions = Record<string,AccessLevel>
export const ACCESS_MODULES = [
  {key:'overview',label:'Overview',group:'Workspace'},
  {key:'inbox',label:'Live inbox',group:'Customer operations'},
  {key:'bookings',label:'Bookings & reservations',group:'Bookings'},
  {key:'services',label:'Services & availability',group:'Bookings'},
  {key:'offers',label:'Offers & discounts',group:'Bookings'},
  {key:'booking_analytics',label:'Booking analytics',group:'Bookings'},
  {key:'products',label:'Product catalogue',group:'Commerce'},
  {key:'orders',label:'Customer orders',group:'Commerce'},
  {key:'inventory',label:'Inventory',group:'Commerce'},
  {key:'bots',label:'Bots & channels',group:'Automation'},
  {key:'campaigns',label:'Campaigns',group:'Automation'},
  {key:'tickets',label:'Support tickets',group:'Customer operations'},
  {key:'contacts',label:'Contacts & segments',group:'Customer operations'},
  {key:'knowledge',label:'Knowledge base',group:'Content & data'},
  {key:'sources',label:'Connected databases',group:'Content & data'},
  {key:'analytics',label:'Customer analytics',group:'Reporting'},
  {key:'templates',label:'Templates & content',group:'Content & data'},
  {key:'settings',label:'Workspace settings',group:'Administration'},
  {key:'team',label:'Team & access',group:'Administration'},
  {key:'billing',label:'Billing & plan',group:'Administration'},
  {key:'usage',label:'Usage',group:'Administration'},
] as const
export const ACCESS_MODULE_KEYS = ACCESS_MODULES.map(module=>module.key)
export const STATES = ['active','restricted','suspended'] as const
export const ACCESS_STATES = ['trialing','active','past_due_grace','unpaid_restricted','canceled','paused'] as const
export function validValues(features: unknown, limits: unknown) {
  if (!features || !limits || typeof features !== 'object' || typeof limits !== 'object' || Array.isArray(features) || Array.isArray(limits)) return false
  const f = features as Record<string, unknown>, l = limits as Record<string, unknown>
  return Object.keys(f).every(k => k in FEATURES) && Object.keys(l).every(k => k in LIMITS)
    && Object.keys(FEATURES).every(k => typeof f[k] === 'boolean')
    && Object.keys(LIMITS).every(k => Number.isSafeInteger(l[k]) && Number(l[k]) >= 0)
    && Number(l['knowledge.documents.max_file_mb']) <= 20
}
export function staffCan(role: string, permission: string) {
  if (role === 'platform_owner') return true
  const grants: Record<string, string[]> = {
    operations_admin: ['read','workspaces','overrides','cases','releases','members','deliveries','notes','profile','resources','broadcasts'],
    support_specialist: ['read','cases','notes'], billing_specialist: ['read','subscriptions','cases'],
    security_operator: ['read','workspaces','releases','identities'], readonly_analyst: ['read'],
  }
  return grants[role]?.includes(permission) === true
}
const AREA_ALIASES:Record<string,string[]>={
  features:['bookings','services','offers','booking_analytics'],
  commerce:['products','orders','inventory'],
  account:['overview'],
}
export function rolePermissions(role:string):MemberPermissions{
  const read:Record<string,string[]>={
    agent:['overview','bots','inbox','tickets','contacts','products','orders','inventory','bookings','services','offers','knowledge'],
    booking_commerce_operator:['overview','bots','products','orders','inventory','bookings','services','offers','contacts'],
    analyst:['overview','analytics','booking_analytics','bookings','products','orders','inventory','usage'],
    billing_manager:['overview','billing','usage'],
  }
  const write:Record<string,string[]>={
    agent:['inbox','tickets','contacts'],
    booking_commerce_operator:['products','orders','inventory','bookings','services','offers'],
    billing_manager:['billing'],
  }
  return Object.fromEntries(ACCESS_MODULE_KEYS.map(key=>[key,write[role]?.includes(key)?'write':read[role]?.includes(key)?'read':'none'])) as MemberPermissions
}
export function memberCan(role: string, area: string, write: boolean, permissions?:Record<string,unknown>|null) {
  if (role === 'owner' || role === 'workspace_admin') return true
  const defaults=rolePermissions(role),keys=AREA_ALIASES[area]||[area]
  return keys.some(key=>{
    const configured=permissions && typeof permissions[key]==='string'?permissions[key]:undefined
    const level=(configured||defaults[key]||'none') as AccessLevel
    return write?level==='write':level==='read'||level==='write'
  })
}

export function dashboardArea(pathname:string){
  if(pathname==='/overview')return'overview'
  if(pathname==='/features')return'overview'
  if(pathname.startsWith('/features/stores/'))return'overview'
  if(pathname.startsWith('/features/store-settings'))return'settings'
  if(pathname.startsWith('/inbox'))return'inbox'
  if(pathname.startsWith('/features/bookings'))return'bookings'
  if(pathname.startsWith('/features/services'))return'services'
  if(pathname.startsWith('/features/offers'))return'offers'
  if(pathname.startsWith('/features/analytics'))return'booking_analytics'
  if(pathname.startsWith('/features/commerce/catalogue'))return'products'
  if(pathname.startsWith('/features/commerce/orders'))return'orders'
  if(pathname.startsWith('/features/commerce/inventory'))return'inventory'
  if(pathname.startsWith('/features/payments'))return'orders'
  if(pathname.startsWith('/features'))return'bookings'
  if(pathname.startsWith('/campaigns'))return'campaigns'
  if(pathname.startsWith('/bots'))return'bots'
  if(pathname.startsWith('/analytics'))return'analytics'
  if(pathname.startsWith('/contacts'))return'contacts'
  if(pathname.startsWith('/tickets'))return'tickets'
  if(pathname.startsWith('/knowledge'))return'knowledge'
  if(pathname.startsWith('/databases'))return'sources'
  if(pathname.startsWith('/templates')||pathname.startsWith('/notepad'))return'templates'
  if(pathname.startsWith('/settings/team'))return'team'
  if(pathname.startsWith('/settings/billing'))return'billing'
  if(pathname.startsWith('/settings/usage'))return'usage'
  if(pathname.startsWith('/settings')||pathname.startsWith('/webhooks'))return'settings'
  return'overview'
}
