import {supabase} from '@/lib/supabase'
import {decryptConfigSecrets} from '@/lib/security/secretVault'
import {Agent,fetch as undiciFetch} from 'undici'

const GRAPH_VERSION=process.env.WHATSAPP_GRAPH_VERSION||'v21.0'
const GRAPH_BASE=`https://graph.facebook.com/${GRAPH_VERSION}`

const metaDispatcher=new Agent({connections:4,pipelining:1,allowH2:true,connect:{timeout:10000}})
export type WhatsAppConnection={integrationId:string;botId:string;phoneNumberId:string;wabaId:string;accessToken:string;displayName:string;defaultCountry:string}

export async function resolveWhatsAppConnection(workspaceId:string,botId:string):Promise<WhatsAppConnection|null>{
 const result=await supabase.from('channel_integrations').select('id,bot_id,instance_name,config,status').eq('client_id',workspaceId).eq('bot_id',botId).eq('channel','whatsapp').eq('status','active').order('updated_at',{ascending:false}).limit(1).maybeSingle()
 if(result.error||!result.data)return null
 const config=decryptConfigSecrets(workspaceId,result.data.config||{}),phoneNumberId=String(config.phone_number_id||''),wabaId=String(config.business_account_id||config.waba_id||''),accessToken=String(config.api_key||config.access_token||'')
 return phoneNumberId&&wabaId&&accessToken?{integrationId:result.data.id,botId:String(result.data.bot_id),phoneNumberId,wabaId,accessToken,displayName:String(result.data.instance_name||'WhatsApp'),defaultCountry:String(config.default_country||process.env.DEFAULT_PHONE_COUNTRY||'IN').toUpperCase()}:null
}

async function graph(path:string,accessToken:string,init?:RequestInit):Promise<any>{
 const response=await undiciFetch(`${GRAPH_BASE}/${path.replace(/^\//,'')}`,{...(init as any),dispatcher:metaDispatcher,headers:{Authorization:`Bearer ${accessToken}`,...(init?.body?{'Content-Type':'application/json'}:{}),...(init?.headers||{})},signal:init?.signal||AbortSignal.timeout(15000)})
 const data:any=await response.json().catch(()=>({}))
 if(!response.ok){const error:any=new Error(String(data?.error?.message||`Meta request failed (${response.status})`));error.status=response.status;error.metaCode=Number(data?.error?.code||0);error.metaSubcode=Number(data?.error?.error_subcode||0);error.details=data?.error;throw error}
 return data
}

export function toMetaTemplateComponents(template:any,trackingOrigin?:string){
 const components:any[]=[]
 if(template.headerType==='TEXT')components.push({type:'HEADER',format:'TEXT',text:template.headerText})
 if(template.headerType==='IMAGE')components.push({type:'HEADER',format:'IMAGE',example:{header_handle:[template.headerImageUrl]}})
 const body:any={type:'BODY',text:template.body};if(template.sampleValues?.length)body.example={body_text:[template.sampleValues]};components.push(body)
 if(template.footer)components.push({type:'FOOTER',text:template.footer})
 if(template.buttons?.length)components.push({type:'BUTTONS',buttons:template.buttons.map((button:any)=>button.type==='URL'?{type:'URL',text:button.text,url:trackingOrigin?`${trackingOrigin}/api/track/whatsapp?token={{1}}`:button.url,...(trackingOrigin?{example:['sample-tracking-token']}: {})}:{type:'QUICK_REPLY',text:button.text})})
 return components
}

async function uploadTemplateSample(accessToken:string,url:string){
 const appId=process.env.META_APP_ID;if(!appId)throw new Error('META_APP_ID is required to submit image-header templates.')
 const source=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!source.ok)throw new Error('Template sample image could not be downloaded.')
 const type=source.headers.get('content-type')||'image/jpeg',bytes=Buffer.from(await source.arrayBuffer());if(!type.startsWith('image/')||bytes.length>5*1024*1024)throw new Error('Template sample must be an image under 5 MB.')
 const session=await graph(`${appId}/uploads?file_name=template-header&file_length=${bytes.length}&file_type=${encodeURIComponent(type)}`,accessToken,{method:'POST'})
 const response=await fetch(`${GRAPH_BASE}/${session.id}`,{method:'POST',headers:{Authorization:`OAuth ${accessToken}`,file_offset:'0','Content-Type':'application/octet-stream'},body:bytes,signal:AbortSignal.timeout(20000)}),data=await response.json().catch(()=>({}))
 if(!response.ok||!data.h)throw new Error(String(data?.error?.message||'Meta sample upload failed.'));return String(data.h)
}
export async function submitMetaTemplate(connection:WhatsAppConnection,template:any){const origin=String(process.env.NEXT_PUBLIC_APP_URL||'').replace(/\/$/,'');if(template.buttons?.some((button:any)=>button.type==='URL')&&!origin.startsWith('https://'))throw new Error('NEXT_PUBLIC_APP_URL must be a public HTTPS URL for tracked CTA buttons.');const components=toMetaTemplateComponents(template,origin||undefined);if(template.headerType==='IMAGE'){const header=components.find((item:any)=>item.type==='HEADER');header.example={header_handle:[await uploadTemplateSample(connection.accessToken,template.headerImageUrl)]}}return graph(`${connection.wabaId}/message_templates`,connection.accessToken,{method:'POST',body:JSON.stringify({name:template.name,language:template.language,category:template.category,components})})}
export async function listMetaTemplates(connection:WhatsAppConnection){return graph(`${connection.wabaId}/message_templates?limit=250&fields=id,name,status,category,language,components,rejected_reason`,connection.accessToken)}

