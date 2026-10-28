'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

type DayConfig = { open: boolean; start: string; end: string }

const DEFAULT_HOURS: Record<string, DayConfig> = {
  Monday:    { open: true,  start: '09:00', end: '18:00' },
  Tuesday:   { open: true,  start: '09:00', end: '18:00' },
  Wednesday: { open: true,  start: '09:00', end: '18:00' },
  Thursday:  { open: true,  start: '09:00', end: '18:00' },
  Friday:    { open: true,  start: '09:00', end: '18:00' },
  Saturday:  { open: false, start: '10:00', end: '14:00' },
  Sunday:    { open: false, start: '10:00', end: '14:00' },
}

export default function BusinessHoursPage() {
  const [hours, setHours] = useState<Record<string, DayConfig>>(DEFAULT_HOURS)
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [awayMsg, setAwayMsg] = useState("We're currently closed. Leave a message and we'll get back to you during business hours.")
  const [botOutside, setBotOutside] = useState(true)
  const [enabled, setEnabled] = useState(true)

  const update = (day: string, field: keyof DayConfig, val: any) =>
    setHours(p => ({ ...p, [day]: { ...p[day], [field]: val } }))

  const TIMEZONES = ['Asia/Kolkata','America/New_York','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Tokyo','Australia/Sydney']

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 pb-12">
      <PageHeader title="Business Hours" description="Set when your team is available. The bot handles conversations outside these hours." />
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Preview configuration: changes on this screen are not applied to live routing yet.</div>

      <div className="max-w-2xl space-y-6">
        {/* Enable toggle */}
        <div className="bg-surface border border-surface-border rounded-xl p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="font-semibold text-ink">Enable Business Hours</p>
            <p className="text-xs text-ink-muted mt-0.5">When enabled, human handoff is restricted to business hours only</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Timezone */}
        <div className="bg-surface border border-surface-border rounded-xl p-5 shadow-sm">
          <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider block mb-2">Timezone</label>
          <select value={timezone} onChange={e => setTimezone(e.target.value)} className="w-full h-9 border border-surface-border rounded-lg px-3 text-sm bg-surface focus:outline-none focus:ring-1 focus:ring-accent">
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>

        {/* Schedule */}
        <div className={cn('bg-surface border border-surface-border rounded-xl overflow-hidden shadow-sm', !enabled && 'opacity-50 pointer-events-none')}>
          <div className="px-5 py-3.5 border-b border-surface-border bg-surface-muted/30">
            <h3 className="text-sm font-bold text-ink">Weekly Schedule</h3>
          </div>
          <div className="divide-y divide-surface-border">
            {DAYS.map(day => {
              const cfg = hours[day]
              return (
                <div key={day} className="flex items-center gap-5 px-5 py-3.5">
                  <Switch checked={cfg.open} onCheckedChange={v => update(day, 'open', v)} />
                  <span className={cn('w-24 text-sm font-semibold', cfg.open ? 'text-ink' : 'text-ink-muted')}>{day}</span>
                  {cfg.open ? (
                    <div className="flex items-center gap-3">
                      <input type="time" value={cfg.start} onChange={e => update(day, 'start', e.target.value)} className="border border-surface-border rounded-lg px-2 py-1.5 text-sm text-ink bg-surface focus:outline-none focus:ring-1 focus:ring-accent" />
                      <span className="text-ink-muted text-sm">to</span>
                      <input type="time" value={cfg.end} onChange={e => update(day, 'end', e.target.value)} className="border border-surface-border rounded-lg px-2 py-1.5 text-sm text-ink bg-surface focus:outline-none focus:ring-1 focus:ring-accent" />
                    </div>
                  ) : (
                    <span className="text-sm text-ink-muted">Closed</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Away settings */}
        <div className="bg-surface border border-surface-border rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-ink">Outside Hours Behavior</h3>
          <div>
            <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider block mb-1.5">Away Message</label>
            <textarea value={awayMsg} onChange={e => setAwayMsg(e.target.value)} rows={3} className="w-full border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
          </div>
          <div className="flex items-center justify-between py-3 border-t border-surface-border">
            <div>
              <p className="text-sm font-medium text-ink">Allow bot to handle outside hours</p>
              <p className="text-xs text-ink-muted mt-0.5">Human handoff will be disabled — bot handles all conversations</p>
            </div>
            <Switch checked={botOutside} onCheckedChange={setBotOutside} />
          </div>
        </div>

        <Button onClick={() => toast.success('Business hours saved')} className="h-9 bg-ink text-white hover:bg-ink-secondary">
          Save Business Hours
        </Button>
      </div>
    </div>
  )
}
