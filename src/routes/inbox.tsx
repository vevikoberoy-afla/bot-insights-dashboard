import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  Bot,
  Check,
  ChevronDown,
  Eye,
  Filter,
  Globe,
  Mail,
  MessageCircle,
  PanelRight,
  Phone,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  Tag,
  User,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Live Inbox — Vittain AI Console" },
      {
        name: "description",
        content:
          "Every conversation in one place: bot-handled chats, waiting customers, live takeover and the full contact profile beside each thread.",
      },
      { property: "og:title", content: "Live Inbox — Vittain AI Console" },
      {
        property: "og:description",
        content:
          "A calm, Apple-style live inbox for AI conversations with contact profile, lead score and session context.",
      },
    ],
  }),
  component: InboxPage,
});

type Conversation = {
  id: string;
  name: string;
  initials: string;
  preview: string;
  time: string;
  channel: "WhatsApp" | "Web" | "Email";
  state: "BOT" | "RESOLVED" | "WAITING";
  tag: string;
  unread?: number;
};

const conversations: Conversation[] = [
  {
    id: "alex",
    name: "Alex Johnson",
    initials: "AL",
    preview: "I need help with my order",
    time: "10:42 AM",
    channel: "WhatsApp",
    state: "BOT",
    tag: "Hot",
    unread: 2,
  },
  {
    id: "sarah",
    name: "Sarah Miller",
    initials: "SA",
    preview: "Thank you so much!",
    time: "Yesterday",
    channel: "Web",
    state: "RESOLVED",
    tag: "Won",
  },
  {
    id: "david",
    name: "David Chen",
    initials: "DA",
    preview: "When will this be restocked?",
    time: "2d ago",
    channel: "Email",
    state: "WAITING",
    tag: "Engaged",
  },
  {
    id: "priya",
    name: "Priya Sharma",
    initials: "PR",
    preview: "Can I get a discount code?",
    time: "3h ago",
    channel: "WhatsApp",
    state: "BOT",
    tag: "Qualified",
    unread: 1,
  },
  {
    id: "tom",
    name: "Tom Wilson",
    initials: "TO",
    preview: "My order never arrived",
    time: "1h ago",
    channel: "Email",
    state: "WAITING",
    tag: "New",
    unread: 3,
  },
];

const channelIcon = { WhatsApp: MessageCircle, Web: Globe, Email: Mail } as const;

const filters = [
  { label: "All", count: 42 },
  { label: "Waiting", count: 12 },
  { label: "Mine", count: 5 },
  { label: "Bot Active", count: 18 },
];

type Msg = { from: "bot" | "customer"; text: string; time: string; ai?: boolean };

const thread: Msg[] = [
  {
    from: "bot",
    text: "Hi Alex! I'm the Vittain virtual assistant. How can I help you today?",
    time: "10:40 AM",
    ai: true,
  },
  { from: "customer", text: "I need help with my order", time: "10:42 AM" },
  {
    from: "bot",
    text: "I can certainly help with that. Could you please provide your order number?",
    time: "10:42 AM",
    ai: true,
  },
];

