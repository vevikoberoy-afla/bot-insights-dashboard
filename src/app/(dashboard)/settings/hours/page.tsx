'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Clock } from 'lucide-react'
import { toast } from 'sonner'

const DAYS = [
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' },
  { id: 'sun', label: 'Sunday' },
]

export default function BusinessHoursPage() {
  const [timezone, setTimezone] = useState('America/New_York')
  const [awayMessage, setAwayMessage] = useState("We're currently offline. Please leave a message and our team will get back to you during business hours.")
  const [botHandlesOutHours, setBotHandlesOutHours] = useState(true)

  const [hours, setHours] = useState(
    DAYS.reduce((acc, day) => {
      const isWeekend = day.id === 'sat' || day.id === 'sun'
      acc[day.id] = {
        active: !isWeekend,
        start: '09:00',
        end: '17:00'
      }
      return acc
    }, {} as Record<string, { active: boolean, start: string, end: string }>)
  )

  const handleSave = () => {
    toast.success("Business hours saved successfully")
  }

  const toggleDay = (dayId: string) => {
    setHours(prev => ({
      ...prev,
      [dayId]: { ...prev[dayId], active: !prev[dayId].active }
    }))
  }

  const updateTime = (dayId: string, field: 'start' | 'end', value: string) => {
    setHours(prev => ({
      ...prev,
      [dayId]: { ...prev[dayId], [field]: value }
    }))
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12 max-w-4xl mx-auto">
      <PageHeader title="Business Hours" description="Configure when your human agents are available." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left Column - Schedule */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-surface border border-surface-border rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-6 pb-6 border-b border-surface-border">
              <div>
                <h3 className="font-semibold text-ink">Weekly Schedule</h3>
                <p className="text-xs text-ink-secondary mt-1">Set your standard operating hours.</p>
              </div>
              <div className="w-64">
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger><SelectValue placeholder="Select timezone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time (US & Canada)</SelectItem>
                    <SelectItem value="America/Chicago">Central Time (US & Canada)</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time (US & Canada)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time (US & Canada)</SelectItem>
                    <SelectItem value="Europe/London">London</SelectItem>
                    <SelectItem value="Europe/Paris">Central European Time</SelectItem>
                    <SelectItem value="Asia/Kolkata">India Standard Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              {DAYS.map((day) => {
                const config = hours[day.id]
                return (
                  <div key={day.id} className="flex items-center justify-between group">
                    <div className="flex items-center gap-4 w-32">
                      <Switch checked={config.active} onCheckedChange={() => toggleDay(day.id)} />
                      <span className={`text-sm font-medium ${config.active ? 'text-ink' : 'text-ink-muted line-through'}`}>
                        {day.label}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <input 
                        type="time" 
                        value={config.start}
                        onChange={(e) => updateTime(day.id, 'start', e.target.value)}
                        disabled={!config.active}
                        className="h-9 px-3 rounded-md border border-surface-border bg-surface text-sm disabled:opacity-50 disabled:bg-surface-muted"
                      />
                      <span className="text-ink-muted text-sm">to</span>
                      <input 
                        type="time" 
                        value={config.end}
                        onChange={(e) => updateTime(day.id, 'end', e.target.value)}
                        disabled={!config.active}
                        className="h-9 px-3 rounded-md border border-surface-border bg-surface text-sm disabled:opacity-50 disabled:bg-surface-muted"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Column - Out of hours behavior */}
        <div className="space-y-6">
          <div className="bg-surface border border-surface-border rounded-xl shadow-sm p-6">
            <h3 className="font-semibold text-ink flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-accent" /> Outside Hours Behavior
            </h3>
            
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label>AI Autopilot</Label>
                  <p className="text-[11px] text-ink-muted mt-1 leading-relaxed">
                    Allow the AI bot to continue handling queries outside business hours instead of instantly sending the away message.
                  </p>
                </div>
                <Switch checked={botHandlesOutHours} onCheckedChange={setBotHandlesOutHours} />
              </div>

              <div className="space-y-2 pt-4 border-t border-surface-border">
                <Label>Away Message</Label>
                <Textarea 
                  rows={5} 
                  className="resize-none text-sm"
                  value={awayMessage}
                  onChange={e => setAwayMessage(e.target.value)}
                />
                <p className="text-[10px] text-ink-muted">This will be sent when the bot hands off to a human, or instantly if AI Autopilot is disabled.</p>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="mt-8 pt-6 border-t border-surface-border flex justify-end">
        <Button className="bg-ink hover:bg-ink-secondary text-white" onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" /> Save Business Hours
        </Button>
      </div>

    </div>
  )
}
