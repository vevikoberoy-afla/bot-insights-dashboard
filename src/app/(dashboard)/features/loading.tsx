import {FeatureSkeleton} from '@/components/features/FeaturePrimitives'

export default function FeaturesLoading(){return <div className="mx-auto max-w-7xl space-y-5 p-6" aria-label="Loading feature"><div className="h-3 w-24 animate-pulse rounded bg-slate-100"/><div className="h-8 w-72 animate-pulse rounded-lg bg-slate-100"/><div className="h-10 w-full animate-pulse rounded-xl bg-slate-50"/><FeatureSkeleton/></div>}