function StateBadge({ state }: { state: Conversation["state"] }) {
  const styles: Record<Conversation["state"], string> = {
    BOT: "bg-secondary text-secondary-foreground",
    RESOLVED: "bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success-foreground",
    WAITING: "bg-accent text-accent-foreground",
  };
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${styles[state]}`}
    >
      {state}
    </span>
  );
}

function ConversationRow({
  c,
  active,
  onSelect,
}: {
  c: Conversation;
  active: boolean;
  onSelect: () => void;
}) {
  const ChannelIcon = channelIcon[c.channel];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors ${
        active ? "bg-card" : "hover:bg-accent/60"
      }`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
        {c.initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">
            {c.name}
          </p>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{c.time}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.preview}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <ChannelIcon className="size-3 shrink-0 text-muted-foreground" strokeWidth={2} />
          <StateBadge state={c.state} />
          <span className="rounded-md bg-surface px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
            {c.tag}
          </span>
          {c.unread && (
            <span className="ml-auto grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
              {c.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: typeof Eye; children: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      <Icon className="size-3" strokeWidth={2} />
      {children}
    </p>
  );
}

function ContactPanel({ contact }: { contact: Conversation }) {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-4 py-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-surface text-lg font-semibold text-foreground">
          {contact.initials}
        </span>
        <p className="text-[15px] font-semibold tracking-tight text-foreground">{contact.name}</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--success)_14%,transparent)] px-2 py-0.5 text-[10px] font-medium text-success-foreground">
          <span className="size-1.5 rounded-full bg-success" />
          Online now
        </span>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-card">
        <div className="flex items-center justify-between">
          <SectionLabel icon={Tag}>Lead status</SectionLabel>
          <span className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
            {contact.tag}
          </span>
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Lead score
        </p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
            <div className="h-full w-[85%] rounded-full bg-success" />
          </div>
          <span className="text-[12px] font-semibold tabular-nums text-foreground">85</span>
        </div>
      </div>

      <div className="space-y-2.5">
        <SectionLabel icon={Eye}>Current session</SectionLabel>
        <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-3.5 shadow-card">
          <ProfileRow label="Cart value" value="$245.00" />
          <ProfileRow label="Pages viewed" value="12" />
          <div className="flex items-center gap-2 rounded-xl bg-surface px-2.5 py-2 text-[12px] text-foreground">
            <ShoppingCart className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
            1× Premium Widget
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <SectionLabel icon={User}>Contact info</SectionLabel>
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-2.5 py-2 text-[12px] text-foreground">
            <Mail className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
            <span className="truncate">alex.johnson@example.com</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-2.5 py-2 text-[12px] text-foreground">
            <Phone className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
            +1 (555) 123-4567
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <SectionLabel icon={MessageCircle}>Conversation info</SectionLabel>
        <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-3.5 shadow-card">
          <ProfileRow label="Channel" value={contact.channel} />
          <ProfileRow label="Assigned" value="Unassigned" />
          <ProfileRow label="Bot handled" value="Yes" />
        </div>
      </div>

      <div className="space-y-2.5 pb-2">
        <SectionLabel icon={Sparkles}>Vittain AI insights</SectionLabel>
        <p className="rounded-2xl bg-surface p-3.5 text-[12px] leading-relaxed text-muted-foreground">
          High intent to purchase. Suggest offering free expedited shipping to close the open cart.
        </p>
      </div>
    </div>
  );
}