export type MetaTemplateParameter={type:'text'|'image';text?:string;image?:{id:string}}
export async function dispatchWhatsAppTemplate(input:{connection:WhatsAppConnection;to:string;name:string;language:string;bodyValues:string[];headerMediaId?:string|null;cta?:{index:number;token:string}|null}){
 const components:any[]=[]
 if(input.headerMediaId)components.push({type:'header',parameters:[{type:'image',image:{id:input.headerMediaId}}]})
 if(input.bodyValues.length)components.push({type:'body',parameters:input.bodyValues.map(text=>({type:'text',text:String(text).replace(/[\r\n]+/g,' ').slice(0,1024)}))})
 if(input.cta)components.push({type:'button',sub_type:'url',index:String(input.cta.index),parameters:[{type:'text',text:input.cta.token}]})
 return graph(`${input.connection.phoneNumberId}/messages`,input.connection.accessToken,{method:'POST',body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:input.to,type:'template',template:{name:input.name,language:{code:input.language},components}})})
}

export async function uploadWhatsAppMedia(connection:WhatsAppConnection,url:string){
 const source=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!source.ok)throw new Error('Campaign header image could not be downloaded.')
 const type=source.headers.get('content-type')||'image/jpeg';if(!type.startsWith('image/'))throw new Error('Campaign header media must be an image.')
 const bytes=await source.arrayBuffer();return uploadWhatsAppMediaBytes(connection,bytes,type)
}

export async function uploadWhatsAppMediaBytes(connection:WhatsAppConnection,bytes:ArrayBuffer,type='image/jpeg'){
 if(!type.startsWith('image/'))throw new Error('Campaign header media must be an image.');if(bytes.byteLength>5*1024*1024)throw new Error('Campaign header image must be under 5 MB.')
 const form=new FormData();form.set('messaging_product','whatsapp');form.set('type',type);form.set('file',new Blob([bytes],{type}),'campaign-header')
 const response=await fetch(`${GRAPH_BASE}/${connection.phoneNumberId}/media`,{method:'POST',headers:{Authorization:`Bearer ${connection.accessToken}`},body:form,signal:AbortSignal.timeout(20000)}),data=await response.json().catch(()=>({}))
 if(!response.ok||!data.id)throw new Error(String(data?.error?.message||'Meta media upload failed.'))
 return String(data.id)
}

export function classifyWhatsAppError(error:any){
 const code=Number(error?.metaCode||0),status=Number(error?.status||0),message=String(error?.message||'WhatsApp delivery failed').slice(0,500)
 if([130429,80007].includes(code)||status===429||status>=500)return{outcome:'failed' as const,retryable:true,code:code||status||'META_TRANSIENT',message}
 if([131026,131048,131049,131056,368].includes(code)||status>=400)return{outcome:'failed' as const,retryable:false,code:code||status||'META_REJECTED',message,suppress:code===131026}
 const name=String(error?.name||''),network=String(error?.code||error?.cause?.code||'')
 if(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_INVALID_ARG'].includes(network))return{outcome:'failed' as const,retryable:true,code:network,message}
 if(['ECONNRESET','EPIPE','ETIMEDOUT','UND_ERR_SOCKET','TimeoutError'].includes(network)||name==='TimeoutError')return{outcome:'unknown' as const,retryable:false,code:network||name,message}
 return{outcome:'unknown' as const,retryable:false,code:'AMBIGUOUS',message}
}

export function renderWhatsAppBindings(bindings:string[],recipient:any,campaign:any,products:any[]){
 const product=products[0],variables=recipient.variables||{}
 return bindings.map(binding=>{const value=({first_name:recipient.first_name||'there',name:variables.name||recipient.first_name||'there',coupon_code:campaign.coupon_code||'',store_name:campaign.clients?.name||'Our store',product_title:product?.name||'',product_price:product?`${product.currency||''} ${product.price}`.trim():''} as any)[binding];return String(value||'-').replace(/[\r\n]+/g,' ').slice(0,1024)})
}
