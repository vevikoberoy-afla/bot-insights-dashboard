import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  CheckCircle2,
  Eye,
  Mail,
  MessageCircle,
  MousePointerClick,
  Plus,
  Search,
  Smartphone,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/campaigns/")({
  head: () => ({
    meta: [
      { title: "Campaigns — Vittain AI Console" },
      {
        name: "description",
        content:
          "Send and track bulk campaigns across Email, WhatsApp and SMS: audience, delivery, open, click and conversion performance in one table.",
      },
      { property: "og:title", content: "Campaigns — Vittain AI Console" },
      {
        property: "og:description",
        content:
          "Bulk messaging across Email, WhatsApp and SMS with delivery, open, click and conversion metrics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CampaignsPage,
});

type Channel = "Email" | "WhatsApp" | "SMS";
type Status = "Sent" | "Sending" | "Scheduled" | "Draft" | "Failed";

const channelMeta: Record<Channel, { icon: LucideIcon; tint: string }> = {
  Email: { icon: Mail, tint: "var(--chart-5)" },
  WhatsApp: { icon: MessageCircle, tint: "var(--chart-3)" },
  SMS: { icon: Smartphone, tint: "var(--chart-4)" },
};

const statusTint: Record<Status, string> = {
  Sent: "var(--success)",
  Sending: "var(--chart-4)",
  Scheduled: "var(--chart-1)",
  Draft: "var(--muted-foreground)",
  Failed: "var(--destructive)",
};

type Campaign = {
  name: string;
  channel: Channel;
  status: Status;
  audience: number;
  delivered: number | null;
  opened: number | null;
  clicked: number | null;
  converted: number | null;
  scheduled: string | null;
};

const campaigns: Campaign[] = [
  {
    name: "Summer Sale Blast",
    channel: "Email",
    status: "Sent",
    audience: 3241,
    delivered: 97,
    opened: 31,
    clicked: 8,
    converted: 142,
    scheduled: "2026-08-20",
  },
  {
    name: "Abandoned Cart Recovery",
    channel: "WhatsApp",
    status: "Sending",
    audience: 812,
    delivered: 89,
    opened: 62,
    clicked: 24,
    converted: 38,
    scheduled: "2026-08-28",
  },
  {
    name: "New Feature Announcement",
    channel: "Email",
    status: "Scheduled",
    audience: 5100,
    delivered: null,
    opened: null,
    clicked: null,
    converted: null,
    scheduled: "2026-09-04",
  },
  {
    name: "Win-back Inactive Users",
    channel: "SMS",
    status: "Draft",
    audience: 0,
    delivered: null,
    opened: null,
    clicked: null,
    converted: null,
    scheduled: null,
  },
  {
    name: "Flash Sale — 24h Only",
    channel: "WhatsApp",
    status: "Sent",
    audience: 1890,
    delivered: 94,
    opened: 71,
    clicked: 33,
    converted: 219,
    scheduled: "2026-08-15",
  },
  {
    name: "Weekly Newsletter",
    channel: "Email",
    status: "Sent",
    audience: 2100,
    delivered: 12,
    opened: null,
    clicked: null,
    converted: null,
    scheduled: "2026-08-25",
  },
];

const kpis: { label: string; value: string; icon: LucideIcon }[] = [
  { label: "Total campaigns", value: "6", icon: BarChart3 },
  { label: "Total sent", value: "5,131", icon: Users },
  { label: "Avg open rate", value: "51%", icon: Eye },
  { label: "Avg click rate", value: "21%", icon: MousePointerClick },
  { label: "Total conversions", value: "399", icon: CheckCircle2 },
];

function Pill({ label, tint }: { label: string; tint: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
      style={{
        color: tint,
        backgroundColor: `color-mix(in oklab, ${tint} 12%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function CampaignsPage() {
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<"All" | Channel>("All");
  const [status, setStatus] = useState<"All" | Status>("All");

  const rows = useMemo(
    () =>
      campaigns.filter(
        (c) =>
          c.name.toLowerCase().includes(query.trim().toLowerCase()) &&
          (channel === "All" || c.channel === channel) &&
          (status === "All" || c.status === status),
      ),
    [query, channel, status],
  );

  return (
    <AppShell
      header={({ menuButton }) => (
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-5">
          {menuButton}
          <p className="text-xs text-muted-foreground">Campaigns / All</p>
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
              Campaigns
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Send bulk messages to your contacts across email, WhatsApp, SMS and more.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/campaigns/analytics"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-card transition-colors hover:bg-accent"
            >
              <TrendingUp className="size-3.5" strokeWidth={2.1} />
              Campaign analytics
            </Link>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" strokeWidth={2.2} />
              Create campaign
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {kpis.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-card"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface text-muted-foreground">
                <Icon className="size-4" strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {label}
                </p>
                <p className="text-[17px] font-semibold tabular-nums tracking-tight text-foreground">
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search campaigns…"
              className="h-9 w-full rounded-xl border border-border/70 bg-card pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as "All" | Channel)}
            className="h-9 rounded-xl border border-border/70 bg-card px-3 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-ring/40"
          >
            {["All", "Email", "WhatsApp", "SMS"].map((c) => (
              <option key={c} value={c}>
                {c === "All" ? "All channels" : c}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "All" | Status)}
            className="h-9 rounded-xl border border-border/70 bg-card px-3 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-ring/40"
          >
            {["All", "Sent", "Sending", "Scheduled", "Draft", "Failed"].map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All status" : s}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/70 bg-surface/60">
                  {[
                    "Campaign",
                    "Channel",
                    "Status",
                    "Audience",
                    "Delivered",
                    "Opened",
                    "Clicked",
                    "Converted",
                    "Scheduled",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground ${
                        i >= 3 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const Icon = channelMeta[c.channel].icon;
                  return (
                    <tr
                      key={c.name}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/60"
                    >
                      <td className="px-4 py-3 text-[13px] font-medium text-foreground">{c.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                          style={{
                            color: channelMeta[c.channel].tint,
                            backgroundColor: `color-mix(in oklab, ${channelMeta[c.channel].tint} 12%, transparent)`,
                          }}
                        >
                          <Icon className="size-3" strokeWidth={2.2} />
                          {c.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Pill label={c.status} tint={statusTint[c.status]} />
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-foreground">
                        {c.audience.toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] tabular-nums text-muted-foreground">
                        {c.delivered === null ? <Dash /> : `${c.delivered}%`}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] tabular-nums text-muted-foreground">
                        {c.opened === null ? <Dash /> : `${c.opened}%`}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] tabular-nums text-muted-foreground">
                        {c.clicked === null ? <Dash /> : `${c.clicked}%`}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums">
                        {c.converted === null ? (
                          <Dash />
                        ) : (
                          <span style={{ color: "var(--success-foreground)" }}>
                            {c.converted.toLocaleString("en-US")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-muted-foreground">
                        {c.scheduled ?? <Dash />}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                      No campaigns match those filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
