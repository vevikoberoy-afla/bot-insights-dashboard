import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  Globe,
  Instagram,
  Mail,
  MessageCircle,
  MessagesSquare,
  Pencil,
  Plus,
  Search,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My Bots — Vittain AI Console" },
      {
        name: "description",
        content:
          "Manage every AI bot across WhatsApp, web, email and SMS: today's messages, resolution rate, handoffs and last activity in one calm dashboard.",
      },
      { property: "og:title", content: "My Bots — Vittain AI Console" },
      {
        property: "og:description",
        content:
          "A minimal console for your AI bots: channel, message volume, resolution rate and handoffs at a glance.",
      },
    ],
  }),
  component: BotsPage,
});

type Channel = "WhatsApp" | "Web" | "Email" | "SMS" | "Instagram" | "Telegram";

const channelIcon: Record<Channel, LucideIcon> = {
  WhatsApp: MessageCircle,
  Web: Globe,
  Email: Mail,
  SMS: MessagesSquare,
  Instagram: Instagram,
  Telegram: Send,
};

type BotItem = {
  name: string;
  purpose: string;
  channel: Channel;
  active: boolean;
  today: number;
  total: number;
  resolved: number;
  handoffs: number;
  lastActive: string;
};

const bots: BotItem[] = [
  {
    name: "Aurora Support",
    purpose: "Support",
    channel: "WhatsApp",
    active: true,
    today: 214,
    total: 18420,
    resolved: 87,
    handoffs: 12,
    lastActive: "2 min ago",
  },
  {
    name: "Lumen Sales",
    purpose: "Marketing",
    channel: "Web",
    active: true,
    today: 96,
    total: 7310,
    resolved: 74,
    handoffs: 21,
    lastActive: "11 min ago",
  },
  {
    name: "Ledger Desk",
    purpose: "Billing",
    channel: "Email",
    active: true,
    today: 38,
    total: 4126,
    resolved: 91,
    handoffs: 4,
    lastActive: "1 hr ago",
  },
  {
    name: "Pulse Reminders",
    purpose: "Notifications",
    channel: "SMS",
    active: false,
    today: 0,
    total: 2980,
    resolved: 68,
    handoffs: 9,
    lastActive: "3 days ago",
  },
  {
    name: "Studio Concierge",
    purpose: "Bookings",
    channel: "Instagram",
    active: true,
    today: 57,
    total: 1544,
    resolved: 82,
    handoffs: 7,
    lastActive: "26 min ago",
  },
  {
    name: "Atlas Onboarding",
    purpose: "Onboarding",
    channel: "Telegram",
    active: true,
    today: 12,
    total: 903,
    resolved: 79,
    handoffs: 3,
    lastActive: "48 min ago",
  },
];

function formatCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function BotCard({ bot }: { bot: BotItem }) {
  const ChannelIcon = channelIcon[bot.channel];

  return (
    <article className="group flex flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {bot.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{bot.purpose}</p>
        </div>
        <span
          className="inline-flex size-2 shrink-0 translate-y-1.5 rounded-full"
          style={{
            backgroundColor: bot.active ? "var(--success)" : "var(--border)",
            boxShadow: bot.active ? "0 0 0 3px color-mix(in oklab, var(--success) 18%, transparent)" : undefined,
          }}
          aria-label={bot.active ? "Active" : "Paused"}
        />
      </header>

      <div className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-surface px-2 py-1 text-[11px] font-medium text-secondary-foreground">
        <ChannelIcon className="size-3" strokeWidth={2} />
        {bot.channel}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border/70 pt-3">
        <Stat label="Today" value={formatCount(bot.today)} />
        <Stat label="Total" value={formatCount(bot.total)} />
        <Stat label="Resolved" value={`${bot.resolved}%`} />
        <Stat label="Handoffs" value={formatCount(bot.handoffs)} />
      </div>

      <footer className="mt-3 flex items-center justify-between border-t border-border/70 pt-2.5">
        <span className="text-[11px] text-muted-foreground">Active {bot.lastActive}</span>
        <Link
          to="/bots/$botId"
          params={{ botId: bot.name.toLowerCase().replace(/\s+/g, "-") }}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-3" strokeWidth={2} />
          Edit
        </Link>
      </footer>

    </article>
  );
}

function BotsPage() {
  return (
    <AppShell
      header={({ menuButton }) => (
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-5">
          {menuButton}
          <p className="text-xs text-muted-foreground">Bots / All</p>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search bots"
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
              My Bots
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Every AI bot, every channel — performance at a glance.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-3.5" strokeWidth={2.2} />
            New bot
          </button>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {bots.map((bot) => (
            <BotCard key={bot.name} bot={bot} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
