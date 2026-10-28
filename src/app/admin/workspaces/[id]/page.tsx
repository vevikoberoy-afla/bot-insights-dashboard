import { ControlPlane } from '@/components/admin/ControlPlane'
export default async function Page(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  return <ControlPlane view="workspace" workspace={params.id}/>
}
