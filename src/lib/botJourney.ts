export type BotJourneyNodeType =
  | 'start'
  | 'verify_phone'
  | 'verify_order'
  | 'support'
  | 'knowledge'
  | 'commerce'
  | 'booking'
  | 'handoff'
  | 'end'

export type BotJourneyNode = {
  id: string
  type: BotJourneyNodeType
  label: string
  enabled?: boolean
  position: { x: number; y: number }
  config?: {
    message?: string
    successMessage?: string
    invalidMessage?: string
    fallbackMessage?: string
    maxAttempts?: number
    timeoutSeconds?: number
    confidenceThreshold?: number
    intentKeywords?: string[]
    queue?: string
    collectName?: boolean
    collectEmail?: boolean
    collectPhone?: boolean
    allowCancel?: boolean
    autoCreateTicket?: boolean
  }
}

export type BotJourneyEdge = {
  id: string
  source: string
  target: string
  label?: string
  condition?: 'always' | 'success' | 'failure' | 'intent' | 'fallback'
  conditionValue?: string
}

export type BotJourney = {
  version: 1
  type: string
  mode: 'support_only' | 'custom'
  startNodeId: string
  nodes: BotJourneyNode[]
  edges: BotJourneyEdge[]
  [key: string]: unknown
}

export type BotJourneyPolicy = {
  configured: boolean
  supportOnly: boolean
  requirePhone: boolean
  requireOrder: boolean
  allowSupport: boolean
  allowKnowledge: boolean
  allowCommerce: boolean
  allowBooking: boolean
  allowHandoff: boolean
  nodeMessages: Partial<Record<BotJourneyNodeType, string>>
  nodeConfigs: Partial<Record<BotJourneyNodeType, BotJourneyNode['config']>>
}

const TYPES = new Set<BotJourneyNodeType>([
  'start', 'verify_phone', 'verify_order', 'support', 'knowledge',
  'commerce', 'booking', 'handoff', 'end',
])

export function journeyPolicyFromFlow(flow: any): BotJourneyPolicy {
  const rawNodes = Array.isArray(flow?.nodes) ? flow.nodes.filter((node: any) => node?.enabled !== false) : []
  const configured = flow?.version === 1 && rawNodes.length > 0
  // Only enabled nodes reachable from Start affect live routing. This makes
  // canvas connections operational and prevents a disconnected palette node
  // from accidentally enabling a customer-facing capability.
  const byId = new Map(rawNodes.map((node: any) => [node.id, node]))
  const reachable = new Set<string>()
  const queue = configured && byId.has(flow.startNodeId) ? [flow.startNodeId] : []
  while (queue.length) {
    const id = queue.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    for (const edge of Array.isArray(flow?.edges) ? flow.edges : []) if (edge?.source === id && byId.has(edge.target)) queue.push(edge.target)
  }
  const activeNodes = configured ? rawNodes.filter((node: any) => reachable.has(node.id)) : rawNodes
  const nodes = activeNodes.map((node: any) => node.type)
  const supportOnly = flow?.type === 'support' || flow?.mode === 'support_only'
  const nodeMessages = Object.fromEntries(
    activeNodes
      .filter((node: any) => TYPES.has(node?.type) && typeof node?.config?.message === 'string' && node.config.message.trim())
      .map((node: any) => [node.type, node.config.message.trim().slice(0, 500)]),
  ) as Partial<Record<BotJourneyNodeType, string>>
  const nodeConfigs = Object.fromEntries(activeNodes.filter((node:any)=>TYPES.has(node?.type)).map((node:any)=>[node.type,node.config||{}])) as Partial<Record<BotJourneyNodeType,BotJourneyNode['config']>>
  // Legacy bot_flow records predate the journey graph. Preserve their broad
  // capabilities, except for the established support-only type.
  const has = (type: BotJourneyNodeType, legacyDefault = true) => configured ? nodes.includes(type) : legacyDefault
  return {
    configured,
    supportOnly,
    requirePhone: supportOnly && (has('verify_phone', true) || has('verify_order', true)),
    requireOrder: supportOnly && has('verify_order', true),
    allowSupport: supportOnly || has('support'),
    allowKnowledge: has('knowledge'),
    allowCommerce: !supportOnly && has('commerce'),
    allowBooking: !supportOnly && has('booking'),
    allowHandoff: has('handoff'),
    nodeMessages,
    nodeConfigs,
  }
}

