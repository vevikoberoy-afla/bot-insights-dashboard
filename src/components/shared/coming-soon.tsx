import { PageHeader } from '@/components/shared/page-header'
import { Construction } from 'lucide-react'

interface ComingSoonProps {
  title: string
  description?: string
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12">
      <PageHeader title={title} description={description || "We are currently building this feature."} />
      
      <div className="flex-1 bg-surface border border-surface-border rounded-xl shadow-sm flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-surface-muted border border-surface-border flex items-center justify-center mb-6">
          <Construction className="w-8 h-8 text-ink-muted" />
        </div>
        <h2 className="text-xl font-semibold text-ink">Coming Soon</h2>
        <p className="text-sm text-ink-secondary mt-2 max-w-sm">
          The <strong>{title}</strong> page is currently under construction. Check back soon for updates!
        </p>
      </div>
    </div>
  )
}
