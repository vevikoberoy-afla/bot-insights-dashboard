const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
process.env.PAYMENT_ENCRYPTION_KEY_HEX='22'.repeat(32)
process.env.PAYMENT_HMAC_SECRET='scenario-payment-signing-secret-long-enough'

let policy={cash_on_delivery_allowed:true,direct_upi_allowed:true,gateway_allowed:false,qr_upload_allowed:true,max_upi_accounts:5}
let settings={cash_on_delivery_enabled:true,direct_upi_enabled:true,gateway_enabled:false,active_gateway:null,platform_fee_bps:0}
let upiAccount=null,transactionWrite=null,orderWrite=null
function result(table,mode,head){
 if(table==='commerce_payment_settings')return mode==='single'?settings:settings
 if(table==='commerce_upi_accounts')return head?null:upiAccount
 if(table==='commerce_payment_transactions'&&mode==='single')return{id:'tx-1',status:'pending',rail:transactionWrite.rail,expires_at:transactionWrite.expires_at}
 return null
}
const supabase={
 from(table){let mode='query',head=false;const q={select(_columns,options){head=options?.head===true;return q},eq(){return q},order(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:result(table,'single',head),count:table==='commerce_upi_accounts'&&head?(upiAccount?1:0):null,error:null})},single(){return Promise.resolve({data:result(table,'single',head),error:null})},upsert(value){transactionWrite=value;return q},update(value){if(table==='commerce_orders')orderWrite=value;return q},insert(){return Promise.resolve({error:null})},then(resolve){resolve({data:result(table,mode,head),count:table==='commerce_upi_accounts'&&head?(upiAccount?1:0):null,error:null})}};return q},
 storage:{from(){return{createSignedUrl:async()=>({data:{signedUrl:'https://signed.example/qr'},error:null})}}}
}
const source=ts.transpileModule(fs.readFileSync('src/lib/paymentSecurity.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const moduleObject={exports:{}}
vm.runInNewContext(source,{module:moduleObject,exports:moduleObject.exports,require:name=>name==='@/lib/supabase'?{supabase}:name==='@/lib/paymentPolicy'?{effectivePaymentPolicy:async()=>policy}:require(name),process,Buffer,URLSearchParams,Date,JSON,fetch})
const payment=moduleObject.exports

async function main(){
 upiAccount={id:'upi-primary',label:'Main counter',vpa_ciphertext:payment.encryptPaymentSecret('merchant@bank'),vpa_masked:'me••••••@bank',payee_name:'Example Store',qr_storage_path:'workspace/upi-primary/qr.png'}
 let options=await payment.paymentOptions('workspace')
 assert.equal(options.directUpi,true,'active UPI accounts should become available when founder and workspace allow them')
 policy={...policy,direct_upi_allowed:false}
 options=await payment.paymentOptions('workspace')
 assert.equal(options.directUpi,false,'founder block must override a workspace UPI toggle')
 policy={...policy,direct_upi_allowed:true}
 const order={id:'order-1',reference:'ORD-1',total:1250,currency:'INR',customer_name:'Alex',customer_phone:'+919999999999'}
 const checkout=await payment.initializeOrderPayment('workspace',order,'direct_upi')
 assert.equal(checkout.accountLabel,'Main counter')
 assert.match(checkout.qrUrl,/^data:image\/png;base64,/,'a QR must be generated directly from the amount-bound UPI URI')
 assert.equal(checkout.upiId,'merchant@bank')
 assert.equal(checkout.payeeName,'Example Store')
 assert.match(checkout.upiUri,/^upi:\/\/pay\?/)
 assert.equal(transactionWrite.upi_account_id,'upi-primary','the selected account must be bound to the immutable payment transaction')
 assert.equal(orderWrite.payment_status,'awaiting_payment','UPI must remain pending before seller verification')
 await payment.initializeOrderPayment('workspace',{...order,id:'order-2'},'cash_on_delivery')
 assert.equal(orderWrite.status,'confirmed','COD orders should confirm without claiming an online payment')
 console.log('PASS: founder payment gates, multi-UPI selection, private QR checkout, pending UTR state and COD confirmation')
}
main().catch(error=>{console.error(error);process.exit(1)})