export function validateBotJourney(value: any): { journey?: BotJourney; errors: string[] } {
  const errors: string[] = []
  if (!value || value.version !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return { errors: ['Journey must contain version 1 nodes and edges.'] }
  }
  if (value.nodes.length < 2 || value.nodes.length > 40) errors.push('A journey must contain between 2 and 40 nodes.')
  if (value.edges.length > 80) errors.push('A journey cannot contain more than 80 connections.')
  const ids = new Set<string>()
  for (const node of value.nodes) {
    if (!node || typeof node.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(node.id)) errors.push('Every node needs a safe unique ID.')
    if (ids.has(node?.id)) errors.push(`Duplicate node ID: ${node.id}`)
    ids.add(node?.id)
    if (!TYPES.has(node?.type)) errors.push(`Unsupported node type: ${String(node?.type)}`)
    if (typeof node?.label !== 'string' || !node.label.trim() || node.label.length > 80) errors.push(`Node ${node?.id || ''} needs a label of 1–80 characters.`)
    if (!Number.isFinite(node?.position?.x) || !Number.isFinite(node?.position?.y)) errors.push(`Node ${node?.id || ''} needs a valid canvas position.`)
    for (const key of ['message','successMessage','invalidMessage','fallbackMessage']) if (node?.config?.[key] && String(node.config[key]).length > 500) errors.push(`Node ${node.id} ${key} is too long.`)
  }
  if (!ids.has(value.startNodeId)) errors.push('The selected start node does not exist.')
  if (!value.nodes.some((node: any) => node.type === 'start')) errors.push('A journey needs a Start node.')
  for (const edge of value.edges) {
    if (!edge || typeof edge.id !== 'string' || !ids.has(edge.source) || !ids.has(edge.target)) errors.push('Every connection must point to existing nodes.')
    if (edge?.source === edge?.target) errors.push('A node cannot connect to itself.')
  }
  if (errors.length) return { errors: [...new Set(errors)] }
  return {
    journey: {
      ...value,
      version: 1,
      type: value.mode === 'support_only' ? 'support' : (String(value.type || 'custom').slice(0, 40)),
      mode: value.mode === 'support_only' ? 'support_only' : 'custom',
      nodes: value.nodes.map((node: any) => ({
        id: node.id,
        type: node.type,
        label: node.label.trim(),
        enabled: node.enabled !== false,
        position: { x: Math.max(0, Math.min(4000, node.position.x)), y: Math.max(0, Math.min(4000, node.position.y)) },
        config: {
          ...Object.fromEntries(['message','successMessage','invalidMessage','fallbackMessage','queue'].filter(key => node.config?.[key]).map(key => [key, String(node.config[key]).trim().slice(0, key === 'queue' ? 80 : 500)])),
          maxAttempts: Math.max(1, Math.min(10, Number(node.config?.maxAttempts) || 3)),
          timeoutSeconds: Math.max(5, Math.min(86400, Number(node.config?.timeoutSeconds) || 300)),
          confidenceThreshold: Math.max(0, Math.min(1, Number(node.config?.confidenceThreshold) || 0.65)),
          intentKeywords: Array.isArray(node.config?.intentKeywords) ? node.config.intentKeywords.map((item:any)=>String(item).trim().slice(0,60)).filter(Boolean).slice(0,30) : [],
          collectName: node.config?.collectName === true,
          collectEmail: node.config?.collectEmail === true,
          collectPhone: node.config?.collectPhone === true,
          allowCancel: node.config?.allowCancel !== false,
          autoCreateTicket: node.config?.autoCreateTicket === true,
        },
      })),
      edges: value.edges.map((edge: any) => ({ id: edge.id, source: edge.source, target: edge.target, label: String(edge.label || '').slice(0, 60), condition: ['always','success','failure','intent','fallback'].includes(edge.condition) ? edge.condition : 'always', conditionValue: String(edge.conditionValue || '').slice(0, 120) })),
    },
    errors: [],
  }
}

