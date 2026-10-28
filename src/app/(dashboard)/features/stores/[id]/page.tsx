import StorefrontHub from '@/components/features/StorefrontHub'

export default async function StoreHomePage({params}:{params:Promise<{id:string}>}){
 const {id}=await params
 return <StorefrontHub initialStoreId={id}/>
}
