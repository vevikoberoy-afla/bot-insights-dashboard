import {createHash} from 'node:crypto'
import {supabase} from '@/lib/supabase'
import {redis} from '@/lib/redis'
import {uploadWhatsAppMediaBytes,type WhatsAppConnection} from '@/lib/whatsappCampaign'

const TTL_SECONDS=25*86400
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))

export async function getOrUploadWhatsAppMedia(input:{workspaceId:string;connection:WhatsAppConnection;url:string}){
 const source=await fetch(input.url,{signal:AbortSignal.timeout(15000)});if(!source.ok)throw new Error('Campaign header image could not be downloaded.')
 const type=source.headers.get('content-type')||'image/jpeg',bytes=await source.arrayBuffer()
 if(!type.startsWith('image/')||bytes.byteLength>5*1024*1024)throw new Error('Campaign header must be an image under 5 MB.')
 const checksum=createHash('sha256').update(Buffer.from(bytes)).digest('hex'),key=`wa:media:${input.connection.phoneNumberId}:${checksum}`,lock=`${key}:lock`
 const cached=await redis.get<string>(key).catch(()=>null);if(cached)return cached
 const stored=await supabase.from('whatsapp_media_cache').select('meta_media_id').eq('client_id',input.workspaceId).eq('phone_number_id',input.connection.phoneNumberId).eq('media_sha256',checksum).gt('expires_at',new Date().toISOString()).maybeSingle()
 if(stored.data?.meta_media_id){await redis.set(key,stored.data.meta_media_id,{ex:TTL_SECONDS}).catch(()=>{});return String(stored.data.meta_media_id)}
 const acquired=await redis.set(lock,'1',{nx:true,ex:30}).catch(()=>null)
 if(!acquired){for(let attempt=0;attempt<8;attempt++){await wait(300);const value=await redis.get<string>(key).catch(()=>null);if(value)return value}}
 try{
  const mediaId=await uploadWhatsAppMediaBytes(input.connection,bytes,type),expiresAt=new Date(Date.now()+TTL_SECONDS*1000).toISOString()
  const saved=await supabase.from('whatsapp_media_cache').upsert({client_id:input.workspaceId,phone_number_id:input.connection.phoneNumberId,media_sha256:checksum,media_type:type,meta_media_id:mediaId,expires_at:expiresAt,updated_at:new Date().toISOString()},{onConflict:'phone_number_id,media_sha256'})
  if(saved.error)throw saved.error
  await redis.set(key,mediaId,{ex:TTL_SECONDS}).catch(()=>{});return mediaId
 }finally{if(acquired)await redis.del(lock).catch(()=>{})}
}
