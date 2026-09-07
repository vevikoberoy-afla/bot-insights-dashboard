import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  BookOpen,
  Check,
  Clock,
  Database,
  ExternalLink,
  Globe,
  Hash,
  Headphones,
  MessageCircle,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Send,
  Sparkles,
  Tag,
  UserRoundCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bots/new")({
  head: () => ({
    meta: [
      { title: "Create New Bot — Vittain AI Console" },
      {
        name: "description",
        content:
          "Set up a new AI bot in four steps: basics and channel, knowledge bases, live databases, then launch and configuration.",
      },
      { property: "og:title", content: "Create New Bot — Vittain AI Console" },
      {
        property: "og:description",
        content:
          "A guided four-step builder for your AI assistant: identity, knowledge, structured data and launch settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewBotPage,
});

const inputClass =
  "w-full rounded-xl border border-border/70 bg-card px-3 py-2.5 text-[13px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40";

const steps = [
  { key: "basics", title: "Basics & Channels", hint: "Identity, type & platform" },
  { key: "knowledge", title: "Knowledge Bases", hint: "Documentation & citations" },
  { key: "databases", title: "Databases", hint: "Live structured data" },
  { key: "launch", title: "Launch & Config", hint: "Greeting, handoff & schedule" },
] as const;

type StepKey = (typeof steps)[number]["key"];

const botTypes = [
  { value: "support", label: "Support Bot", hint: "Resolves inbound inquiries, creates tickets, 24/7 support", icon: Headphones },
  { value: "sales", label: "Sales Bot", hint: "Qualifies leads, books demos, recovers carts", icon: Sparkles },
  { value: "internal", label: "Internal Bot", hint: "Answers team questions from internal docs", icon: Bot },
] as const;

const channels = [
  { value: "webchat", label: "Webchat", hint: "Website Widget", icon: Globe },
  { value: "whatsapp", label: "WhatsApp", hint: "Meta Cloud", icon: MessageCircle },
  { value: "telegram", label: "Telegram", hint: "Bot API", icon: Send },
  { value: "slack", label: "Slack", hint: "Workspace App", icon: Hash },
] as const;

const tagSuggestions = ["Support", "Marketing", "Sales", "E-commerce", "Lead Gen", "Internal"];

const knowledgeBases = [
  { id: "kb-1", name: "Product Docs", meta: "Manual • 128 Chunks" },
  { id: "kb-2", name: "Refund Policy", meta: "Manual • 12 Chunks" },
  { id: "kb-3", name: "Onboarding Guide", meta: "Manual • 34 Chunks" },
  { id: "kb-4", name: "Pricing FAQ", meta: "Manual • 6 Chunks" },
];

function Panel({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-[19px] font-semibold tracking-[-0.02em] text-foreground">
            {Icon && <Icon className="size-4.5 text-muted-foreground" strokeWidth={1.9} />}
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-5 space-y-6 border-t border-border/70 pt-5">{children}</div>
    </section>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-[13px] font-medium text-foreground">
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </label>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        on ? "bg-foreground" : "bg-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-card shadow-card transition-transform",
          on ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function NewBotPage() {
  const [step, setStep] = useState<StepKey>("basics");
  const stepIndex = steps.findIndex((s) => s.key === step);
  const progress = Math.round((stepIndex / (steps.length - 1)) * 100);

  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>(["Support"]);
  const [tagDraft, setTagDraft] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [type, setType] = useState<string>("support");
  const [channel, setChannel] = useState<string>("webchat");

  const [kbQuery, setKbQuery] = useState("");
  const [selectedKbs, setSelectedKbs] = useState<string[]>([]);
  const [dbQuery, setDbQuery] = useState("");

  const [greeting, setGreeting] = useState("Hi there! How can I help you today?");
  const [handoff, setHandoff] = useState(
    "Let me connect you with a human agent who can assist you further. Please hold on.",
  );
  const [autoTicket, setAutoTicket] = useState(true);
  const [schedule, setSchedule] = useState<"always" | "hours">("always");

  const typeLabel = botTypes.find((t) => t.value === type)?.label ?? "Support Bot";
  const channelLabel = channels.find((c) => c.value === channel)?.label ?? "Webchat";

  const filteredKbs = useMemo(
    () => knowledgeBases.filter((kb) => kb.name.toLowerCase().includes(kbQuery.toLowerCase())),
    [kbQuery],
  );

  const addTag = (value: string) => {
    const v = value.trim().replace(/^#/, "");
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagDraft("");
  };

  const goNext = () => {
    if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1].key);
  };
  const goBack = () => {
    if (stepIndex > 0) setStep(steps[stepIndex - 1].key);
  };

  const nextLabel =
    stepIndex === 0
      ? "Continue to Knowledge Bases"
      : stepIndex === 1
        ? "Continue to Databases"
        : "Continue to Launch & Config";

  return (
    <AppShell
      header={({ menuButton }) => (
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-5">
          {menuButton}
          <p className="text-xs text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-foreground">
              Bots
            </Link>{" "}
            / New
          </p>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search"
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
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-foreground sm:text-[26px]">
          Create New Bot
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Set up your AI assistant&apos;s identity, knowledge, databases, and deployment settings.
        </p>

        <div className="mt-7 grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[288px_minmax(0,1fr)]">
          {/* Left rail */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Progress
                </p>
                <p className="text-[11px] font-semibold text-foreground">{progress}% Completed</p>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <ol className="mt-4 flex flex-col gap-1">
                {steps.map((s, i) => {
                  const done = i < stepIndex;
                  const active = i === stepIndex;
                  return (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={() => setStep(s.key)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                          active ? "bg-surface" : "hover:bg-accent",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg text-[11px] font-semibold",
                            done
                              ? "bg-[var(--success)] text-primary-foreground"
                              : active
                                ? "bg-foreground text-primary-foreground"
                                : "bg-surface text-muted-foreground",
                          )}
                        >
                          {done ? <Check className="size-3.5" strokeWidth={2.6} /> : i + 1}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block truncate text-[13px] font-medium",
                              active || done ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {s.title}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {s.hint}
                          </span>
                        </span>
                        {active && (
                          <span className="ml-auto shrink-0 rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-foreground shadow-card">
                            Active
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <Bot className="size-3.5" strokeWidth={2} />
                Live summary
              </p>
              <div className="mt-3 rounded-xl border border-border/70 bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold text-foreground">
                    {name.trim() || "Untitled Bot"}
                  </p>
                  <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-foreground shadow-card">
                    {typeLabel}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2.5 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="size-3" strokeWidth={2} />
                    {channelLabel}
                  </span>
                  <span className="tabular-nums">
                    {selectedKbs.length} KBs · 0 DBs
                  </span>
                </div>
                {tags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step content */}
          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:p-6">
            {step === "basics" && (
              <Panel
                icon={Bot}
                title="Basics & Channels"
                description="Set up your bot's name, purpose, tags, and select where it will engage customers."
              >
                <div>
                  <FieldLabel required>Name of the Bot</FieldLabel>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Aria Support Concierge"
                    className={inputClass}
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    This name will identify the bot in your dashboard and to visitors.
                  </p>
                </div>

                <div>
                  <FieldLabel>
                    <span className="inline-flex items-center gap-1.5">
                      <Tag className="size-3.5 text-muted-foreground" strokeWidth={2} />
                      Tags
                    </span>
                  </FieldLabel>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-card px-2.5 py-2">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1 text-[11px] font-medium text-foreground"
                      >
                        #{t}
                        <button
                          type="button"
                          aria-label={`Remove ${t}`}
                          onClick={() => setTags(tags.filter((x) => x !== t))}
                          className="text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <X className="size-3" strokeWidth={2.4} />
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag(tagDraft);
                        }
                      }}
                      placeholder="Add tag (press Enter)…"
                      className="min-w-[140px] flex-1 bg-transparent px-1 py-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Suggestions:</span>
                    {tagSuggestions.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => addTag(t)}
                        className={cn(
                          "rounded-full border border-border/70 px-2 py-0.5 text-[11px] transition-colors",
                          tags.includes(t)
                            ? "bg-surface text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        +{t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <FieldLabel>
                    One-liner{" "}
                    <span className="font-normal text-muted-foreground">(What it does)</span>
                  </FieldLabel>
                  <textarea
                    value={oneLiner}
                    onChange={(e) => setOneLiner(e.target.value)}
                    rows={3}
                    placeholder="e.g. 24/7 AI agent that assists customers with product questions, handles returns, and escalates to human agents."
                    className={cn(inputClass, "resize-none leading-relaxed")}
                  />
                </div>

                <div>
                  <FieldLabel required>Select Type of Bot</FieldLabel>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {botTypes.map(({ value, label, hint, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setType(value)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-all",
                          type === value
                            ? "border-foreground/70 bg-surface"
                            : "border-border/70 hover:bg-accent",
                        )}
                      >
                        <Icon className="size-4 text-muted-foreground" strokeWidth={1.9} />
                        <p className="mt-2 text-[13px] font-semibold text-foreground">{label}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                          {hint}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <FieldLabel required>
                      Select Channel{" "}
                      <span className="font-normal text-muted-foreground">(one per bot)</span>
                    </FieldLabel>
                    <span className="text-[11px] font-medium text-[var(--success-foreground)]">
                      Ready to embed
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {channels.map(({ value, label, hint, icon: Icon }) => {
                      const active = channel === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setChannel(value)}
                          className={cn(
                            "relative flex flex-col items-center gap-2 rounded-xl border px-3 py-4 transition-all",
                            active
                              ? "border-foreground/70 bg-surface"
                              : "border-border/70 hover:bg-accent",
                          )}
                        >
                          <span
                            className={cn(
                              "grid size-9 place-items-center rounded-full",
                              active
                                ? "bg-foreground text-primary-foreground"
                                : "bg-surface text-muted-foreground",
                            )}
                          >
                            <Icon className="size-4" strokeWidth={1.9} />
                          </span>
                          <span className="text-[13px] font-semibold text-foreground">{label}</span>
                          <span className="text-[11px] text-muted-foreground">{hint}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2.5 flex items-center gap-2 rounded-xl border border-border/70 bg-surface px-3 py-2.5 text-[11px] text-muted-foreground">
                    <Globe className="size-3.5 shrink-0" strokeWidth={2} />
                    {channelLabel} connection details will be generated automatically upon bot
                    launch.
                  </p>
                </div>
              </Panel>
            )}

            {step === "knowledge" && (
              <Panel
                icon={BookOpen}
                title="Connect Knowledge Bases"
                description="Choose which knowledge sources your bot should cite when answering questions."
                action={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <RefreshCw className="size-3.5" strokeWidth={2} />
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      <Plus className="size-3.5" strokeWidth={2.2} />
                      Add Knowledge Base
                      <ExternalLink className="size-3" strokeWidth={2} />
                    </button>
                  </div>
                }
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={kbQuery}
                    onChange={(e) => setKbQuery(e.target.value)}
                    placeholder="Search existing knowledge bases…"
                    className={cn(inputClass, "pl-9")}
                  />
                </div>

                {filteredKbs.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center text-[13px] text-muted-foreground">
                    No knowledge base matches “{kbQuery}”.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {filteredKbs.map((kb) => {
                      const on = selectedKbs.includes(kb.id);
                      return (
                        <button
                          key={kb.id}
                          type="button"
                          onClick={() =>
                            setSelectedKbs(
                              on ? selectedKbs.filter((x) => x !== kb.id) : [...selectedKbs, kb.id],
                            )
                          }
                          className={cn(
                            "flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                            on
                              ? "border-foreground/70 bg-surface"
                              : "border-border/70 hover:bg-accent",
                          )}
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-muted-foreground">
                            <BookOpen className="size-4" strokeWidth={1.9} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-foreground">
                              {kb.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {kb.meta}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "ml-auto grid size-5 shrink-0 place-items-center rounded-md border",
                              on
                                ? "border-foreground bg-foreground text-primary-foreground"
                                : "border-border",
                            )}
                          >
                            {on && <Check className="size-3.5" strokeWidth={2.8} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface px-3 py-2.5 text-[12px]">
                  <span className="text-muted-foreground">
                    Selected: <span className="font-semibold text-foreground">{selectedKbs.length}</span>{" "}
                    knowledge base(s)
                  </span>
                  <span className="text-muted-foreground">
                    Can be changed anytime in bot settings
                  </span>
                </div>
              </Panel>
            )}

            {step === "databases" && (
              <Panel
                icon={Database}
                title="Connect Databases (Structured Data)"
                description="Allow your bot to look up live orders, inventory items, user accounts, or query custom APIs."
                action={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <RefreshCw className="size-3.5" strokeWidth={2} />
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      <Plus className="size-3.5" strokeWidth={2.2} />
                      Add Database
                      <ExternalLink className="size-3" strokeWidth={2} />
                    </button>
                  </div>
                }
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={dbQuery}
                    onChange={(e) => setDbQuery(e.target.value)}
                    placeholder="Search existing databases and API sources…"
                    className={cn(inputClass, "pl-9")}
                  />
                </div>

                <div className="rounded-2xl border border-dashed border-border/70 px-6 py-12 text-center">
                  <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-surface text-muted-foreground">
                    <Database className="size-5" strokeWidth={1.8} />
                  </span>
                  <p className="mt-3 text-[15px] font-semibold text-foreground">
                    No databases connected yet
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Connect a REST API, Google Sheet, or CSV database to enable live data lookups.
                  </p>
                  <button
                    type="button"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Plus className="size-3.5" strokeWidth={2.2} />
                    Create Database Source
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface px-3 py-2.5 text-[12px]">
                  <span className="text-muted-foreground">
                    Selected: <span className="font-semibold text-foreground">0</span> database(s)
                  </span>
                  <span className="text-muted-foreground">
                    Optional: bots can operate purely on knowledge bases
                  </span>
                </div>
              </Panel>
            )}

            {step === "launch" && (
              <Panel
                icon={Sparkles}
                title="Launch & Configuration"
                description="Set up your opening message, agent handoff rules, availability schedule, and launch your bot."
              >
                <div className="rounded-2xl border border-border/70 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-foreground">
                      First Opening Message
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      Greeting sent when chat opens
                    </span>
                  </div>
                  <textarea
                    value={greeting}
                    onChange={(e) => setGreeting(e.target.value)}
                    rows={3}
                    className={cn(inputClass, "mt-2.5 resize-none leading-relaxed")}
                  />
                  <div className="mt-3 flex items-end gap-2 border-t border-border/70 pt-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-primary-foreground">
                      <Bot className="size-3.5" strokeWidth={2} />
                    </span>
                    <p className="max-w-sm rounded-2xl rounded-bl-md bg-surface px-3 py-2 text-[13px] leading-relaxed text-foreground">
                      {greeting || "…"}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 p-3.5">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    <UserRoundCheck className="size-4 text-muted-foreground" strokeWidth={1.9} />
                    Human Agent Handoff
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Configure what happens when the customer requests a human or AI cannot resolve
                    the request.
                  </p>
                  <div className="mt-3">
                    <FieldLabel>Handoff Message</FieldLabel>
                    <textarea
                      value={handoff}
                      onChange={(e) => setHandoff(e.target.value)}
                      rows={2}
                      className={cn(inputClass, "resize-none leading-relaxed")}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-foreground">Auto-Create Ticket</p>
                      <p className="text-[11px] text-muted-foreground">
                        Automatically create an inbox ticket when handoff is triggered.
                      </p>
                    </div>
                    <Toggle on={autoTicket} onToggle={() => setAutoTicket(!autoTicket)} />
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                      <Clock className="size-4 text-muted-foreground" strokeWidth={1.9} />
                      Schedule & Availability
                    </p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Configure hours
                      <ExternalLink className="size-3" strokeWidth={2} />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        {
                          value: "always",
                          label: "24/7 Always Active",
                          hint: "Responds immediately at any hour of the day.",
                        },
                        {
                          value: "hours",
                          label: "Business Hours Only",
                          hint: "Queues offline requests outside business hours.",
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSchedule(opt.value)}
                        className={cn(
                          "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all",
                          schedule === opt.value
                            ? "border-foreground/70 bg-surface"
                            : "border-border/70 hover:bg-accent",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                            schedule === opt.value ? "border-foreground" : "border-border",
                          )}
                        >
                          {schedule === opt.value && (
                            <span className="size-2 rounded-full bg-foreground" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-foreground">
                            {opt.label}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {opt.hint}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-surface p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Review & Deploy
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ["Name", name.trim() || "Untitled Bot"],
                      ["Type", typeLabel],
                      ["Channel", channelLabel],
                      ["Resources", `${selectedKbs.length} KBs · 0 DBs`],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[11px] text-muted-foreground">{k}</dt>
                        <dd className="mt-0.5 truncate text-[13px] font-semibold text-foreground">
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    type="button"
                    disabled={!name.trim()}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Rocket className="size-4" strokeWidth={2} />
                    Launch {name.trim() || "your bot"} Now
                  </button>
                  {!name.trim() && (
                    <p className="mt-2 text-center text-[11px] text-muted-foreground">
                      Add a bot name in Basics & Channels to launch.
                    </p>
                  )}
                </div>
              </Panel>
            )}

            {/* Footer nav */}
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/70 pt-4">
              {stepIndex === 0 ? (
                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ArrowLeft className="size-4" strokeWidth={2} />
                  Back
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ArrowLeft className="size-4" strokeWidth={2} />
                  Back
                </button>
              )}

              {stepIndex < steps.length - 1 && (
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {nextLabel}
                  <ArrowRight className="size-4" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
