import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface MultiStepIndicatorProps {
  steps: string[]
  currentStep: number // 1-indexed
}

export function MultiStepIndicator({ steps, currentStep }: MultiStepIndicatorProps) {
  return (
    <div className="w-full flex items-center justify-between relative mb-8">
      {/* Background Track */}
      <div className="absolute top-1/2 left-0 w-full h-[2px] bg-surface-border -translate-y-1/2 z-0" />
      
      {/* Active Track */}
      <div 
        className="absolute top-1/2 left-0 h-[2px] bg-accent -translate-y-1/2 z-0 transition-all duration-300 ease-in-out" 
        style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
      />
      
      {steps.map((step, idx) => {
        const stepNum = idx + 1
        const isActive = stepNum === currentStep
        const isDone = stepNum < currentStep

        return (
          <div key={idx} className="relative z-10 flex flex-col items-center gap-2">
            <div 
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
                isActive ? "bg-accent text-white border-2 border-surface ring-4 ring-accent/20" : 
                isDone ? "bg-accent text-white border-2 border-surface" : 
                "bg-surface border-2 border-surface-border text-ink-muted"
              )}
            >
              {isDone ? <Check className="w-4 h-4" /> : stepNum}
            </div>
            <span className={cn(
              "text-[10px] font-medium uppercase tracking-wider absolute -bottom-6 w-24 text-center",
              isActive ? "text-ink" : "text-ink-muted"
            )}>
              {step}
            </span>
          </div>
        )
      })}
    </div>
  )
}
