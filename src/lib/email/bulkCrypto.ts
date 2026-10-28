import {createHmac,timingSafeEqual} from 'crypto'

function secret(){const value=process.env.BULK_EMAIL_SIGNING_SECRET||(process.env.NODE_ENV!=='production'?process.env.SUPABASE_SERVICE_ROLE_KEY:undefined);if(!value)throw new Error('BULK_EMAIL_SIGNING_SECRET is required');return value}
const encode=(value:string)=>Buffer.from(value).toString('base64url')
const decode=(value:string)=>Buffer.from(value,'base64url').toString()
function sign(payload:string){return createHmac('sha256',secret()).update(payload).digest('base64url')}
function validHttps(value:unknown){try{const url=new URL(String(value));return url.protocol==='https:'&&Boolean(url.hostname)}catch{return false}}
export function createEmailToken(recipientId:string,purpose:'open'|'unsubscribe'){const payload=encode(JSON.stringify({r:recipientId,p:purpose,v:1}));return`${payload}.${sign(payload)}`}
export function verifyEmailToken(token:string,purpose:'open'|'unsubscribe'){const [payload,signature]=token.split('.');if(!payload||!signature)return null;const expected=sign(payload),a=Buffer.from(signature),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return null;try{const parsed=JSON.parse(decode(payload));return parsed?.p===purpose&&typeof parsed.r==='string'?parsed.r:null}catch{return null}}
export function createClickToken(recipientId:string,target:string){if(!validHttps(target))throw new Error('Tracked links must use a valid HTTPS URL');const payload=encode(JSON.stringify({r:recipientId,u:target,p:'click',v:1}));return`${payload}.${sign(payload)}`}
export function verifyClickToken(token:string){const [payload,signature]=token.split('.');if(!payload||!signature)return null;const expected=sign(payload),a=Buffer.from(signature),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return null;try{const parsed=JSON.parse(decode(payload));return parsed?.p==='click'&&typeof parsed.r==='string'&&validHttps(parsed.u)?{recipientId:parsed.r,target:parsed.u}:null}catch{return null}}
