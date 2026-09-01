import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  CheckCircle2,
  DollarSign,
  Globe,
  Mail,
  MessageCircle,
  MessagesSquare,
  Plus,
  Search,
  Sparkles,
  Target,
  TicketCheck,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview — Vittain AI Console" },
      {
        name: "description",
        content:
          "Enterprise analytics overview: revenue, leads, new customers, bot resolution rate, channel mix and pipeline health in one calm dashboard.",
      },
      { property: "og:title", content: "Overview — Vittain AI Console" },
      {
        property: "og:description",
        content:
          "Revenue, leads, new customers and AI bot performance — a single, readable analytics surface.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OverviewPage,
});

type Kpi = {
  label: string;
  value: string;
  sub: string;
  delta: number;
  icon: LucideIcon;
  spark: number[];
};

const kpis: Kpi[] = [
  {
    label: "Revenue",
    value: "$248.6k",
    sub: "vs $221.4k last period",
    delta: 12.3,
    icon: DollarSign,
    spark: [18, 22, 20, 27, 25, 31, 34, 33, 39, 42, 40, 47],
  },
  {
    label: "Sales closed",
    value: "1,284",
    sub: "avg deal $193",
    delta: 8.1,
    icon: Target,
    spark: [12, 14, 13, 17, 19, 18, 22, 24, 23, 27, 29, 31],
  },
  {
    label: "Leads captured",
    value: "9,412",
    sub: "3.1k qualified by AI",
    delta: 17.6,
    icon: Sparkles,
    spark: [30, 28, 34, 33, 38, 41, 39, 45, 48, 52, 50, 57],
  },
  {
    label: "New customers",
    value: "742",
    sub: "68% self-served",
    delta: -3.4,
    icon: UserPlus,
    spark: [22, 25, 24, 27, 26, 25, 23, 24, 22, 21, 20, 19],
  },
];

const secondary = [
  { label: "Active bots", value: "12", meta: "4 channels", icon: Bot },
  { label: "Conversations", value: "38.4k", meta: "today 1,204", icon: MessagesSquare },
  { label: "Resolution rate", value: "86%", meta: "+2.4 pts", icon: CheckCircle2 },
  { label: "Handoffs", value: "418", meta: "1.1% of volume", icon: Users },
  { label: "Tickets resolved", value: "5,902", meta: "SLA 98.2%", icon: TicketCheck },
  { label: "Campaigns live", value: "7", meta: "2 ending soon", icon: Zap },
];

const revenueSeries = [
  { m: "Jan", revenue: 118, leads: 520, customers: 41 },
  { m: "Feb", revenue: 131, leads: 590, customers: 47 },
  { m: "Mar", revenue: 127, leads: 610, customers: 44 },
  { m: "Apr", revenue: 154, leads: 690, customers: 52 },
  { m: "May", revenue: 172, leads: 742, customers: 58 },
  { m: "Jun", revenue: 166, leads: 780, customers: 55 },
  { m: "Jul", revenue: 198, leads: 856, customers: 63 },
  { m: "Aug", revenue: 221, leads: 910, customers: 69 },
  { m: "Sep", revenue: 248, leads: 984, customers: 74 },
];

const channelSeries = [
  { channel: "WhatsApp", messages: 14200, resolved: 12600 },
  { channel: "Web", messages: 9800, resolved: 8400 },
  { channel: "Email", messages: 6400, resolved: 5100 },
  { channel: "SMS", messages: 4300, resolved: 3600 },
  { channel: "Instagram", messages: 2600, resolved: 2100 },
];

const funnel = [
  { stage: "Visitors", value: 128400 },
  { stage: "Leads", value: 9412 },
  { stage: "Qualified", value: 3140 },
  { stage: "Opportunities", value: 1860 },
  { stage: "Closed won", value: 1284 },
];

