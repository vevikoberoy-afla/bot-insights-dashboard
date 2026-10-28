const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
process.env.PAYMENT_ENCRYPTION_KEY_HEX='11'.repeat(32)
process.env.PAYMENT_HMAC_SECRET='payment-test-signing-secret-that-is-long-enough'
const source=ts.transpileModule(fs.readFileSync('src/lib/paymentSecurity.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const moduleObject={exports:{}}
vm.runInNewContext(source,{module:moduleObject,exports:moduleObject.exports,require:name=>name==='@/lib/supabase'?{supabase:{}}:name==='@/lib/paymentPolicy'?{effectivePaymentPolicy:async()=>({cash_on_delivery_allowed:true,direct_upi_allowed:true,gateway_allowed:true,qr_upload_allowed:true,max_upi_accounts:5})}:require(name),process,Buffer,URLSearchParams,Date,JSON,fetch})
const security=moduleObject.exports
const plaintext='merchant.private@bank',first=security.encryptPaymentSecret(plaintext),second=security.encryptPaymentSecret(plaintext)
assert.notEqual(first,second,'random GCM IVs must produce different ciphertext')
assert.equal(security.decryptPaymentSecret(first),plaintext)
assert.ok(!first.includes(plaintext),'ciphertext must not expose the VPA')
const fingerprint=security.paymentFingerprint('429918374612')
assert.match(fingerprint,/^[a-f0-9]{64}$/)
assert.equal(fingerprint,security.paymentFingerprint('429918374612'),'UTR fingerprint must support replay detection')
assert.ok(!fingerprint.includes('429918374612'))
const token=security.signPaymentToken({clientId:'client',orderId:'order',transactionId:'transaction',exp:Date.now()+60_000})
assert.equal(security.verifyPaymentToken(token).orderId,'order')
assert.throws(()=>security.verifyPaymentToken(token.slice(0,-1)+(token.endsWith('a')?'b':'a')),/Invalid payment session/)
console.log('PASS: payment AES-GCM confidentiality, random IVs, HMAC UTR fingerprinting and signed checkout tokens')
