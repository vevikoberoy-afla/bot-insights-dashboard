import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  Eye,
  Mail,
  MessageCircle,
  MousePointerClick,
  Search,
  Send,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/campaigns/analytics")({
  head: () => ({
    meta: [
      { title: "Campaign Analytics — Vittain AI Console" },
      {
        name: "description",
        content:
          "Cross-channel campaign performance: delivery, open, click and conversion rates by channel with weekly send trends.",
      },
      { property: "og:title", content: "Campaign Analytics — Vittain AI Console" },
      {
        property: "og:description",
        content:
          "Delivery, open, click and conversion analytics across Email, WhatsApp and SMS campaigns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CampaignAnalyticsPage,
});

const kpis: { label: string; value: string; delta: string; icon: LucideIcon }[] = [
  { label: "Messages sent", value: "13,143", delta: "+12.4%", icon: Send },
  { label: "Avg delivery rate", value: "94.2%", delta: "+1.1%", icon: TrendingUp },
  { label: "Avg open rate", value: "51.3%", delta: "+4.8%", icon: Eye },
  { label: "Avg click rate", value: "21.4%", delta: "-0.6%", icon: MousePointerClick },
];

const channels: {
  channel: string;
  icon: LucideIcon;
  tint: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
}[] = [
  {
    channel: "Email",
    icon: Mail,
    tint: "var(--chart-5)",
    sent: 10441,
    delivered: 96,
    opened: 34,
    clicked: 9,
    converted: 142,
  },
  {
    channel: "WhatsApp",
    icon: MessageCircle,
    tint: "var(--chart-3)",
    sent: 2702,
    delivered: 92,
    opened: 67,
    clicked: 29,
    converted: 257,
  },
  {
    channel: "SMS",
    icon: Smartphone,
    tint: "var(--chart-4)",
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    converted: 0,
  },
];

const weekly: { week: string; sent: number }[] = [
  { week: "W31", sent: 1420 },
  { week: "W32", sent: 2110 },
  { week: "W33", sent: 1890 },
  { week: "W34", sent: 3241 },
  { week: "W35", sent: 2702 },
  { week: "W36", sent: 1780 },
];

const funnel: { label: string; value: number; pct: number }[] = [
  { label: "Sent", value: 13143, pct: 100 },
  { label: "Delivered", value: 12382, pct: 94 },
  { label: "Opened", value: 6742, pct: 51 },
  { label: "Clicked", value: 2813, pct: 21 },
  { label: "Converted", value: 399, pct: 3 },
];

function CampaignAnalyticsPage() {
  const maxSent = Math.max(...weekly.map((w) => w.sent));

  return (
    <AppShell
      header={({ menuButton }) => (
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-5">
          {menuButton}
          <p className="text-xs text-muted-foreground">Campaigns / Analytics</p>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search…"
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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-foreground sm:text-[26px]">
              Campaign analytics
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Cross-channel performance for the last 6 weeks.
            </p>
          </div>
          <Link
            to="/campaigns"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-card transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-3.5" strokeWidth={2.1} />
            All campaigns
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {kpis.map(({ label, value, delta, icon: Icon }) => (
            <div
              key={label}
              className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-card"
            >
              <div className="flex items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface text-muted-foreground">
                  <Icon className="size-4" strokeWidth={1.9} />
                </span>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {label}
                </p>
              </div>
              <p className="mt-2.5 text-[20px] font-semibold tabular-nums tracking-tight text-foreground">
                {value}
              </p>
              <p
                className="text-[11px] font-medium tabular-nums"
                style={{
                  color: delta.startsWith("-") ? "var(--destructive)" : "var(--success-foreground)",
                }}
              >
                {delta} vs prev period
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
            <h2 className="text-[13px] font-semibold text-foreground">Weekly send volume</h2>
            <div className="mt-5 flex h-40 items-end gap-3">
              {weekly.map((w) => (
                <div key={w.week} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {w.sent.toLocaleString("en-US")}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-primary/80"
                    style={{ height: `${(w.sent / maxSent) * 100}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{w.week}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
            <h2 className="text-[13px] font-semibold text-foreground">Conversion funnel</h2>
            <div className="mt-4 space-y-3">
              {funnel.map((f) => (
                <div key={f.label}>
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {f.value.toLocaleString("en-US")} · {f.pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${f.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/70 bg-surface/60">
                  {["Channel", "Sent", "Delivered", "Opened", "Clicked", "Converted"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground ${
                        i >= 1 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {channels.map(({ channel, icon: Icon, tint, ...m }) => (
                  <tr
                    key={channel}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/60"
                  >
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                        style={{
                          color: tint,
                          backgroundColor: `color-mix(in oklab, ${tint} 12%, transparent)`,
                        }}
                      >
                        <Icon className="size-3" strokeWidth={2.2} />
                        {channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-foreground">
                      {m.sent.toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] tabular-nums text-muted-foreground">
                      {m.delivered}%
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] tabular-nums text-muted-foreground">
                      {m.opened}%
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] tabular-nums text-muted-foreground">
                      {m.clicked}%
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-foreground">
                      {m.converted.toLocaleString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