const sourceMix = [
  { name: "Bot-assisted", value: 46, color: "var(--chart-1)" },
  { name: "Campaigns", value: 27, color: "var(--chart-2)" },
  { name: "Organic", value: 17, color: "var(--chart-3)" },
  { name: "Referral", value: 10, color: "var(--chart-4)" },
];

const channelIcon: Record<string, LucideIcon> = {
  WhatsApp: MessageCircle,
  Web: Globe,
  Email: Mail,
  SMS: MessagesSquare,
  Instagram: Sparkles,
};

const topBots = [
  { name: "Aurora Support", channel: "WhatsApp", revenue: "$62.4k", resolved: 87, leads: 2140 },
  { name: "Lumen Sales", channel: "Web", revenue: "$48.1k", resolved: 74, leads: 1860 },
  { name: "Studio Concierge", channel: "Instagram", revenue: "$21.7k", resolved: 82, leads: 940 },
  { name: "Ledger Desk", channel: "Email", revenue: "$12.3k", resolved: 91, leads: 410 },
];

function Delta({ value }: { value: number }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
      style={{
        color: up ? "var(--success-foreground)" : "var(--destructive)",
        backgroundColor: up
          ? "color-mix(in oklab, var(--success) 16%, transparent)"
          : "color-mix(in oklab, var(--destructive) 12%, transparent)",
      }}
    >
      <Icon className="size-2.5" strokeWidth={2.4} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-9 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area
            type="monotone"
            dataKey="v"
            stroke={up ? "var(--chart-1)" : "var(--destructive)"}
            strokeWidth={1.6}
            fill={
              up
                ? "color-mix(in oklab, var(--chart-1) 14%, transparent)"
                : "color-mix(in oklab, var(--destructive) 12%, transparent)"
            }
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-border/70 bg-card p-3.5 shadow-card ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

function CardTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </h2>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  fontSize: 11,
  padding: "6px 10px",
  boxShadow: "var(--shadow-card)",
} as const;

function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon;
  return (
    <article className="flex flex-col rounded-2xl border border-border/70 bg-card p-3.5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover">
      <header className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface text-muted-foreground">
          <Icon className="size-3.5" strokeWidth={1.9} />
        </span>
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {kpi.label}
        </span>
        <span className="ml-auto shrink-0">
          <Delta value={kpi.delta} />
        </span>
      </header>
      <p className="mt-2.5 font-display text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">
        {kpi.value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{kpi.sub}</p>
      <div className="mt-2">
        <Sparkline data={kpi.spark} up={kpi.delta >= 0} />
      </div>
    </article>
  );
}

