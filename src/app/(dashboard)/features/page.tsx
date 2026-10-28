import StorefrontHub from '@/components/features/StorefrontHub'
export default async function MyStorePage({searchParams}:{searchParams:Promise<{store?:string}>}){const query=await searchParams;return <StorefrontHub initialStoreId={query.store||''}/>}