const node = (id: string, type: BotJourneyNodeType, label: string, x: number, y: number): BotJourneyNode => ({ id, type, label, enabled: true, position: { x, y }, config: {} })
const edge = (source: string, target: string, label = ''): BotJourneyEdge => ({ id: `${source}-${target}`, source, target, label })

export type BotJourneyTemplateKey = 'support'|'returns'|'tracking'|'commerce'|'booking'|'knowledge'|'lead_handoff'|'full'
export const BOT_JOURNEY_TEMPLATES:Array<{key:BotJourneyTemplateKey;name:string;description:string;category:string}>=[
 {key:'support',name:'Verified customer support',description:'Verify phone and order before support, RAG, tickets or handoff.',category:'Support'},
 {key:'returns',name:'Returns & refunds',description:'A focused verified flow for returns, refunds and exchanges.',category:'Support'},
 {key:'tracking',name:'Order status & tracking',description:'Verify ownership before showing order and delivery status.',category:'Support'},
 {key:'commerce',name:'Conversational storefront',description:'Product discovery, catalogue, cart and order support.',category:'Commerce'},
 {key:'booking',name:'Bookings & appointments',description:'Knowledge, service selection, slots, booking and handoff.',category:'Booking'},
 {key:'knowledge',name:'Knowledge assistant',description:'Answer approved FAQs and hand uncertain questions to a person.',category:'Knowledge'},
 {key:'lead_handoff',name:'Lead capture & handoff',description:'Collect customer details before transferring to the team.',category:'Lead generation'},
 {key:'full',name:'Full-service concierge',description:'Knowledge, support, shopping, booking and human handoff.',category:'Omnichannel'},
]

