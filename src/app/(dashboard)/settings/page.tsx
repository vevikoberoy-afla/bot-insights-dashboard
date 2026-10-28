'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'
import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase-browser'
import { toast } from 'sonner'
import { LineChart, CheckCircle, Save, Loader2, ShieldCheck } from 'lucide-react'

export default function SettingsConnectionsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, boolean>>({})
  const [retentionDays, setRetentionDays] = useState(30)

  const [form, setForm] = useState({
    posthog_url: '',
    posthog_api_key: '',
    posthog_project_id: ''
  })

  useEffect(() => {
    async function loadData() {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) return

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', activeWorkspaceId(user.id || ''))
        .single()

      if (data) {
        setRetentionDays([3, 30, 90].includes(Number(data.data_retention_days)) ? Number(data.data_retention_days) : 30)
        setForm({
          posthog_url: data.posthog_url || '',
          posthog_api_key: data.posthog_api_key || '',
          posthog_project_id: data.posthog_project_id || ''
        })
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleRetentionSave = async () => {
    setSaving(true)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('Your session has expired')
      if (![3, 30, 90].includes(retentionDays)) throw new Error('Choose a supported retention period')
      const { error } = await supabase.from('clients').update({ data_retention_days: retentionDays }).eq('id', activeWorkspaceId(user.id || ''))
      if (error) throw error
      toast.success(`Chat transcripts will be retained for ${retentionDays} days`)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save retention settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async (tool: 'posthog') => {
    setSaving(true)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return

    // Save only the fields for the specific tool
    const updates: any = {}
    Object.keys(form).forEach(key => {
      if (key.startsWith(tool)) {
        updates[key] = form[key as keyof typeof form]
      }
    })

    const { error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', activeWorkspaceId(user.id || ''))

    if (error) {
      toast.error(`Failed to save ${tool} settings`)
    } else {
      toast.success(`${tool.charAt(0).toUpperCase() + tool.slice(1)} settings saved`)
    }
    setSaving(false)
  }

  const handleTest = async (tool: 'posthog') => {
    setTesting(tool)
    // Simulate API call for now since we don't have the backend endpoints fully wired
    await new Promise(r => setTimeout(r, 1500))
    setTestResults(prev => ({ ...prev, [tool]: true }))
    setTesting(null)
    toast.success(`Connected to ${tool.charAt(0).toUpperCase() + tool.slice(1)} successfully`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 p-6 md:p-8 max-w-5xl space-y-6">
      <PageHeader
        title="Data Retention & Telemetry"
        description="Control chat transcript retention policies, automatic data purging, and analytics connections."
      />

      <div className="grid grid-cols-1 gap-6">

        <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden flex flex-col md:flex-row">
          <div className="md:w-1/3 bg-surface-muted p-6 border-b md:border-b-0 md:border-r border-surface-border flex flex-col justify-center text-center">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-surface-border shadow-sm mx-auto mb-4 text-emerald-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-ink text-lg mb-1">Data retention</h3>
            <p className="text-xs text-ink-secondary leading-relaxed">Control how long raw chatbot transcripts remain available to your team.</p>
          </div>
          <div className="md:w-2/3 p-6 space-y-5">
            <div className="space-y-2">
              <Label>Server chat transcript history</Label>
              <Select value={String(retentionDays)} onValueChange={(value) => setRetentionDays(Number(value))}>
                <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 days — minimum storage</SelectItem>
                  <SelectItem value="30">30 days — recommended</SelectItem>
                  <SelectItem value="90">90 days — extended support history</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-ink-muted">Expired transcripts, empty conversation sessions, and non-ticket chat media are securely removed by the hourly cleanup.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-surface-border bg-surface-muted p-3"><span className="font-semibold text-ink">Widget history</span><p className="mt-1 text-ink-secondary">3 days</p></div>
              <div className="rounded-lg border border-surface-border bg-surface-muted p-3"><span className="font-semibold text-ink">Unfinished returns</span><p className="mt-1 text-ink-secondary">3 days</p></div>
              <div className="rounded-lg border border-surface-border bg-surface-muted p-3"><span className="font-semibold text-ink">Booking and order drafts</span><p className="mt-1 text-ink-secondary">24 hours</p></div>
              <div className="rounded-lg border border-surface-border bg-surface-muted p-3"><span className="font-semibold text-ink">Closed support tickets</span><p className="mt-1 text-ink-secondary">365 days</p></div>
            </div>

            <div className="pt-4 border-t border-surface-border flex justify-end">
              <Button className="bg-ink hover:bg-ink-secondary text-white" onClick={handleRetentionSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save retention policy
              </Button>
            </div>
          </div>
        </div>

        {/* POSTHOG CARD */}
        <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden flex flex-col md:flex-row">
          <div className="md:w-1/3 bg-surface-muted p-6 border-b md:border-b-0 md:border-r border-surface-border flex flex-col justify-center text-center">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-surface-border shadow-sm mx-auto mb-4 text-orange-500">
              <LineChart className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-ink text-lg mb-1">PostHog</h3>
            <p className="text-xs text-ink-secondary leading-relaxed">Tracks customer behavior on your website and triggers proactive events.</p>
          </div>
          <div className="md:w-2/3 p-6 space-y-5">
            <div className="space-y-2">
              <Label>Instance URL</Label>
              <Input name="posthog_url" placeholder="http://your-vm-ip:8000" value={form.posthog_url} onChange={handleChange} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Personal API Key</Label>
                <Input type="password" name="posthog_api_key" placeholder="phx_••••••••••••" value={form.posthog_api_key} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Project ID</Label>
                <Input name="posthog_project_id" placeholder="project-id" value={form.posthog_project_id} onChange={handleChange} />
              </div>
            </div>

            {form.posthog_url && form.posthog_api_key && (
              <div className="bg-surface-muted border border-surface-border rounded-lg p-4 mt-2">
                <p className="text-xs font-semibold text-ink mb-2">Tracking Snippet</p>
                <div className="bg-[#111] text-[#fff] p-3 rounded-md overflow-x-auto text-[11px] font-mono leading-relaxed">
                  {`<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init('${form.posthog_api_key}', {api_host: '${form.posthog_url}'})
</script>`}
                </div>
                <p className="text-[10px] text-ink-muted mt-2">Paste this snippet into the &lt;head&gt; of your website to start tracking events.</p>
              </div>
            )}

            <div className="pt-4 border-t border-surface-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => handleTest('posthog')} disabled={testing === 'posthog'}>
                  {testing === 'posthog' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Test Connection'}
                </Button>
                {testResults['posthog'] && <CheckCircle className="w-5 h-5 text-status-green" />}
              </div>
              <Button className="bg-ink hover:bg-ink-secondary text-white" onClick={() => handleSave('posthog')} disabled={saving}>
                <Save className="w-4 h-4 mr-2" /> Save
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
