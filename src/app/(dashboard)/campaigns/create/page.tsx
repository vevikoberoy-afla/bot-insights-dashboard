'use client'
import { useState, useEffect } from 'react'
import { MultiStepIndicator } from '@/components/shared/multi-step-indicator'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { MessageCircle, Smartphone, Mail, UploadCloud, Users, Filter, Check, ArrowRight, ArrowLeft, Calendar, Send, Hash, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {fetchDashboardData,readDashboardData} from '@/lib/client/featureDataCache'

const STEPS = ['Basics & Channel', 'Audience', 'Message Design', 'Schedule & Launch']

export default function CreateCampaignWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  
  // Master State
  const [form, setForm] = useState({
    name: '',
    type: 'one_off',
    channel: '',
    channelAccount: '', // the selected integration instance ID
    audienceMode: 'segment',
    messageBody: '',
    schedule: 'now',
    agreeCompliance: false
  })

  const cachedIntegrations=readDashboardData<any[]>('/api/integrations')
  const [channelIntegrations, setChannelIntegrations] = useState<any[]>(cachedIntegrations||[])
  const [loadingIntegrations, setLoadingIntegrations] = useState(!cachedIntegrations)

  useEffect(() => {
    async function loadIntegrations() {
      setLoadingIntegrations(true)
      try {setChannelIntegrations(await fetchDashboardData<any[]>('/api/integrations'))} catch {}
      setLoadingIntegrations(false)
    }
    loadIntegrations()
  }, [])

  function next() {
    if (step === 1) {
      if (!form.name.trim()) { toast.error("Campaign name is required"); return }
      if (!form.channel) { toast.error("Please select a channel"); return }
    }
    if (step === 3 && !form.messageBody.trim() && form.channel !== 'whatsapp') { 
      toast.error("Message body is required"); return 
    }
    if (step < 4) setStep(s => s + 1)
  }
  function prev() { if (step > 1) setStep(s => s - 1) }
  function chooseChannel(channel:string) {
    if(channel==='email'){
      sessionStorage.setItem('email-campaign-draft-name',form.name.trim())
      router.push('/campaigns/email?compose=1')
      return
    }
    setForm({...form,channel,channelAccount:''})
  }

  async function handleLaunch() {
    if (!form.agreeCompliance) {
      toast.error("You must agree to the compliance terms to launch.")
      return
    }
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      toast.success("Campaign launched successfully!")
      router.push('/campaigns/all')
    }, 1500)
  }

  return (
    <div className="max-w-5xl mx-auto pb-20 animate-in fade-in duration-500">
      <PageHeader 
        title="Create Campaign" 
        description="Launch an automated multi-channel outreach sequence." 
      />
      
      <div className="bg-surface border border-surface-border rounded-xl p-8 shadow-sm">
        <MultiStepIndicator steps={STEPS} currentStep={step} />
        
        <div className="mt-12 min-h-[500px]">
          {/* STEP 1: BASICS & CHANNEL */}
          {step === 1 && (
            <div className="space-y-8 max-w-2xl mx-auto animate-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold text-ink">Campaign Basics</h2>
                <p className="text-sm text-ink-secondary mt-1">Start by naming your campaign and choosing a channel.</p>
              </div>
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs uppercase tracking-wider text-ink-secondary">Campaign Name</Label>
                    <Input 
                      placeholder="e.g. Q4 Black Friday Promo" 
                      value={form.name}
                      onChange={(e) => setForm({...form, name: e.target.value})}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <Label className="text-xs uppercase tracking-wider text-ink-secondary">Campaign Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({...form, type: v})}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one_off">One-off Broadcast</SelectItem>
                        <SelectItem value="drip">Multi-step Drip / Journey</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                  <div className="space-y-3 pt-6 border-t border-surface-border">
                  <Label className="text-xs uppercase tracking-wider text-ink-secondary">Delivery Channel</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      { id: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, desc: 'High open rates · Templates required' },
                      { id: 'email', name: 'Email', icon: Mail, desc: 'Templates · Final preview · Opt-in only' },
                      { id: 'sms', name: 'SMS', icon: Smartphone, desc: 'Direct alerts · 160 chars' },
                      { id: 'telegram', name: 'Telegram', icon: Send, desc: 'Bot broadcasts · No limits' },
                      { id: 'slack', name: 'Slack', icon: Hash, desc: 'Internal team messaging' },
                    ].map((ch) => {
                      const isSelected = form.channel === ch.id
                      const Icon = ch.icon
                      return (
                        <div 
                          key={ch.id}
                          onClick={() => chooseChannel(ch.id)}
                          className={cn(
                            "relative flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all text-center gap-2 group",
                            isSelected ? "border-accent bg-accent/5" : "border-surface-border hover:border-accent/40 bg-surface hover:bg-surface-muted"
                          )}
                        >
                          {isSelected && (
                            <div className="absolute top-2 right-2 bg-accent text-white rounded-full p-0.5 animate-in zoom-in">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-colors", isSelected ? "bg-accent text-white" : "bg-surface-border text-ink-secondary group-hover:bg-accent/10 group-hover:text-accent")}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-ink">{ch.name}</p>
                            <p className="text-[10px] text-ink-muted mt-0.5 leading-tight">{ch.desc}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Account picker — appears after channel is chosen */}
                  {form.channel && form.channel !== 'email' && (() => {
                    const available = channelIntegrations.filter(i => i.channel === form.channel)
                    return (
                      <div className="mt-4 p-5 bg-surface-muted border border-surface-border rounded-xl animate-in fade-in zoom-in-95">
                        <h4 className="text-sm font-bold text-ink mb-1 capitalize">Select {form.channel} Instance</h4>
                        <p className="text-xs text-ink-muted mb-3">Choose which connected account to send from.</p>
                        {loadingIntegrations ? (
                          <p className="text-xs text-ink-muted">Loading...</p>
                        ) : available.length === 0 ? (
                          <div className="text-center py-4 border border-dashed border-surface-border rounded-lg">
                            <p className="text-xs text-ink-secondary mb-2">No {form.channel} accounts connected yet.</p>
                            <a href="/settings/integrations" target="_blank" className="text-xs text-accent hover:underline font-medium">
                              → Go to Integrations to add one
                            </a>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {available.map((inst: any) => (
                              <div
                                key={inst.id}
                                onClick={() => setForm(f => ({ ...f, channelAccount: inst.id }))}
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-surface transition-colors",
                                  form.channelAccount === inst.id ? 'border-accent bg-accent/5' : 'border-surface-border bg-surface'
                                )}
                              >
                                <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0", form.channelAccount === inst.id ? 'border-accent' : 'border-ink-muted')}>
                                  {form.channelAccount === inst.id && <div className="w-2 h-2 rounded-full bg-accent" />}
                                </div>
                                <div>
                                  <span className="text-sm text-ink font-medium">{inst.instance_name}</span>
                                  <span className="text-xs text-ink-muted ml-2 capitalize">{inst.status}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: AUDIENCE */}
          {step === 2 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold text-ink">Target Audience</h2>
                <p className="text-sm text-ink-secondary mt-1">Who should receive this campaign?</p>
              </div>

              <div className="grid grid-cols-5 gap-8">
                {/* Left Side: Audience Selector */}
                <div className="col-span-3 space-y-6">
                  <div className="flex bg-surface-muted p-1 rounded-xl border border-surface-border">
                    {[
                      { id: 'segment', label: 'Saved Segments' },
                      { id: 'filter', label: 'Build Filter' },
                      { id: 'upload', label: 'Upload CSV' },
                      { id: 'all', label: 'All Contacts' }
                    ].map(mode => (
                      <button 
                        key={mode.id}
                        onClick={() => setForm({...form, audienceMode: mode.id})}
                        className={`flex-1 px-3 py-2 text-[13px] font-medium rounded-lg transition-colors ${form.audienceMode === mode.id ? 'bg-surface border border-surface-border text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {form.audienceMode === 'segment' && (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase tracking-wider text-ink-secondary">Select a Saved Segment</Label>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="border-2 border-accent bg-accent/5 rounded-xl p-4 cursor-pointer relative flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center text-accent"><Users className="w-5 h-5" /></div>
                            <div>
                              <h4 className="font-bold text-ink text-sm">Hot Leads (Score &gt; 80)</h4>
                              <p className="text-[11px] text-ink-secondary">Highly engaged contacts who haven't purchased.</p>
                            </div>
                          </div>
                          <div className="text-right mr-6">
                            <p className="text-sm font-bold text-accent">342</p>
                            <p className="text-[10px] text-ink-muted uppercase">Contacts</p>
                          </div>
                          <div className="absolute top-1/2 -translate-y-1/2 right-3 bg-accent text-white rounded-full p-0.5"><Check className="w-3 h-3" /></div>
                        </div>
                        <div className="border-2 border-surface-border bg-surface hover:border-accent/40 rounded-xl p-4 cursor-pointer transition-colors flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-surface-muted rounded-full flex items-center justify-center text-ink-muted"><Filter className="w-5 h-5" /></div>
                            <div>
                              <h4 className="font-bold text-ink text-sm">VIP Buyers</h4>
                              <p className="text-[11px] text-ink-secondary">Total spend &gt; 5000</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-ink">128</p>
                            <p className="text-[10px] text-ink-muted uppercase">Contacts</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {form.audienceMode === 'filter' && (
                    <div className="space-y-4">
                      <div className="bg-surface border border-surface-border rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <Filter className="w-5 h-5 text-ink-secondary" />
                          <h4 className="font-medium text-ink text-sm">Logic Builder</h4>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 p-2 bg-surface-muted rounded-lg border border-surface-border">
                            <span className="text-[10px] font-bold text-ink-muted w-10 text-center uppercase">WHEN</span>
                            <Select defaultValue="cart_updated">
                              <SelectTrigger className="w-[140px] h-8 text-xs bg-surface"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cart_updated">Event: cart_updated</SelectItem>
                                <SelectItem value="status">Property: lead_status</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select defaultValue=">=">
                              <SelectTrigger className="w-[80px] h-8 text-xs bg-surface"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value=">=">&gt;=</SelectItem><SelectItem value="=">=</SelectItem></SelectContent>
                            </Select>
                            <Input defaultValue="1500" className="h-8 text-xs flex-1" />
                          </div>
                          <div className="flex items-center gap-2 p-2 bg-surface-muted rounded-lg border border-surface-border">
                            <span className="text-[10px] font-bold text-blue-500 w-10 text-center uppercase">AND</span>
                            <Select defaultValue="purchases">
                              <SelectTrigger className="w-[140px] h-8 text-xs bg-surface"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="purchases">Property: total_purchases</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select defaultValue="=">
                              <SelectTrigger className="w-[80px] h-8 text-xs bg-surface"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="=">=</SelectItem></SelectContent>
                            </Select>
                            <Input defaultValue="0" className="h-8 text-xs flex-1" />
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="mt-3 text-xs text-accent font-semibold">+ Add condition</Button>
                      </div>
                    </div>
                  )}

                  {form.audienceMode === 'upload' && (
                    <div className="border-2 border-dashed border-surface-border rounded-xl p-12 text-center hover:bg-surface-muted transition-colors cursor-pointer">
                      <div className="w-16 h-16 bg-surface border border-surface-border rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <UploadCloud className="w-8 h-8 text-ink-muted" />
                      </div>
                      <h3 className="text-base font-bold text-ink">Upload CSV File</h3>
                      <p className="text-sm text-ink-secondary mt-2 max-w-sm mx-auto">Upload a spreadsheet containing phone numbers, emails, and custom variables.</p>
                      <Button className="mt-6 bg-surface-muted text-ink border border-surface-border hover:bg-surface-subtle h-9 text-xs">Select File</Button>
                    </div>
                  )}

                  {form.audienceMode === 'all' && (
                    <div className="border-2 border-surface-border rounded-xl p-8 text-center bg-surface">
                      <div className="w-16 h-16 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="w-8 h-8 text-blue-500" />
                      </div>
                      <h3 className="text-base font-bold text-ink">All Contacts</h3>
                      <p className="text-sm text-ink-secondary mt-1">Send to everyone in your database who has not unsubscribed.</p>
                    </div>
                  )}
                </div>

                {/* Right Side: Audience Preview Panel */}
                <div className="col-span-2">
                  <div className="bg-surface border border-surface-border rounded-xl p-5 shadow-sm sticky top-4">
                    <h3 className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-4">Audience Preview</h3>
                    
                    <div className="text-center py-6 border-b border-surface-border">
                      <p className="text-4xl font-black text-ink">
                        {form.audienceMode === 'segment' ? '342' : form.audienceMode === 'all' ? '2,450' : form.audienceMode === 'upload' ? '0' : '1,824'}
                      </p>
                      <p className="text-xs text-ink-secondary mt-1">Estimated total reach</p>
                    </div>

                    <div className="py-4 border-b border-surface-border space-y-3">
                      <p className="text-[10px] font-bold text-ink-muted uppercase">Channel Reach Breakdown</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5 text-green-500" /> WhatsApp</span>
                          <span className="font-semibold text-ink">287</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-blue-500" /> Email</span>
                          <span className="font-semibold text-ink">340</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5 text-orange-500" /> SMS</span>
                          <span className="font-semibold text-ink">156</span>
                        </div>
                      </div>
                    </div>

                    <div className="py-4">
                      <p className="text-[10px] font-bold text-ink-muted uppercase mb-3">Sample Contacts</p>
                      <div className="space-y-3">
                        {[
                          { name: 'Alex Johnson', detail: '+1 555-0192' },
                          { name: 'Sarah Miller', detail: 'sarah@example.com' },
                          { name: 'David Chen', detail: '+1 555-8832' }
                        ].map((c, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-7 h-7 bg-surface-muted rounded-full flex items-center justify-center text-[10px] font-bold text-ink-secondary">{c.name.charAt(0)}</div>
                            <div>
                              <p className="text-xs font-semibold text-ink">{c.name}</p>
                              <p className="text-[10px] text-ink-muted">{c.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {form.audienceMode === 'filter' && (
                      <div className="mt-4 pt-4 border-t border-surface-border">
                        <Button variant="outline" className="w-full h-8 text-xs bg-surface-muted">Save as Segment</Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: MESSAGE */}
          {step === 3 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
               <div className="text-center mb-8">
                <h2 className="text-xl font-bold text-ink">Design Message</h2>
                <p className="text-sm text-ink-secondary mt-1">Craft what your audience will see.</p>
              </div>
              
              <div className="grid grid-cols-5 gap-8">
                {/* Editor Side */}
                <div className="col-span-3 space-y-6">
                  {form.channel === 'whatsapp' ? (
                    <div className="space-y-4">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <p className="text-xs font-medium text-amber-800">WhatsApp requires using a pre-approved template for initial outreach.</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Select WhatsApp Template</Label>
                        <Select>
                          <SelectTrigger className="h-11"><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="t1">Black Friday Promo (Approved)</SelectItem>
                            <SelectItem value="t2">Re-engagement Hello (Approved)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="p-4 border border-surface-border rounded-xl bg-surface-muted">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-secondary mb-4">Variable Mapping</h4>
                        <div className="space-y-3">
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-mono font-medium text-ink bg-surface border border-surface-border px-2 py-1 rounded">{"{{1}}"}</span>
                            <span className="text-xs text-ink-muted">maps to</span>
                            <Select defaultValue="first_name">
                              <SelectTrigger className="h-8 bg-surface"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="first_name">Contact: First Name</SelectItem></SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>{form.channel === 'email' ? 'Subject Line' : 'Message Body'}</Label>
                        {form.channel === 'email' && <Input placeholder="Special offer inside!" className="mb-4" />}
                        <div className="border border-surface-border rounded-xl overflow-hidden">
                          <div className="bg-surface-muted p-2 border-b border-surface-border flex gap-1">
                            <Button variant="ghost" size="sm" className="h-8 text-xs font-medium">B</Button>
                            <Button variant="ghost" size="sm" className="h-8 text-xs font-medium">I</Button>
                            <div className="w-px h-4 bg-surface-border my-auto mx-1" />
                            <Button variant="ghost" size="sm" className="h-8 text-xs text-accent">{"{ }"} Add Variable</Button>
                          </div>
                          <Textarea 
                            placeholder={form.channel === 'sms' ? "Type your SMS message..." : "Write your email content..."}
                            className="border-0 focus-visible:ring-0 resize-none rounded-none p-4" 
                            rows={12}
                            value={form.messageBody}
                            onChange={(e) => setForm({...form, messageBody: e.target.value})}
                          />
                        </div>
                        {form.channel === 'sms' && (
                          <p className="text-xs text-ink-secondary text-right">{form.messageBody.length} / 160 characters (1 SMS)</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview Side */}
                <div className="col-span-2">
                  <div className="sticky top-4 border border-surface-border bg-surface-muted rounded-3xl p-2 shadow-sm h-[500px] flex flex-col mx-auto max-w-[320px]">
                    <div className="flex justify-center p-2">
                      <div className="w-16 h-1.5 bg-surface-border rounded-full" />
                    </div>
                    <div className="flex-1 bg-white rounded-2xl m-2 overflow-hidden border border-surface-border flex flex-col">
                      <div className="bg-surface border-b border-surface-border p-3 text-center">
                        <p className="text-xs font-semibold text-ink">Preview</p>
                      </div>
                      <div className="flex-1 p-4 bg-[#E5DDD5] relative">
                        {form.channel === 'whatsapp' ? (
                          <div className="bg-white rounded-lg rounded-tl-none p-3 shadow-sm max-w-[85%] text-sm text-[#111B21] relative">
                            Hi Alex, our Black Friday sale is live! Get 50% off all premium plans.
                            <div className="text-[10px] text-gray-400 text-right mt-1">10:42 AM</div>
                          </div>
                        ) : form.channel === 'sms' ? (
                          <div className="bg-[#E9E9EB] rounded-2xl rounded-bl-sm p-3 max-w-[85%] text-[15px] text-black">
                            {form.messageBody || "Your SMS preview will appear here."}
                          </div>
                        ) : (
                          <div className="bg-white border border-surface-border p-4 h-full text-sm">
                            {form.messageBody || "Email content preview..."}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: SCHEDULE & REVIEW */}
          {step === 4 && (
            <div className="space-y-8 max-w-3xl mx-auto animate-in slide-in-from-right-4 duration-300">
               <div className="text-center mb-8">
                <h2 className="text-xl font-bold text-ink">Review & Schedule</h2>
                <p className="text-sm text-ink-secondary mt-1">Almost there. Double check your settings.</p>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="bg-surface border border-surface-border rounded-xl p-5 shadow-sm space-y-4">
                    <h3 className="font-bold text-ink border-b border-surface-border pb-2">Campaign Summary</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-ink-secondary">Name</span>
                        <span className="text-sm font-medium text-ink">{form.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-ink-secondary">Channel</span>
                        <span className="text-sm font-medium text-ink capitalize">{form.channel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-ink-secondary">Audience</span>
                        <span className="text-sm font-medium text-ink">All Customers (2,450)</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface border border-surface-border rounded-xl p-5 shadow-sm space-y-4">
                    <h3 className="font-bold text-ink border-b border-surface-border pb-2">Schedule</h3>
                    <div className="flex gap-4">
                      <label className={`flex-1 p-3 rounded-lg border cursor-pointer flex flex-col items-center justify-center gap-2 transition-colors ${form.schedule === 'now' ? 'bg-accent/5 border-accent' : 'bg-surface border-surface-border hover:bg-surface-muted'}`}>
                        <input type="radio" name="schedule" checked={form.schedule === 'now'} onChange={() => setForm({...form, schedule: 'now'})} className="sr-only" />
                        <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center"><ArrowRight className="w-4 h-4" /></div>
                        <span className="text-sm font-medium">Send Now</span>
                      </label>
                      <label className={`flex-1 p-3 rounded-lg border cursor-pointer flex flex-col items-center justify-center gap-2 transition-colors ${form.schedule === 'later' ? 'bg-accent/5 border-accent' : 'bg-surface border-surface-border hover:bg-surface-muted'}`}>
                        <input type="radio" name="schedule" checked={form.schedule === 'later'} onChange={() => setForm({...form, schedule: 'later'})} className="sr-only" />
                        <div className="w-8 h-8 rounded-full bg-surface-muted border border-surface-border text-ink-secondary flex items-center justify-center"><Calendar className="w-4 h-4" /></div>
                        <span className="text-sm font-medium">Schedule Later</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                    <h3 className="font-bold text-amber-900 mb-2">Compliance & Safety</h3>
                    <p className="text-sm text-amber-800/80 mb-4 leading-relaxed">
                      By sending this campaign, you confirm that all recipients have explicitly opted-in to receive messages from your business in accordance with local regulations (TCPA, GDPR, etc).
                    </p>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={form.agreeCompliance} 
                        onChange={e => setForm({...form, agreeCompliance: e.target.checked})}
                        className="mt-1 w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-600" 
                      />
                      <span className="text-sm font-medium text-amber-900">I agree and confirm consent.</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Footer */}
        <div className="mt-8 pt-6 border-t border-surface-border flex items-center justify-between">
          <Button variant="ghost" onClick={prev} disabled={step === 1} className="text-ink-secondary">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          
          {step < 4 ? (
            <Button onClick={next} className="bg-ink hover:bg-ink-secondary text-white h-11 px-8 rounded-xl font-medium">
              Continue <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleLaunch} disabled={loading || !form.agreeCompliance} className="bg-accent hover:bg-accent-hover text-white h-11 px-8 rounded-xl font-medium shadow-sm shadow-accent/20">
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <>Launch Campaign 🚀</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
