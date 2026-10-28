import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'crypto'
import {supabase} from '@/lib/supabase'
import {effectivePaymentPolicy} from '@/lib/paymentPolicy'
import * as QRCode from 'qrcode'

type PaymentMethod='cash_on_delivery'|'direct_upi'|'gateway'
type PaymentToken={clientId:string;orderId:string;transactionId:string;exp:number}
const b64=(value:Buffer)=>value.toString('base64url')
function encryptionKey(){const raw=process.env.PAYMENT_ENCRYPTION_KEY_HEX;if(!raw||!/^[a-f0-9]{64}$/i.test(raw))throw new Error('PAYMENT_ENCRYPTION_KEY_HEX must be configured as 64 hexadecimal characters');return Buffer.from(raw,'hex')}
function signingKey(){const value=process.env.PAYMENT_HMAC_SECRET;if(!value||value.length<32)throw new Error('PAYMENT_HMAC_SECRET must be configured with at least 32 characters');return value}

export function encryptPaymentSecret(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv),encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return `v1.${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(encrypted)}`}
export function decryptPaymentSecret(payload:string){const [version,iv,tag,data]=String(payload||'').split('.');if(version!=='v1'||![iv,tag,data].every(Boolean))throw new Error('Encrypted payment value is invalid');const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8')}
export function paymentFingerprint(value:string){return createHmac('sha256',signingKey()).update(`utr:v1:${value}`).digest('hex')}
export function maskVpa(value:string){const [name,bank]=value.split('@');return bank?`${name.slice(0,2)}${'•'.repeat(Math.max(2,Math.min(8,name.length-2)))}@${bank}`:'Configured'}
export function maskAccount(value:string){const digits=value.replace(/\D/g,'');return digits.length>=4?`•••• ${digits.slice(-4)}`:'Configured'}
export function signPaymentToken(payload:PaymentToken){const encoded=b64(Buffer.from(JSON.stringify(payload))),signature=b64(createHmac('sha256',signingKey()).update(encoded).digest());return `${encoded}.${signature}`}
export function verifyPaymentToken(token:string):PaymentToken{const [encoded,provided]=token.split('.');if(!encoded||!provided)throw new Error('Invalid payment session');const expected=createHmac('sha256',signingKey()).update(encoded).digest(),actual=Buffer.from(provided,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Invalid payment session');const payload=JSON.parse(Buffer.from(encoded,'base64url').toString()) as PaymentToken;if(!payload.clientId||!payload.orderId||!payload.transactionId||!Number.isFinite(payload.exp)||Date.now()>payload.exp)throw new Error('Payment session expired');return payload}
export function buildUpiUri(vpa:string,payee:string,amount:number,reference:string){const query=new URLSearchParams({pa:vpa,pn:payee.replace(/[^a-z0-9 .&-]/gi,'').slice(0,50)||'Merchant',am:amount.toFixed(2),cu:'INR',tr:reference.replace(/[^A-Z0-9]/gi,''),tn:reference}).toString();return `upi://pay?${query}`}
export function secretDigest(value:string){return createHash('sha256').update(value).digest('hex')}

async function selectedUpiAccount(clientId:string){
 const result=await supabase.from('commerce_upi_accounts').select('id,label,vpa_ciphertext,vpa_masked,payee_name,qr_storage_path').eq('client_id',clientId).eq('is_active',true).order('priority',{ascending:true}).order('id',{ascending:true}).limit(1).maybeSingle()
 if(result.error&&!/does not exist|schema cache/i.test(result.error.message))throw new Error(result.error.message)
 if(result.data)return result.data
 const legacy=await supabase.from('commerce_payment_settings').select('upi_vpa_ciphertext,upi_vpa_masked,payee_name').eq('client_id',clientId).maybeSingle()
 if(legacy.data?.upi_vpa_ciphertext)return{id:null,label:'UPI',vpa_ciphertext:legacy.data.upi_vpa_ciphertext,vpa_masked:legacy.data.upi_vpa_masked,payee_name:legacy.data.payee_name||'Merchant',qr_storage_path:null}
 return null
}

export async function paymentOptions(clientId:string){
 const [settingsResult,policy,accounts,legacyUpi]=await Promise.all([
  supabase.from('commerce_payment_settings').select('cash_on_delivery_enabled,direct_upi_enabled,gateway_enabled,active_gateway').eq('client_id',clientId).maybeSingle(),
  effectivePaymentPolicy(clientId),
  supabase.from('commerce_upi_accounts').select('id',{count:'exact',head:true}).eq('client_id',clientId).eq('is_active',true),
  supabase.from('commerce_payment_settings').select('upi_vpa_ciphertext').eq('client_id',clientId).maybeSingle(),
 ])
 const settings=settingsResult.data
 return{cashOnDelivery:policy.cash_on_delivery_allowed&&settings?.cash_on_delivery_enabled!==false,directUpi:policy.direct_upi_allowed&&settings?.direct_upi_enabled===true&&((accounts.count||0)>0||!!legacyUpi.data?.upi_vpa_ciphertext),gateway:policy.gateway_allowed&&settings?.gateway_enabled===true&&settings?.active_gateway==='razorpay',activeGateway:settings?.active_gateway||null,activeUpiAccounts:accounts.count||0}
}

export async function initializeOrderPayment(clientId:string,order:any,method:PaymentMethod){
 const [settingsResult,policy]=await Promise.all([supabase.from('commerce_payment_settings').select('*').eq('client_id',clientId).maybeSingle(),effectivePaymentPolicy(clientId)])
 if(settingsResult.error)throw new Error(settingsResult.error.message)
 const settings=settingsResult.data||{cash_on_delivery_enabled:true,direct_upi_enabled:false,gateway_enabled:false}
 if(method==='cash_on_delivery'&&(!policy.cash_on_delivery_allowed||!settings.cash_on_delivery_enabled))throw new Error('Cash on delivery is unavailable')
 if(method==='direct_upi'&&(!policy.direct_upi_allowed||!settings.direct_upi_enabled))throw new Error('UPI payment is unavailable')
 if(method==='gateway'&&(!policy.gateway_allowed||!settings.gateway_enabled||settings.active_gateway!=='razorpay'||!settings.gateway_account_id_ciphertext))throw new Error('Online gateway payment is unavailable')
 const upiAccount=method==='direct_upi'?await selectedUpiAccount(clientId):null
 if(method==='direct_upi'&&!upiAccount)throw new Error('UPI payment is unavailable')
 const expiresAt=new Date(Date.now()+15*60_000).toISOString()
 const transactionResult=await supabase.from('commerce_payment_transactions').upsert({client_id:clientId,order_id:order.id,rail:method,status:'pending',amount:Number(order.total),currency:order.currency,expires_at:method==='cash_on_delivery'?null:expiresAt,upi_account_id:upiAccount?.id||null,public_token_hash:null,utr_fingerprint:null,utr_last4:null,metadata:{order_reference:order.reference,upi_account_label:upiAccount?.label||null}},{onConflict:'client_id,order_id'}).select('id,status,rail,expires_at').single()
 if(transactionResult.error)throw new Error(transactionResult.error.message)
 const tx=transactionResult.data,paymentStatus=method==='cash_on_delivery'?'cash_on_delivery':method==='direct_upi'?'awaiting_payment':'awaiting_gateway'
 const update=await supabase.from('commerce_orders').update({payment_method:method,payment_rail:method,payment_status:paymentStatus,payment_due_at:tx.expires_at,...(method==='cash_on_delivery'?{status:'confirmed'}:{})}).eq('client_id',clientId).eq('id',order.id)
 if(update.error)throw new Error(update.error.message)
 await supabase.from('commerce_payment_events').insert({client_id:clientId,transaction_id:tx.id,order_id:order.id,event_type:'payment_session_created',actor_type:'system',details:{rail:method,upi_account_id:upiAccount?.id||null}})
 if(method==='direct_upi'){
  const vpa=decryptPaymentSecret(upiAccount!.vpa_ciphertext),uri=buildUpiUri(vpa,upiAccount!.payee_name,Number(order.total),order.reference),token=signPaymentToken({clientId,orderId:order.id,transactionId:tx.id,exp:Date.now()+15*60_000})
  const tokenSaved=await supabase.from('commerce_payment_transactions').update({public_token_hash:secretDigest(token)}).eq('id',tx.id).eq('client_id',clientId);if(tokenSaved.error)throw new Error(tokenSaved.error.message)
  const qrUrl=await QRCode.toDataURL(uri,{errorCorrectionLevel:'M',margin:2,width:360,color:{dark:'#111111',light:'#ffffff'}})
  let merchantQrUrl:string|undefined
  if(policy.qr_upload_allowed&&upiAccount!.qr_storage_path){const signed=await supabase.storage.from('payment-assets').createSignedUrl(upiAccount!.qr_storage_path,15*60);if(!signed.error)merchantQrUrl=signed.data.signedUrl}
  return{method,status:paymentStatus,upiUri:uri,qrUrl,merchantQrUrl,upiId:vpa,payeeName:upiAccount!.payee_name,token,expiresAt:tx.expires_at,maskedVpa:upiAccount!.vpa_masked,accountLabel:upiAccount!.label}
 }
 if(method==='gateway'){
  const keyId=process.env.RAZORPAY_MASTER_KEY_ID,keySecret=process.env.RAZORPAY_MASTER_KEY_SECRET;if(!keyId||!keySecret)throw new Error('Payment gateway credentials are not configured')
  const amount=Math.round(Number(order.total)*100),fee=Math.round(amount*Number(settings.platform_fee_bps||0)/10000),linkedAccount=decryptPaymentSecret(settings.gateway_account_id_ciphertext),body:any={amount,currency:order.currency||'INR',receipt:order.reference,notes:{commerce_order_id:order.id,client_id:clientId}}
  if(linkedAccount)body.transfers=[{account:linkedAccount,amount:Math.max(0,amount-fee),currency:order.currency||'INR',on_hold:0,notes:{order_reference:order.reference}}]
  const response=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'}),gateway=await response.json();if(!response.ok||!gateway.id)throw new Error(gateway.error?.description||'Gateway checkout could not be created')
  const saved=await supabase.from('commerce_payment_transactions').update({gateway_provider:'razorpay',gateway_order_id:gateway.id,metadata:{order_reference:order.reference,platform_fee_minor:fee},updated_at:new Date().toISOString()}).eq('id',tx.id).eq('client_id',clientId);if(saved.error)throw new Error(saved.error.message)
  return{method,status:paymentStatus,expiresAt:tx.expires_at,gatewayOrderId:gateway.id,gatewayKeyId:keyId,customer:{name:order.customer_name,email:String(order.customer_email||'').endsWith('@order.invalid')?'':order.customer_email,phone:order.customer_phone}}
 }
 return{method,status:paymentStatus,expiresAt:tx.expires_at}
}
