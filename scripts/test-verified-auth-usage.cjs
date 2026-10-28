const fs=require('node:fs')
const path=require('node:path')
const assert=require('node:assert/strict')

const files=[]
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isDirectory())walk(target);else if(/\.(ts|tsx|js|jsx)$/.test(entry.name))files.push(target)}}
walk('src')

for(const file of files){
 const source=fs.readFileSync(file,'utf8')
 if(file.endsWith('verifiedAuth.ts'))continue
 assert(!source.includes('.auth.getSession()'),`${file} reads a browser session directly; verify identity with getUser() or use getVerifiedAccessToken()`)
 assert(!/onAuthStateChange\s*\(\s*\([^)]*\bsession\b/.test(source),`${file} trusts the user/session payload from an auth-state event`)
}

const helper=fs.readFileSync('src/lib/client/verifiedAuth.ts','utf8')
assert(helper.indexOf('.auth.getUser()')<helper.indexOf('.auth.getSession()'),'verified token helper must authenticate the user before reading the token')
assert(!/session(?:\?|)\.user/.test(helper),'verified token helper must not trust session.user')
const middleware=fs.readFileSync('src/middleware.ts','utf8')
const saasContext=fs.readFileSync('src/lib/saas/context.ts','utf8')
assert(!middleware.includes('getAuthenticatorAssuranceLevel('),'middleware must enforce MFA from cryptographically verified JWT claims, not the getSession fallback')
assert(!saasContext.includes('getAuthenticatorAssuranceLevel('),'admin context must enforce MFA from cryptographically verified JWT claims, not the getSession fallback')
console.log('PASS: browser identity comes from getUser(); session payloads are token-only')