function OverviewPage() {
  const maxFunnel = funnel[0]?.value ?? 1;

  return (
    <AppShell
      header={({ menuButton }) => (
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-5">
          {menuButton}
          <p className="text-xs text-muted-foreground">Analytics / Overview</p>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search metrics"
                className="h-8 w-40 rounded-full border border-border/70 bg-card pl-8 pr-3 text-xs text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 md:w-52"
              />
            </div>
            <button
              type="button"
              aria-label="Notifications"
              className="grid size-8 shrink-0 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground transition-colors hover:text-foreground"
            >
              <Bell className="size-4" strokeWidth={1.9} />
            </button>
          </div>
        </header>
      )}
    >
      <div className="px-4 py-7 sm:px-8 sm:py-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-foreground sm:text-[26px]">
              Overview
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Revenue, pipeline and AI performance — last 30 days.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-0.5 rounded-full border border-border/70 bg-card p-0.5 sm:flex">
              {["7d", "30d", "QTD"].map((r, i) => (
                <button
                  key={r}
                  type="button"
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    i === 1
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <Link
              to="/"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" strokeWidth={2.2} />
              New bot
            </Link>
          </div>
        </div>

        {/* KPI row */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <KpiCard key={k.label} kpi={k} />
          ))}
        </div>

        {/* Secondary compact metrics */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {secondary.map(({ label, value, meta, icon: Icon }) => (
            <div
              key={label}
              className="rounded-2xl border border-border/70 bg-card p-3 shadow-card transition-shadow hover:shadow-card-hover"
            >
              <div className="flex items-center gap-1.5">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.9} />
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {label}
                </span>
              </div>
              <p className="mt-1.5 text-[17px] font-semibold tabular-nums tracking-tight text-foreground">
                {value}
              </p>
              <p className="text-[10.5px] text-muted-foreground">{meta}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardTitle title="Revenue & leads" hint="Revenue in $k · leads count" />
            <div className="h-[228px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="m"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue ($k)"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="color-mix(in oklab, var(--chart-1) 12%, transparent)"
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="customers"
                    name="New customers"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    fill="color-mix(in oklab, var(--chart-2) 10%, transparent)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardTitle title="Lead sources" hint="share of 9.4k" />
            <div className="flex items-center gap-3">
              <div className="h-[150px] w-[150px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={44}
                      outerRadius={68}
                      paddingAngle={2}
                      stroke="var(--card)"
                      strokeWidth={2}
                    >
                      {sourceMix.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="min-w-0 flex-1 space-y-2">
                {sourceMix.map((s) => (
                  <li key={s.name} className="flex items-center gap-2 text-[11.5px]">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="truncate text-muted-foreground">{s.name}</span>
                    <span className="ml-auto font-semibold tabular-nums text-foreground">
                      {s.value}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardTitle title="Messages by channel" hint="total vs resolved" />
            <div className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelSeries} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="channel"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)" }} />
                  <Bar dataKey="messages" name="Messages" fill="var(--chart-1)" radius={[5, 5, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="resolved" name="Resolved" fill="var(--chart-3)" radius={[5, 5, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardTitle title="Sales funnel" hint="conversion" />
            <ul className="space-y-2.5">
              {funnel.map((f, i) => {
                const pct = (f.value / maxFunnel) * 100;
                const prev = i === 0 ? null : (funnel[i - 1]?.value ?? null);
                return (
                  <li key={f.stage}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11.5px] text-muted-foreground">{f.stage}</span>
                      <span className="text-[12px] font-semibold tabular-nums text-foreground">
                        {f.value.toLocaleString("en-US")}
                        {prev && (
                          <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">
                            {((f.value / prev) * 100).toFixed(1)}%
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(pct, 3)}%`,
                          backgroundColor: "var(--chart-1)",
                          opacity: 1 - i * 0.14,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        {/* Top bots table */}
        <Card className="mt-3">
          <CardTitle title="Top performing bots" hint="attributed revenue" />
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-1 pb-2 text-left font-semibold">Bot</th>
                  <th className="px-1 pb-2 text-left font-semibold">Channel</th>
                  <th className="px-1 pb-2 text-right font-semibold">Leads</th>
                  <th className="px-1 pb-2 text-right font-semibold">Resolved</th>
                  <th className="px-1 pb-2 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topBots.map((b) => {
                  const Icon = channelIcon[b.channel] ?? Globe;
                  return (
                    <tr key={b.name} className="border-t border-border/70">
                      <td className="px-1 py-2.5 font-medium text-foreground">{b.name}</td>
                      <td className="px-1 py-2.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-[11px] text-secondary-foreground">
                          <Icon className="size-3" strokeWidth={2} />
                          {b.channel}
                        </span>
                      </td>
                      <td className="px-1 py-2.5 text-right tabular-nums text-muted-foreground">
                        {b.leads.toLocaleString("en-US")}
                      </td>
                      <td className="px-1 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-surface sm:block">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${b.resolved}%`, backgroundColor: "var(--success)" }}
                            />
                          </span>
                          <span className="tabular-nums font-medium text-foreground">
                            {b.resolved}%
                          </span>
                        </span>
                      </td>
                      <td className="px-1 py-2.5 text-right font-semibold tabular-nums text-foreground">
                        {b.revenue}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
