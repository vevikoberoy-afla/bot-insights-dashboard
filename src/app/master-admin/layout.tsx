import {redirect} from 'next/navigation'
import Link from 'next/link'
import {requireStaff,SaaSError} from '@/lib/saas/context'
import {FounderShell} from '@/components/master-admin/FounderShell'
export const dynamic='force-dynamic'
export default async function Layout({children}:{children:React.ReactNode}){
 let staff
 try{staff=await requireStaff();if(staff.aal!=='aal2')redirect('/auth/mfa?next=/master-admin')}
 catch(e){if((e as any)?.digest?.startsWith('NEXT_REDIRECT'))throw e;if(e instanceof SaaSError&&e.code==='UNAUTHENTICATED')redirect('/auth/login?next=/master-admin');if(e instanceof SaaSError&&e.code==='MFA_REQUIRED')redirect('/auth/mfa?next=/master-admin');return <main className="mx-auto max-w-lg p-12"><h1 className="text-xl font-semibold">Founder access required</h1><p className="my-4 text-sm text-slate-500">{e instanceof SaaSError?e.message:'The founder console is temporarily unavailable.'}</p><Link href="/overview" className="text-blue-600">Open your workspace</Link></main>}
 const environment=process.env.NODE_ENV!=='production'?'LOCAL DEV':process.env.VERCEL_ENV==='preview'?'STAGING':'PRODUCTION'
 return <FounderShell email={staff.email||''} role={staff.role_key} environment={environment}>{children}</FounderShell>
}
