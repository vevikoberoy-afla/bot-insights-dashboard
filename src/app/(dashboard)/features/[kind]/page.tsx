import BookingFeaturesDashboard from '@/components/features/BookingFeaturesDashboard'
import dynamic from 'next/dynamic'
const BookingAnalyticsDashboard=dynamic(()=>import('@/components/features/BookingAnalyticsDashboard'))
export default async function FeaturePage(props:{params: Promise<{kind:string}>}) {
  const params = await props.params;
  return params.kind==='analytics'?<BookingAnalyticsDashboard/>:<BookingFeaturesDashboard kind={params.kind}/>
}