function InboxPage() {
  const [activeId, setActiveId] = useState("alex");
  const [profileOpen, setProfileOpen] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const active: Conversation =
    conversations.find((c) => c.id === activeId) ?? (conversations[0] as Conversation);

  const list = (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search conversations…"
            className="h-9 w-full rounded-full border border-border/70 bg-card pl-8 pr-9 text-xs text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="button"
            aria-label="Filter conversations"
            className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Filter className="size-3.5" strokeWidth={2} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-1 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setActiveFilter(f.label)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                activeFilter === f.label
                  ? "bg-primary font-medium text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {f.label}
              <span className="tabular-nums opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.map((c) => (
          <ConversationRow
            key={c.id}
            c={c}
            active={c.id === activeId}
            onSelect={() => {
              setActiveId(c.id);
              setListOpen(false);
            }}
          />
        ))}
      </div>
    </div>
  );

  return (
    <AppShell
      contentClassName="flex h-[100dvh] min-w-0 flex-col"
      header={({ menuButton }) => (
        <header className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl">
          {menuButton}
          <button
            type="button"
            onClick={() => setListOpen(true)}
            aria-label="Open conversations"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            <ArrowLeft className="size-4" strokeWidth={1.9} />
          </button>
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Inbox</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search…"
                className="h-8 w-44 rounded-full border border-border/70 bg-card pl-8 pr-3 text-xs text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <button
              type="button"
              aria-label="Notifications"
              className="relative grid size-8 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground transition-colors hover:text-foreground"
            >
              <Bell className="size-4" strokeWidth={1.9} />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-success" />
            </button>
          </div>
        </header>
      )}
    >
      <div className="flex min-h-0 flex-1">

        <section className="hidden w-[300px] shrink-0 border-r border-border/70 bg-surface md:flex md:flex-col xl:w-[340px]">
          {list}
        </section>

        {listOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
              onClick={() => setListOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-[86vw] max-w-sm flex-col border-r border-border/70 bg-surface">
              {list}
            </div>
          </div>
        )}

        <section className="flex min-w-0 flex-1 flex-col bg-background">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
              {active.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">
                {active.name}
              </p>
              <p className="text-[10px] text-muted-foreground">{active.channel}</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                className="hidden items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent sm:inline-flex"
              >
                {active.tag}
                <ChevronDown className="size-3" strokeWidth={2} />
              </button>
              <button
                type="button"
                className="hidden items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent lg:inline-flex"
              >
                <Tag className="size-3" strokeWidth={2} />
                Label
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                Take over
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Check className="size-3" strokeWidth={2.4} />
                Resolve
              </button>
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                aria-label={profileOpen ? "Hide contact profile" : "Show contact profile"}
                aria-pressed={profileOpen}
                className={`grid size-8 shrink-0 place-items-center rounded-full border border-border/70 transition-colors ${
                  profileOpen
                    ? "bg-foreground text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <PanelRight className="size-4" strokeWidth={1.9} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="flex justify-center">
              <span className="rounded-full bg-surface px-3 py-1 text-[10px] font-medium text-muted-foreground">
                Today
              </span>
            </div>

            {thread.map((m, i) => (
              <div
                key={i}
                className={`flex items-end gap-2 ${m.from === "customer" ? "justify-end" : ""}`}
              >
                {m.from === "bot" && (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-muted-foreground">
                    <Bot className="size-3.5" strokeWidth={1.9} />
                  </span>
                )}
                <div className={`max-w-[78%] ${m.from === "customer" ? "items-end" : ""}`}>
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      m.from === "customer"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border/70 bg-card text-foreground shadow-card"
                    }`}
                  >
                    {m.text}
                  </div>
                  <div
                    className={`mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground ${
                      m.from === "customer" ? "justify-end" : ""
                    }`}
                  >
                    <span>{m.time}</span>
                    {m.ai && (
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="size-2.5" strokeWidth={2} />
                        AI generated
                      </span>
                    )}
                  </div>
                </div>
                {m.from === "customer" && (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-muted-foreground">
                    <User className="size-3.5" strokeWidth={1.9} />
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-border/70 bg-background px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3 text-[12px]">
              <button type="button" className="font-medium text-foreground">
                Reply
              </button>
              <button type="button" className="text-muted-foreground hover:text-foreground">
                Internal note
              </button>
              <button
                type="button"
                className="ml-auto hidden items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                Canned response
                <ChevronDown className="size-3" strokeWidth={2} />
              </button>
            </div>
            <div className="mt-2 flex items-end gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-card">
              <textarea
                rows={2}
                placeholder="Type a message or '/' for canned responses…"
                className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                aria-label="Send message"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Send className="size-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </section>

        {profileOpen && (
          <>
            <aside className="hidden w-[300px] shrink-0 border-l border-border/70 bg-surface xl:block">
              <ContactPanel contact={active} />
            </aside>
            <div className="fixed inset-0 z-40 xl:hidden">
              <div
                className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
                onClick={() => setProfileOpen(false)}
              />
              <aside className="absolute inset-y-0 right-0 w-[86vw] max-w-sm border-l border-border/70 bg-surface">
                <ContactPanel contact={active} />
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>

  );
}
