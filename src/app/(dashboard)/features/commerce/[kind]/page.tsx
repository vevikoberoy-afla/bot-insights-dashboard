import CommerceDashboard from '@/components/features/CommerceDashboard'
export default async function CommercePage(props:{params: Promise<{kind:string}>}) {
  const params = await props.params;
  const kind=params.kind==='order'?'orders':params.kind==='product'?'catalogue':params.kind
  return <CommerceDashboard kind={kind}/>
}
