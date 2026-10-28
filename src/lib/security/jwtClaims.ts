export type TrustedSupabaseClaims = {
  sub: string
  iss: string
  aud: string | string[]
  exp: number
  iat?: number
  nbf?: number
  email?: string
  phone?: string
  role?: string
  app_metadata?: Record<string,unknown>
  user_metadata?: Record<string,unknown>
  aal?: string
  session_id?: string
  [key:string]: unknown
}

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function expectedIssuer(){
  const configured=process.env.SUPABASE_JWT_ISSUER?.replace(/\/$/,'')
  if(configured)return configured
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL
  if(!base)return ''
  try{return `${new URL(base).origin}/auth/v1`}catch{return ''}
}

/**
 * Claim checks intentionally sit on top of Supabase getClaims(): getClaims
 * verifies the cryptographic signature and expiry, while this verifier binds
 * that valid token to this deployment's issuer and intended audience.
 */
export function validateSupabaseClaims(value:unknown,nowSeconds=Math.floor(Date.now()/1000)):TrustedSupabaseClaims|null{
  if(!value||typeof value!=='object')return null
  const claims=value as Record<string,unknown>,issuer=expectedIssuer(),expectedAudience=process.env.SUPABASE_JWT_AUDIENCE||'authenticated'
  const audiences=Array.isArray(claims.aud)?claims.aud.map(String):[String(claims.aud||'')]
  if(!issuer||claims.iss!==issuer||!audiences.includes(expectedAudience))return null
  if(typeof claims.sub!=='string'||!uuid.test(claims.sub))return null
  if(typeof claims.exp!=='number'||claims.exp<=nowSeconds)return null
  if(typeof claims.iat==='number'&&claims.iat>nowSeconds+60)return null
  if(typeof claims.nbf==='number'&&claims.nbf>nowSeconds+60)return null
  return claims as TrustedSupabaseClaims
}

export function claimsIdentity(claims:TrustedSupabaseClaims){
  return {
    ...claims,
    id:claims.sub,
    email:typeof claims.email==='string'?claims.email:undefined,
    phone:typeof claims.phone==='string'?claims.phone:undefined,
    app_metadata:claims.app_metadata||{},
    user_metadata:claims.user_metadata||{},
  }
}