export function createJourneyTemplate(key:BotJourneyTemplateKey,previous:Record<string,unknown>={}):BotJourney{
 if(key==='support')return supportJourneyTemplate(previous)
 if(key==='full')return fullServiceJourneyTemplate(previous)
 const base={...previous,version:1 as const,mode:'custom' as const,startNodeId:'start'}
 if(key==='returns')return{...base,type:'support',mode:'support_only',nodes:[node('start','start','Return request',40,150),node('phone','verify_phone','Verify registered phone',300,80),node('order','verify_order','Verify order',560,80),node('support','support','Return, refund or exchange',820,80),node('handoff','handoff','Specialist handoff',1080,80),node('end','end','Resolved',1330,80)],edges:[edge('start','phone'),edge('phone','order'),edge('order','support','verified'),edge('support','handoff','manual review'),edge('handoff','end')]}
 if(key==='tracking')return{...base,type:'support',mode:'support_only',nodes:[node('start','start','Tracking request',40,150),node('phone','verify_phone','Verify registered phone',300,80),node('order','verify_order','Find order',560,80),node('support','support','Show order status',820,80),node('handoff','handoff','Delivery support',1080,80),node('end','end','End',1330,80)],edges:[edge('start','phone'),edge('phone','order'),edge('order','support','verified'),edge('support','handoff','delivery issue'),edge('support','end','answered'),edge('handoff','end')]}
 if(key==='commerce')return{...base,type:'sales',nodes:[node('start','start','Shopping intent',40,180),node('knowledge','knowledge','Product questions',310,50),node('commerce','commerce','Browse and buy',310,210),node('support','support','Order support',310,370),node('handoff','handoff','Sales handoff',650,210),node('end','end','End',930,210)],edges:[edge('start','knowledge','question'),edge('start','commerce','shop'),edge('start','support','existing order'),edge('knowledge','commerce','show products'),edge('commerce','handoff','needs help'),edge('commerce','end','ordered'),edge('support','end'),edge('handoff','end')]}
 if(key==='booking')return{...base,type:'service',nodes:[node('start','start','Booking intent',40,180),node('knowledge','knowledge','Service questions',310,60),node('booking','booking','Choose service and slot',310,230),node('support','support','Manage booking',310,390),node('handoff','handoff','Booking team',650,230),node('end','end','Confirmed',930,230)],edges:[edge('start','knowledge','question'),edge('start','booking','new booking'),edge('start','support','change or cancel'),edge('knowledge','booking','book'),edge('booking','handoff','needs help'),edge('booking','end','confirmed'),edge('support','end'),edge('handoff','end')]}
 if(key==='knowledge')return{...base,type:'knowledge',nodes:[node('start','start','Customer question',40,140),node('knowledge','knowledge','Search approved knowledge',330,140),node('handoff','handoff','Escalate low confidence',650,60),node('end','end','Answered',650,240)],edges:[edge('start','knowledge'),{...edge('knowledge','handoff','low confidence'),condition:'failure'},{...edge('knowledge','end','answered'),condition:'success'},edge('handoff','end')]}
 return{...base,type:'lead',nodes:[node('start','start','New enquiry',40,140),node('support','support','Understand the request',310,140),{...node('phone','verify_phone','Collect contact details',580,140),config:{message:'What is the best phone number for our team to reach you?',collectName:true,collectEmail:true,collectPhone:true,maxAttempts:3}},node('handoff','handoff','Assign sales team',850,140),node('end','end','Lead captured',1120,140)],edges:[edge('start','support'),edge('support','phone','qualified'),edge('phone','handoff','details collected'),edge('handoff','end')]}
}

export function supportJourneyTemplate(previous: Record<string, unknown> = {}): BotJourney {
  return {
    ...previous,
    version: 1,
    type: 'support',
    mode: 'support_only',
    startNodeId: 'start',
    nodes: [
      node('start', 'start', 'Customer message', 48, 170),
      node('phone', 'verify_phone', 'Verify registered phone', 300, 90),
      node('order', 'verify_order', 'Verify order ID', 560, 90),
      node('support', 'support', 'Customer support', 820, 90),
      node('knowledge', 'knowledge', 'Knowledge answer', 820, 250),
      node('handoff', 'handoff', 'Human handoff', 1080, 170),
      node('end', 'end', 'End', 1330, 170),
    ],
    edges: [edge('start', 'phone'), edge('phone', 'order'), edge('order', 'support', 'verified'), edge('support', 'knowledge', 'information'), edge('support', 'handoff', 'needs a person'), edge('knowledge', 'end'), edge('handoff', 'end')],
  }
}

export function fullServiceJourneyTemplate(previous: Record<string, unknown> = {}): BotJourney {
  return {
    ...previous,
    version: 1,
    type: 'both',
    mode: 'custom',
    startNodeId: 'start',
    nodes: [
      node('start', 'start', 'Customer message', 50, 190),
      node('knowledge', 'knowledge', 'Knowledge answer', 330, 40),
      node('support', 'support', 'Support request', 330, 160),
      node('commerce', 'commerce', 'Product shopping', 330, 280),
      node('booking', 'booking', 'Booking & appointments', 330, 400),
      node('handoff', 'handoff', 'Human handoff', 650, 160),
      node('end', 'end', 'End', 930, 190),
    ],
    edges: [edge('start', 'knowledge', 'question'), edge('start', 'support', 'support'), edge('start', 'commerce', 'shopping'), edge('start', 'booking', 'booking'), edge('support', 'handoff', 'needs a person'), edge('knowledge', 'end'), edge('commerce', 'end'), edge('booking', 'end'), edge('handoff', 'end')],
  }
}
