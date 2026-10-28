import {validateSegmentFilter,type SegmentFilter} from '@/types/bulkEmail'
import {z} from 'zod'
import {normalizeE164Phone} from '@/lib/phone'

export const WHATSAPP_TEMPLATE_CATEGORIES=['MARKETING','UTILITY','AUTHENTICATION'] as const
export const WHATSAPP_TEMPLATE_STATUSES=['PENDING','APPROVED','REJECTED','PAUSED','DISABLED','FLAGGED'] as const
export const WHATSAPP_VARIABLES=['first_name','name','coupon_code','store_name','product_title','product_price'] as const
export type WhatsAppTemplateCategory=typeof WHATSAPP_TEMPLATE_CATEGORIES[number]
export type WhatsAppVariable=typeof WHATSAPP_VARIABLES[number]
export type WhatsAppButton={type:'URL'|'QUICK_REPLY';text:string;url?:string;payload?:string}
export type WhatsAppTemplateDraft={name:string;language:string;category:WhatsAppTemplateCategory;headerType:'NONE'|'TEXT'|'IMAGE';headerText?:string;headerImageUrl?:string;body:string;footer:string;buttons:WhatsAppButton[];sampleValues:string[]}

const templateInput=z.object({name:z.string(),language:z.string().default('en_US'),category:z.string().default('MARKETING'),headerType:z.enum(['NONE','TEXT','IMAGE']).default('NONE'),headerText:z.string().optional(),headerImageUrl:z.string().optional(),body:z.string(),footer:z.string().optional(),buttons:z.array(z.object({type:z.enum(['URL','QUICK_REPLY']),text:z.string(),url:z.string().optional(),payload:z.string().optional()})).max(2).default([]),sampleValues:z.array(z.string()).default([])})

const namePattern=/^[a-z][a-z0-9_]{0,511}$/
const languagePattern=/^[a-z]{2,3}(?:_[A-Z]{2})?$/
const variablePattern=/\{\{(\d+)\}\}/g
const https=(value:string)=>{try{const url=new URL(value);return url.protocol==='https:'&&!!url.hostname}catch{return false}}

export function normalizePhoneDigits(value:unknown,defaultCountry?:string){return normalizeE164Phone(value,defaultCountry)}

export function validateWhatsAppTemplate(input:unknown):WhatsAppTemplateDraft{
 const value=templateInput.parse(input),name=String(value.name||'').trim().toLowerCase(),language=String(value.language||'en_US').trim(),category=String(value.category||'MARKETING').toUpperCase() as WhatsAppTemplateCategory
 if(!namePattern.test(name))throw new Error('Template names must start with a letter and contain only lowercase letters, numbers, and underscores.')
 if(!languagePattern.test(language))throw new Error('Choose a valid Meta language code.')
 if(!WHATSAPP_TEMPLATE_CATEGORIES.includes(category))throw new Error('Choose a valid template category.')
 const body=String(value?.body||'').trim();if(!body||body.length>1024)throw new Error('Template body is required and must be 1–1,024 characters.')
 const indexes=Array.from(body.matchAll(variablePattern),match=>Number(match[1]))
 const unique=Array.from(new Set(indexes)).sort((a,b)=>a-b)
 if(unique.some((number,index)=>number!==index+1)||unique.length>4)throw new Error('Use sequential variables {{1}} through {{4}} without gaps.')
 const sampleValues=Array.isArray(value?.sampleValues)?value.sampleValues.map((item:unknown)=>String(item||'').trim().replace(/[\r\n]/g,' ').slice(0,200)):[]
 if(unique.length&&sampleValues.slice(0,unique.length).some(item=>!item)||sampleValues.length<unique.length)throw new Error('Add a sample value for every template variable.')
 const headerType=['NONE','TEXT','IMAGE'].includes(value?.headerType)?value.headerType:'NONE',headerText=String(value?.headerText||'').trim().slice(0,60),headerImageUrl=String(value?.headerImageUrl||'').trim().slice(0,2000)
 if(headerType==='TEXT'&&!headerText)throw new Error('Header text is required.');if(headerType==='IMAGE'&&!https(headerImageUrl))throw new Error('Header image must use a valid public HTTPS URL.')
 const buttons=(Array.isArray(value?.buttons)?value.buttons:[]).slice(0,2).map((button:any)=>{const type=button?.type==='URL'?'URL':'QUICK_REPLY',text=String(button?.text||'').trim().slice(0,25);if(!text)throw new Error('Every button needs a label.');if(type==='URL'){const url=String(button?.url||'').trim().slice(0,2000);if(!https(url))throw new Error('Call-to-action buttons require a valid HTTPS URL.');return{type,text,url} as WhatsAppButton}return{type,text,payload:String(button?.payload||'OPT_OUT_PROMO').trim().slice(0,256)} as WhatsAppButton})
 return{name,language,category,headerType,headerText,headerImageUrl,body,footer:String(value?.footer||'Reply STOP to opt out').trim().slice(0,60),buttons,sampleValues:sampleValues.slice(0,unique.length)}
}

export function validateWhatsAppBindings(input:unknown,variableCount:number):WhatsAppVariable[]{
 const values=z.array(z.enum(WHATSAPP_VARIABLES)).max(4).parse(input)
 if(values.length!==variableCount||values.some(value=>!WHATSAPP_VARIABLES.includes(value as WhatsAppVariable)))throw new Error('Map every template variable to an allowed customer, store, coupon, or product field.')
 return values as WhatsAppVariable[]
}

export function validateWhatsAppCampaignFilter(value:unknown):SegmentFilter{return validateSegmentFilter(value)}
