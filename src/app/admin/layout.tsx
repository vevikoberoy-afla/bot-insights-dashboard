import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireStaff, SaaSError } from '@/lib/saas/context'
import { ControlNavigation } from '@/components/admin/ControlNavigation'
export const dynamic = 'force-dynamic'
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let staff
  try { staff = await requireStaff() }
  catch(error) {
    if (error instanceof SaaSError && error.code === 'UNAUTHENTICATED') redirect('/auth/login')
    if (error instanceof SaaSError && error.code === 'MFA_REQUIRED') redirect('/auth/mfa?next=/admin')
    return <main className="mx-auto max-w-xl p-12"><h1 className="text-xl font-semibold">Platform access required</h1><p className="my-4 text-sm text-slate-600">{error instanceof Error ? error.message : 'Administration is unavailable.'}</p><Link className="text-blue-600" href="/overview">Return to your workspace</Link></main>
  }
  return <div className="flex min-h-screen bg-[#f7f9fc] text-slate-900"><ControlNavigation email={staff.email || ''} role={staff.role_key}/><div className="min-w-0 flex-1"><header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-6"><span className="text-sm font-medium">Vittain · Control plane</span><Link href="/overview" className="text-xs text-slate-500 hover:text-blue-600">Customer workspace ↗</Link></header><main className="p-5 lg:p-8">{children}</main></div></div>
}
