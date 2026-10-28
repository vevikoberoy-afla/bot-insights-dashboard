import PaymentDashboard from '@/components/features/PaymentDashboard'
export default async function PaymentPage({params}:{params:Promise<{kind:string}>}){const {kind}=await params;return <PaymentDashboard kind={['settings','accounts','transactions'].includes(kind)?kind:'settings'}/>}
