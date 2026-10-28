import {notFound} from 'next/navigation'
import {ControlPlane} from '@/components/admin/ControlPlane'
import {FounderDashboard} from '@/components/master-admin/FounderDashboard'
import {FounderPaymentControls} from '@/components/master-admin/FounderPaymentControls'
const sections:Record<string,string>={plans:'plans',users:'users',subscriptions:'subscriptions',usage:'usage',support:'support',integrations:'integrations',operations:'jobs',releases:'releases',security:'security',audit:'audit'}
export default async function Page(props:{params: Promise<{section:string}>}) {
  const params = await props.params;
  if(params.section==='payments')return <FounderPaymentControls/>;
  if(['accounts','pulse','health','broadcasts','enterprise','settings','access-requests'].includes(params.section))return <FounderDashboard view={params.section}/>;const view=sections[params.section];if(!view)notFound();return <ControlPlane view={view} founder/>
}
