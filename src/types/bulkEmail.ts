export const SEGMENT_FIELDS=['total_spent','total_orders','tags','last_order_days_ago','last_chat_days_ago'] as const
export const SEGMENT_OPERATORS=['gt','gte','lt','lte','eq','contains','not_contains'] as const
export type SegmentField=typeof SEGMENT_FIELDS[number]
export type SegmentOperator=typeof SEGMENT_OPERATORS[number]
export type SegmentRule={id:string;field:SegmentField;operator:SegmentOperator;value:string|number}
export type SegmentFilter={combinator:'AND'|'OR';rules:SegmentRule[]}
export type CampaignBlock=
 |{id:string;type:'heading';text:string}
 |{id:string;type:'paragraph';text:string}
 |{id:string;type:'coupon';text:string}
 |{id:string;type:'products';heading:string}
 |{id:string;type:'button';label:string;url:string}
export type CampaignContent={body:string;buttonLabel?:string;buttonUrl?:string;blocks?:CampaignBlock[]}

function isValidHttpsUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'&&Boolean(url.hostname)}catch{return false}}

export function validateSegmentFilter(value:unknown):SegmentFilter{
 const input=value as any
 if(!input||!['AND','OR'].includes(input.combinator)||!Array.isArray(input.rules)||input.rules.length>20)throw new Error('Invalid audience filter')
 const rules=input.rules.map((rule:any,index:number)=>{
 if(!rule||!SEGMENT_FIELDS.includes(rule.field)||!SEGMENT_OPERATORS.includes(rule.operator))throw new Error(`Invalid audience rule ${index+1}`)
  const allowed=rule.field==='tags'?['contains','not_contains']:['gt','gte','lt','lte','eq']
  if(!allowed.includes(rule.operator))throw new Error(`Invalid operator for audience rule ${index+1}`)
  if(typeof rule.value!=='string'&&typeof rule.value!=='number')throw new Error(`Invalid audience value ${index+1}`)
  const value=typeof rule.value==='string'?rule.value.trim().slice(0,200):rule.value
  if(rule.field==='tags'&&!String(value))throw new Error(`Audience rule ${index+1} requires a tag`)
  if(rule.field!=='tags'&&!Number.isFinite(Number(value)))throw new Error(`Audience rule ${index+1} requires a number`)
  return{id:String(rule.id||`rule-${index}`).slice(0,80),field:rule.field as SegmentField,operator:rule.operator as SegmentOperator,value}
 })
 return{combinator:input.combinator,rules}
}

export function validateCampaignContent(value:unknown):CampaignContent{
 const input=value as any
 if(Array.isArray(input?.blocks)){
  if(input.blocks.length<1||input.blocks.length>20)throw new Error('Email must contain between 1 and 20 content blocks')
  const blocks:CampaignBlock[]=input.blocks.map((block:any,index:number)=>{
   const id=String(block?.id||`block-${index}`).slice(0,80),type=String(block?.type||'')
   if(type==='heading'||type==='paragraph'||type==='coupon'){const text=String(block.text||'').trim().slice(0,type==='paragraph'?20000:500);return{id,type,text} as CampaignBlock}
   if(type==='products')return{id,type,heading:String(block.heading||'Featured products').trim().slice(0,120)}
   if(type==='button'){const label=String(block.label||'Learn more').trim().slice(0,80),url=String(block.url||'').trim().slice(0,2000);if(!isValidHttpsUrl(url))throw new Error(`Button block ${index+1} requires a valid HTTPS URL`);return{id,type,label,url}}
   throw new Error(`Invalid email block ${index+1}`)
  })
  const body=blocks.filter((block):block is Extract<CampaignBlock,{text:string}>=>(block as any).text!==undefined).map(block=>block.text).filter(Boolean).join('\n\n')
  if(!body&&!blocks.some(block=>block.type==='products'||block.type==='button'))throw new Error('Add content to at least one email block')
  return{body,blocks}
 }
 const body=String(input?.body||'').trim()
 if(body.length<1||body.length>100000)throw new Error('Email content is required and must be under 100,000 characters')
 const buttonUrl=String(input?.buttonUrl||'').trim()
 if(buttonUrl&&!isValidHttpsUrl(buttonUrl))throw new Error('Email button links must use a valid HTTPS URL')
 return{body,buttonLabel:String(input?.buttonLabel||'').trim().slice(0,80)||undefined,buttonUrl:buttonUrl.slice(0,2000)||undefined}
}
