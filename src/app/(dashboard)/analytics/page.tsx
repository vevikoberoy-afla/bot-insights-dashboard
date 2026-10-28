'use client'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MessageSquare, Users, Bot, Zap, TrendingUp, Calendar, AlertTriangle, ArrowRight, Funnel } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell, ComposedChart, Line
} from 'recharts'

const MOCK_DATA_AREA = [
  { name: 'Mon', conversations: 120, bot: 80, human: 40 },
  { name: 'Tue', conversations: 150, bot: 100, human: 50 },
  { name: 'Wed', conversations: 180, bot: 130, human: 50 },
  { name: 'Thu', conversations: 140, bot: 90, human: 50 },
  { name: 'Fri', conversations: 210, bot: 150, human: 60 },
  { name: 'Sat', conversations: 90, bot: 70, human: 20 },
  { name: 'Sun', conversations: 110, bot: 85, human: 25 },
]

const MOCK_DATA_FUNNEL = [
  { name: 'Sent', value: 10000, fill: '#3b82f6' },
  { name: 'Opened', value: 6500, fill: '#8b5cf6' },
  { name: 'Clicked', value: 2400, fill: '#d946ef' },
  { name: 'Converted', value: 850, fill: '#10b981' },
]

const MOCK_DATA_PIE = [
  { name: 'WhatsApp', value: 400 },
  { name: 'Web Chat', value: 300 },
  { name: 'Email', value: 200 },
]
const COLORS = ['#25D366', '#3b82f6', '#f59e0b']

const KNOWLEDGE_GAPS = [
  { topic: 'International Shipping Rates', count: 142, impact: 'High' },
  { topic: 'Refund Policy for Digital Goods', count: 89, impact: 'Medium' },
  { topic: 'API Rate Limits', count: 45, impact: 'Low' }
]

export default function AnalyticsDashboardPage() {
  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <PageHeader title="Analytics Dashboard" description="Track AI performance, agent efficiency, and campaign reach." className="mb-0" />
        <div className="flex gap-3">
          <Select defaultValue="7d">
            <SelectTrigger className="w-[140px] bg-white"><Calendar className="w-4 h-4 mr-2 text-ink-muted" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 3 Months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="bg-surface shadow-sm border-surface-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-ink-muted uppercase tracking-wider">Total Conversations</CardTitle>
            <MessageSquare className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-ink">1,000</div>
            <p className="text-xs text-status-green flex items-center mt-1"><TrendingUp className="w-3 h-3 mr-1" /> +12% from last week</p>
          </CardContent>
        </Card>

        <Card className="bg-surface shadow-sm border-surface-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-ink-muted uppercase tracking-wider">Bot Deflection Rate</CardTitle>
            <Bot className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-ink">72.5%</div>
            <p className="text-xs text-status-green flex items-center mt-1"><TrendingUp className="w-3 h-3 mr-1" /> +4.2% from last week</p>
          </CardContent>
        </Card>

        <Card className="bg-surface shadow-sm border-surface-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-ink-muted uppercase tracking-wider">New Leads</CardTitle>
            <Users className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-ink">342</div>
            <p className="text-xs text-status-green flex items-center mt-1"><TrendingUp className="w-3 h-3 mr-1" /> +18% from last week</p>
          </CardContent>
        </Card>

        <Card className="bg-surface shadow-sm border-surface-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-ink-muted uppercase tracking-wider">Revenue Influenced</CardTitle>
            <Zap className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-ink">$24,500</div>
            <p className="text-xs text-ink-secondary mt-1 flex items-center"><TrendingUp className="w-3 h-3 mr-1 text-emerald-500" /> Across 85 conversions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Stacked Bar Chart for Bot vs Human */}
        <Card className="lg:col-span-2 bg-surface shadow-sm border-surface-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-ink">Workload Distribution (Bot vs Human)</CardTitle>
            <CardDescription>Daily conversation volume stacked by handling entity.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MOCK_DATA_AREA} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend iconType="circle" />
                  <Bar dataKey="bot" name="AI Handled" stackId="a" fill="#a855f7" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="human" name="Human Handoff" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Knowledge Gaps */}
        <Card className="bg-surface shadow-sm border-surface-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-ink flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Knowledge Gaps
            </CardTitle>
            <CardDescription>Topics the AI frequently fails to answer.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {KNOWLEDGE_GAPS.map((gap, idx) => (
                <div key={idx} className="flex flex-col gap-1 p-3 bg-surface-muted rounded-lg border border-surface-border">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-ink">{gap.topic}</span>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full ${gap.impact === 'High' ? 'bg-red-100 text-red-700' : gap.impact === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {gap.impact}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-ink-secondary">{gap.count} failed interactions</span>
                    <Button variant="link" className="text-xs h-auto p-0 text-accent">Add Answer <ArrowRight className="w-3 h-3 ml-1" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4 text-sm font-medium">View All Gaps</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Campaign Funnel */}
        <Card className="bg-surface shadow-sm border-surface-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-ink flex items-center gap-2">
               Campaign Conversion Funnel
            </CardTitle>
            <CardDescription>Overall performance of outbound campaigns.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MOCK_DATA_FUNNEL} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#111' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} cursor={{fill: '#f3f4f6'}} />
                  <Bar dataKey="value" name="Count" radius={[0, 4, 4, 0]}>
                    {MOCK_DATA_FUNNEL.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Channel Distribution */}
        <Card className="bg-surface shadow-sm border-surface-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-ink">Channel Distribution</CardTitle>
            <CardDescription>Where your conversations are happening.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={MOCK_DATA_PIE} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                    {MOCK_DATA_PIE.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
