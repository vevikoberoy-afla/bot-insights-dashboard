import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  Bot,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Globe,
  Hash,
  LayoutTemplate,
  MessageCircle,
  Plug,
  Plus,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
  Wand2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bots/$botId")({
  head: () => ({
    meta: [
      { title: "Bot Settings — Vittain AI Console" },
      {
        name: "description",
        content:
          "Configure your AI bot: identity and persona, knowledge bases, channels, behavior and flow, proactive triggers, MCP actions and widget appearance.",
      },
      { property: "og:title", content: "Bot Settings — Vittain AI Console" },
      {
        property: "og:description",
        content:
          "A single calm console to tune your bot's persona, knowledge, channel, handoff rules, triggers, actions and widget look.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BotSettingsPage,
});

type TabKey =
  | "identity"
  | "knowledge"
  | "channels"
  | "behavior"
  | "triggers"
  | "mcp"
  | "appearance";

const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "identity", label: "Identity & Persona", icon: UserRound },
  { key: "knowledge", label: "Knowledge Bases", icon: Database },
  { key: "channels", label: "Channels", icon: Globe },
  { key: "behavior", label: "Behavior & Flow", icon: LayoutTemplate },
  { key: "triggers", label: "Proactive Triggers", icon: Zap },
  { key: "mcp", label: "MCP Actions", icon: Plug },
  { key: "appearance", label: "Appearance & Integration", icon: SlidersHorizontal },
];

/* ---------- primitives ---------- */

function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:p-5",
        className,
      )}
    >
      {title && (
        <header className="mb-4 flex items-center gap-2">
          {Icon && <Icon className="size-4 text-muted-foreground" strokeWidth={1.9} />}
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h3>
          <div className="ml-auto">{action}</div>
        </header>
      )}
      {children}
    </section>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline gap-2">
      <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {children}
      </label>
      {hint && <span className="text-[11px] text-muted-foreground/80">{hint}</span>}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-card shadow-card transition-all",
          checked ? "left-[1.15rem]" : "left-0.5",
        )}
      />
    </button>
  );
}

function ToggleRow({
  title,
  desc,
  defaultChecked = false,
}: {
  title: string;
  desc?: string;
  defaultChecked?: boolean;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div className="flex items-start gap-3 border-t border-border/70 py-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        {desc && <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{desc}</p>}
      </div>
      <div className="ml-auto pt-0.5">
        <Toggle checked={on} onChange={setOn} label={title} />
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-surface px-2 py-1 font-mono text-[11px] text-secondary-foreground">
      {children}
    </span>
  );
}

/* ---------- tab contents ---------- */

function IdentityTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Panel title="Bot identity" icon={Bot}>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-border/70 bg-surface text-muted-foreground">
              <Bot className="size-6" strokeWidth={1.7} />
            </div>
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel hint="internal">Internal name</FieldLabel>
                <input defaultValue="webchatbot" className={inputClass} />
              </div>
              <div>
                <FieldLabel hint="customer facing">Display name</FieldLabel>
                <input defaultValue="Aria" className={inputClass} />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <FieldLabel>System prompt</FieldLabel>
              <span className="mb-1.5 rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-secondary-foreground">
                AI core
              </span>
            </div>
            <textarea
              rows={7}
              defaultValue="You are Aria, a warm and precise support agent for a premium e-commerce store. Answer only from linked knowledge, keep replies under 60 words, and hand off to a human for refunds."
              className={cn(inputClass, "resize-none leading-relaxed")}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Language model</FieldLabel>
              <select defaultValue="gpt-4o" className={inputClass}>
                <option value="gpt-4o">GPT-4o (recommended)</option>
                <option value="gpt-4o-mini">GPT-4o mini (fast)</option>
                <option value="claude">Claude Sonnet</option>
              </select>
            </div>
            <div>
              <FieldLabel>Primary language</FieldLabel>
              <select defaultValue="en" className={inputClass}>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="es">Spanish</option>
              </select>
            </div>
          </div>

          <div className="mt-2">
            <ToggleRow
              title="Auto-detect & match customer language"
              desc="Detects language from the first message and replies in kind."
              defaultChecked
            />
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Opening behavior" icon={Sparkles}>
          <FieldLabel>Opening message</FieldLabel>
          <textarea
            rows={3}
            defaultValue="Hey 👋 Welcome to our store! Get 25% OFF today!"
            className={cn(inputClass, "resize-none")}
          />
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip>{"{{customer_name}}"}</Chip>
            <Chip>{"{{cart_value}}"}</Chip>
            <Chip>{"{{store_name}}"}</Chip>
          </div>

          <div className="mt-4">
            <ToggleRow title="Show automatically" defaultChecked />
            <div className="flex items-center gap-3 border-t border-border/70 py-3">
              <p className="text-[13px] font-medium text-foreground">Show after</p>
              <select defaultValue="3" className={cn(inputClass, "ml-auto w-32")}>
                <option value="0">Immediately</option>
                <option value="3">3 seconds</option>
                <option value="10">10 seconds</option>
              </select>
            </div>
            <ToggleRow title="Popup bubble only" />
            <ToggleRow title="Once per session" defaultChecked />
          </div>
        </Panel>

        <Panel title="Tone presets" icon={Wand2}>
          <div className="flex flex-wrap gap-2">
            {["Warm", "Concise", "Playful", "Formal", "Expert"].map((t, i) => (
              <button
                key={t}
                type="button"
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                  i === 0
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border/70 text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const knowledgeBases = [
  { name: "Product catalog", chunks: 482, updated: "2 hrs ago" },
  { name: "Shipping & returns", chunks: 96, updated: "Yesterday" },
  { name: "test2", chunks: 0, updated: "Not indexed" },
];

function KnowledgeTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Panel
        title="Linked knowledge"
        icon={BookOpen}
        action={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-3.5" strokeWidth={2.2} />
            Link knowledge
          </button>
        }
      >
        <p className="-mt-2 mb-4 text-[12.5px] text-muted-foreground">
          Documents, websites and FAQs the bot may read from.
        </p>
        <div className="flex flex-col gap-2.5">
          {knowledgeBases.map((kb) => (
            <div
              key={kb.name}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5 transition-shadow hover:shadow-card"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-surface text-muted-foreground">
                <BookOpen className="size-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-foreground">{kb.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {kb.chunks} chunks · {kb.updated}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${kb.name}`}
                className="ml-auto grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="size-3.5" strokeWidth={1.9} />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel title="Advanced retrieval" icon={Settings2}>
          <ToggleRow
            title="Response caching"
            desc="Same question returns a cached answer instantly. Saves tokens and latency."
            defaultChecked
          />
          <ToggleRow
            title="Semantic reranking"
            desc="Re-ranks retrieved chunks by exact relevance before answering."
          />
          <ToggleRow title="Cite sources in replies" desc="Adds a compact source link per answer." />
        </Panel>

        <Panel className="border-dashed">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-muted-foreground">
              <UploadCloud className="size-4.5" strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-foreground">Quick create</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                Upload a file or paste a URL to add knowledge fast.
              </p>
              <button
                type="button"
                className="mt-3 rounded-full border border-border/70 px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                Open quick creator
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const channelOptions: { key: string; label: string; icon: LucideIcon; hint: string }[] = [
  { key: "web", label: "Webchat", icon: Globe, hint: "No external account needed" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, hint: "Requires verified number" },
  { key: "telegram", label: "Telegram", icon: Send, hint: "Bot token required" },
  { key: "slack", label: "Slack", icon: Hash, hint: "Internal workspaces" },
];

function ChannelsTab() {
  const [selected, setSelected] = useState("web");
  const active = channelOptions.find((c) => c.key === selected)!;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Channel deployment" icon={Globe}>
        <p className="-mt-2 mb-4 text-[12.5px] text-muted-foreground">
          Select the single primary channel this bot operates on.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {channelOptions.map(({ key, label, icon: Icon, hint }) => {
            const on = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-all",
                  on
                    ? "border-foreground/80 bg-surface shadow-card"
                    : "border-border/70 bg-background hover:-translate-y-0.5 hover:shadow-card",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-xl",
                    on ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground",
                  )}
                >
                  <Icon className="size-4.5" strokeWidth={1.9} />
                </span>
                <span className="text-[13px] font-semibold text-foreground">{label}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel className="bg-surface">
        <div className="flex items-start gap-3">
          <active.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.9} />
          <div>
            <p className="text-[13px] font-semibold text-foreground">{active.label} enabled</p>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
              {active.key === "web"
                ? "Webchat needs no external account. Customize the widget and copy the install snippet from Appearance & Integration."
                : `Connect your ${active.label} account credentials to start routing conversations through this channel.`}
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ---------- behavior & flow ---------- */

type QuickReply = { id: number; label: string; action: string };
type TopicRule = { id: number; keywords: string; response: string; searchKb: boolean };
type CollectionPoint = {
  id: number;
  question: string;
  type: string;
  variable: string;
  destination: string;
  invalidMsg: string;
  required: boolean;
  triggerAction: boolean;
};

const dashedButton =
  "inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

function SubCard({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove?: (() => void) | undefined;
}) {
  return (
    <div className="relative rounded-xl border border-border/70 bg-background p-3.5">
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          onClick={onRemove}
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="size-3.5" strokeWidth={1.9} />
        </button>
      )}
      {children}
    </div>
  );
}

function InlineToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Toggle checked={checked} onChange={onChange} label={label} />
      <span className="text-[12px] text-muted-foreground">{label}</span>
    </div>
  );
}

let uid = 100;
const nextId = () => ++uid;

function BehaviorTab() {
  const [confidence, setConfidence] = useState(65);
  const [replies, setReplies] = useState<QuickReply[]>([
    { id: 1, label: "Track order", action: "flow" },
    { id: 2, label: "Get offer", action: "" },
    { id: 3, label: "Talk to human", action: "human" },
  ]);
  const [rules, setRules] = useState<TopicRule[]>([
    {
      id: 1,
      keywords: "shipping, delivery, time",
      response: "Standard shipping takes 3-5 business days. Express shipping is 1-2 days.",
      searchKb: true,
    },
  ]);
  const [points, setPoints] = useState<CollectionPoint[]>([
    {
      id: 1,
      question: "What's your email?",
      type: "email",
      variable: "customer_email",
      destination: "contact",
      invalidMsg: "",
      required: true,
      triggerAction: false,
    },
  ]);
  const [outOfHours, setOutOfHours] = useState("queue");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Panel title="Greeting & main menu" icon={MessageCircle}>
          <FieldLabel>First message</FieldLabel>
          <textarea
            rows={3}
            defaultValue="Hi {{customer_name}}! I'm Aria 🌸 I can help you find the perfect product. What are you looking for today?"
            className={cn(inputClass, "resize-none")}
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <ToggleRow title="Ask for name" defaultChecked />
            <ToggleRow title="Ask for email" />
          </div>

          <FieldLabel>Quick reply buttons</FieldLabel>
          <div className="flex flex-col gap-2">
            {replies.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <input
                  value={r.label}
                  onChange={(e) =>
                    setReplies((p) =>
                      p.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)),
                    )
                  }
                  className={inputClass}
                />
                <select
                  value={r.action}
                  onChange={(e) =>
                    setReplies((p) =>
                      p.map((x) => (x.id === r.id ? { ...x, action: e.target.value } : x)),
                    )
                  }
                  className={cn(inputClass, "w-32")}
                >
                  <option value="">Action…</option>
                  <option value="flow">Trigger flow</option>
                  <option value="human">Talk to human</option>
                  <option value="link">Open link</option>
                  <option value="collect">Collect data</option>
                </select>
                <button
                  type="button"
                  aria-label={`Remove ${r.label}`}
                  onClick={() => setReplies((p) => p.filter((x) => x.id !== r.id))}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.9} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setReplies((p) => [...p, { id: nextId(), label: "New button", action: "" }])
              }
              className={cn(dashedButton, "mt-1")}
            >
              <Plus className="size-3.5" strokeWidth={2.2} />
              Add button
            </button>
          </div>
        </Panel>

        <Panel title="Explicit topic rules" icon={Settings2}>
          <p className="-mt-2 mb-3 text-[12px] text-muted-foreground">
            Deterministic answers for critical questions — these always win over the model.
          </p>
          <div className="flex flex-col gap-2.5">
            {rules.map((rule) => (
              <SubCard
                key={rule.id}
                onRemove={
                  rules.length > 1
                    ? () => setRules((p) => p.filter((x) => x.id !== rule.id))
                    : undefined
                }
              >
                <FieldLabel>Keywords (comma separated)</FieldLabel>
                <input
                  value={rule.keywords}
                  onChange={(e) =>
                    setRules((p) =>
                      p.map((x) => (x.id === rule.id ? { ...x, keywords: e.target.value } : x)),
                    )
                  }
                  className={inputClass}
                />
                <div className="mt-3">
                  <FieldLabel>Bot response</FieldLabel>
                  <textarea
                    rows={3}
                    value={rule.response}
                    onChange={(e) =>
                      setRules((p) =>
                        p.map((x) => (x.id === rule.id ? { ...x, response: e.target.value } : x)),
                      )
                    }
                    className={cn(inputClass, "resize-none")}
                  />
                </div>
                <div className="mt-3 border-t border-border/70 pt-3">
                  <InlineToggle
                    label="Search KB for more detail"
                    checked={rule.searchKb}
                    onChange={(v) =>
                      setRules((p) => p.map((x) => (x.id === rule.id ? { ...x, searchKb: v } : x)))
                    }
                  />
                </div>
              </SubCard>
            ))}
            <button
              type="button"
              onClick={() =>
                setRules((p) => [
                  ...p,
                  { id: nextId(), keywords: "", response: "", searchKb: false },
                ])
              }
              className={dashedButton}
            >
              <Plus className="size-3.5" strokeWidth={2.2} />
              Add topic rule
            </button>
          </div>
        </Panel>

        <Panel
          title="Data collection points"
          icon={Database}
          action={
            <select defaultValue="" className={cn(inputClass, "w-40 py-1.5 text-[12px]")}>
              <option value="">Use template…</option>
              <option value="lead">Lead qualification</option>
              <option value="support">Support ticket</option>
              <option value="booking">Booking details</option>
            </select>
          }
        >
          <div className="flex flex-col gap-2.5">
            {points.map((pt) => (
              <SubCard
                key={pt.id}
                onRemove={() => setPoints((p) => p.filter((x) => x.id !== pt.id))}
              >
                <FieldLabel>Question to ask</FieldLabel>
                <input
                  value={pt.question}
                  onChange={(e) =>
                    setPoints((p) =>
                      p.map((x) => (x.id === pt.id ? { ...x, question: e.target.value } : x)),
                    )
                  }
                  className={inputClass}
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Data type</FieldLabel>
                    <select
                      value={pt.type}
                      onChange={(e) =>
                        setPoints((p) =>
                          p.map((x) => (x.id === pt.id ? { ...x, type: e.target.value } : x)),
                        )
                      }
                      className={inputClass}
                    >
                      <option value="text">Text</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="choice">Choice</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Variable name</FieldLabel>
                    <input
                      value={pt.variable}
                      onChange={(e) =>
                        setPoints((p) =>
                          p.map((x) => (x.id === pt.id ? { ...x, variable: e.target.value } : x)),
                        )
                      }
                      className={cn(inputClass, "font-mono text-[12px]")}
                    />
                  </div>
                  <div>
                    <FieldLabel>Save destination</FieldLabel>
                    <select
                      value={pt.destination}
                      onChange={(e) =>
                        setPoints((p) =>
                          p.map((x) => (x.id === pt.id ? { ...x, destination: e.target.value } : x)),
                        )
                      }
                      className={inputClass}
                    >
                      <option value="contact">Contact record</option>
                      <option value="conversation">Conversation only</option>
                      <option value="crm">CRM (webhook)</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Invalid response msg</FieldLabel>
                    <input
                      value={pt.invalidMsg}
                      placeholder="That doesn't look valid…"
                      onChange={(e) =>
                        setPoints((p) =>
                          p.map((x) => (x.id === pt.id ? { ...x, invalidMsg: e.target.value } : x)),
                        )
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-5 border-t border-border/70 pt-3">
                  <InlineToggle
                    label="Required"
                    checked={pt.required}
                    onChange={(v) =>
                      setPoints((p) => p.map((x) => (x.id === pt.id ? { ...x, required: v } : x)))
                    }
                  />
                  <InlineToggle
                    label="Trigger action on collection"
                    checked={pt.triggerAction}
                    onChange={(v) =>
                      setPoints((p) =>
                        p.map((x) => (x.id === pt.id ? { ...x, triggerAction: v } : x)),
                      )
                    }
                  />
                </div>
              </SubCard>
            ))}
            <button
              type="button"
              onClick={() =>
                setPoints((p) => [
                  ...p,
                  {
                    id: nextId(),
                    question: "",
                    type: "text",
                    variable: "",
                    destination: "contact",
                    invalidMsg: "",
                    required: false,
                    triggerAction: false,
                  },
                ])
              }
              className={dashedButton}
            >
              <Plus className="size-3.5" strokeWidth={2.2} />
              Add collection point
            </button>
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Human handoff rules" icon={UserRound}>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-foreground">Confidence threshold</p>
            <span className="text-[13px] font-semibold tabular-nums text-foreground">
              {confidence}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--primary)]"
          />
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            Hand off when the bot's answer confidence drops below this.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Max turns</FieldLabel>
              <input type="number" defaultValue={10} className={inputClass} />
            </div>
            <div>
              <FieldLabel>Auto-close (mins)</FieldLabel>
              <input type="number" defaultValue={30} className={inputClass} />
            </div>
          </div>

          <div className="mt-3">
            <FieldLabel>Routing target</FieldLabel>
            <select defaultValue="any" className={inputClass}>
              <option value="any">Any available agent</option>
              <option value="billing">Billing team</option>
              <option value="vip">VIP desk</option>
            </select>
          </div>

          <div className="mt-3">
            <FieldLabel>Escalation keywords</FieldLabel>
            <input
              defaultValue="refund, cancel order, speak to manager"
              className={inputClass}
            />
          </div>

          <div className="mt-3">
            <FieldLabel>Handoff message</FieldLabel>
            <textarea
              rows={3}
              defaultValue="I am connecting you to a human agent who can assist you further. Please hold on."
              className={cn(inputClass, "resize-none")}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <ToggleRow title="Email alert" defaultChecked />
            <ToggleRow title="Slack alert" />
          </div>
          <ToggleRow
            title="Escalate on negative sentiment"
            desc="Detects frustration and routes to a human immediately."
            defaultChecked
          />
        </Panel>

        <Panel title="Business hours" icon={Clock}>
          <ToggleRow
            title="Restrict live handoff to business hours"
            desc="Outside hours the bot collects a message instead."
          />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Opens</FieldLabel>
              <input type="time" defaultValue="09:00" className={inputClass} />
            </div>
            <div>
              <FieldLabel>Closes</FieldLabel>
              <input type="time" defaultValue="18:00" className={inputClass} />
            </div>
          </div>
          <div className="mt-3">
            <FieldLabel>Out of hours behavior</FieldLabel>
            <select
              value={outOfHours}
              onChange={(e) => setOutOfHours(e.target.value)}
              className={inputClass}
            >
              <option value="queue">Queue for human</option>
              <option value="bot">Bot only (no handoff)</option>
              <option value="collect">Collect email & close</option>
            </select>
          </div>
          <div className="mt-3">
            <FieldLabel>Offline message</FieldLabel>
            <textarea
              rows={3}
              defaultValue="We're currently offline. We'll get back to you during business hours."
              className={cn(inputClass, "resize-none")}
            />
          </div>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-foreground underline-offset-4 hover:underline"
          >
            Configure schedule in workspace settings →
          </button>
        </Panel>

        <Panel title="Fallback & safety" icon={Wand2}>
          <FieldLabel>Fallback message</FieldLabel>
          <textarea
            rows={2}
            defaultValue="I'm not certain about that yet — let me get a teammate to confirm."
            className={cn(inputClass, "resize-none")}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Retries before handoff</FieldLabel>
              <input type="number" defaultValue={2} className={inputClass} />
            </div>
            <div>
              <FieldLabel>Typing delay (ms)</FieldLabel>
              <input type="number" defaultValue={600} className={inputClass} />
            </div>
          </div>
          <div className="mt-2">
            <ToggleRow
              title="Stay strictly within knowledge base"
              desc="Refuses to answer anything not grounded in linked sources."
              defaultChecked
            />
            <ToggleRow title="Mask personal data in transcripts" defaultChecked />
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ---------- proactive triggers ---------- */

const triggers = [
  {
    name: "Exit intent offer",
    when: "Cursor leaves viewport · cart > $50",
    message: "Wait! Here's 10% off if you check out now.",
    fires: 428,
  },
  {
    name: "Idle on pricing",
    when: "30s idle on /pricing",
    message: "Need help choosing a plan? I can compare them for you.",
    fires: 213,
  },
  {
    name: "Repeat visitor welcome",
    when: "3rd session within 7 days",
    message: "Welcome back 👋 want to pick up where you left off?",
    fires: 96,
  },
];

const eventTypes = [
  { value: "cart_updated", label: "cart_updated" },
  { value: "page_view", label: "page_view" },
  { value: "idle_time", label: "idle_time" },
  { value: "exit_intent", label: "exit_intent" },
  { value: "session_count", label: "session_count" },
];

const operators = [">=", ">", "=", "<", "<=", "contains"];

type Condition = { id: number; event: string; op: string; value: string };

function TriggersTab() {
  const [conditions, setConditions] = useState<Condition[]>([
    { id: 1, event: "cart_updated", op: ">=", value: "1000" },
  ]);
  const [ruleName, setRuleName] = useState("");
  const [actionType, setActionType] = useState("widget");
  const [payload, setPayload] = useState("");
  const [channels, setChannels] = useState<string[]>(["web"]);
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [mockValue, setMockValue] = useState("1500");
  const [simEvent, setSimEvent] = useState("cart_updated");
  const [result, setResult] = useState<{ fires: boolean; text: string } | null>(null);

  const toggleChannel = (key: string) =>
    setChannels((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]));

  const runSimulation = () => {
    const cond = conditions.find((c) => c.event === simEvent);
    if (!cond) {
      setResult({ fires: false, text: `No condition listens to ${simEvent}.` });
      return;
    }
    const a = Number(mockValue);
    const b = Number(cond.value);
    const ok =
      cond.op === ">=" ? a >= b
      : cond.op === ">" ? a > b
      : cond.op === "=" ? a === b
      : cond.op === "<" ? a < b
      : cond.op === "<=" ? a <= b
      : mockValue.includes(cond.value);
    setResult({
      fires: ok,
      text: `Condition ${cond.event} ${cond.op} ${cond.value} ${ok ? "matched" : "did not match"} mock value ${mockValue}.`,
    });
  };

  const channelOptions = [
    { key: "web", label: "Web widget" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "telegram", label: "Telegram" },
    { key: "slack", label: "Slack alert" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Panel
          title="Proactive triggers"
          icon={Zap}
          action={
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" strokeWidth={2.2} />
              New trigger
            </button>
          }
        >
          <div className="flex flex-col gap-2.5">
            {triggers.map((t) => (
              <div
                key={t.name}
                className="rounded-xl border border-border/70 bg-background p-3.5 transition-shadow hover:shadow-card"
              >
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-semibold text-foreground">{t.name}</p>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-secondary-foreground">
                    {t.fires} fires
                  </span>
                  <div className="ml-auto">
                    <ToggleRow title={`${t.name} enabled`} defaultChecked />
                  </div>
                </div>
                <p className="mt-1 text-[11.5px] text-muted-foreground">When · {t.when}</p>
                <p className="mt-2 rounded-lg bg-surface px-2.5 py-2 text-[12.5px] text-secondary-foreground">
                  {t.message}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Configure trigger rule"
          icon={Plus}
          action={
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">Status</span>
              <Toggle checked={ruleEnabled} onChange={setRuleEnabled} label="Rule status" />
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Rule name</FieldLabel>
              <input
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="e.g. Cart upsell $1500 to $2000"
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>Description (internal)</FieldLabel>
              <input placeholder="Fires when cart is near threshold" className={inputClass} />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border/70 bg-background p-3.5">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-secondary-foreground">
                If
              </span>
              <h4 className="text-[13px] font-semibold text-foreground">Conditions</h4>
            </div>
            <div className="flex flex-col gap-2">
              {conditions.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2">
                  <select
                    value={c.event}
                    onChange={(e) =>
                      setConditions((p) =>
                        p.map((x) => (x.id === c.id ? { ...x, event: e.target.value } : x)),
                      )
                    }
                    className={cn(inputClass, "w-40")}
                  >
                    {eventTypes.map((ev) => (
                      <option key={ev.value} value={ev.value}>
                        {ev.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={c.op}
                    onChange={(e) =>
                      setConditions((p) =>
                        p.map((x) => (x.id === c.id ? { ...x, op: e.target.value } : x)),
                      )
                    }
                    className={cn(inputClass, "w-24")}
                  >
                    {operators.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                  <input
                    value={c.value}
                    placeholder="Value"
                    onChange={(e) =>
                      setConditions((p) =>
                        p.map((x) => (x.id === c.id ? { ...x, value: e.target.value } : x)),
                      )
                    }
                    className={cn(inputClass, "min-w-0 flex-1")}
                  />
                  <button
                    type="button"
                    aria-label="Remove condition"
                    onClick={() => setConditions((p) => p.filter((x) => x.id !== c.id))}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.9} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setConditions((p) => [
                    ...p,
                    { id: nextId(), event: "page_view", op: "=", value: "" },
                  ])
                }
                className={cn(dashedButton, "w-auto")}
              >
                <Plus className="size-3.5" strokeWidth={2.2} />
                AND condition
              </button>
              <button
                type="button"
                onClick={() =>
                  setConditions((p) => [
                    ...p,
                    { id: nextId(), event: "idle_time", op: ">=", value: "" },
                  ])
                }
                className={cn(dashedButton, "w-auto")}
              >
                <Plus className="size-3.5" strokeWidth={2.2} />
                OR group
              </button>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-border/70 bg-background p-3.5">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success-foreground">
                Then
              </span>
              <h4 className="text-[13px] font-semibold text-foreground">Action</h4>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Action type</FieldLabel>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className={inputClass}
                >
                  <option value="widget">Send widget message</option>
                  <option value="coupon">Generate coupon</option>
                  <option value="handoff">Notify human agent</option>
                  <option value="webhook">Call MCP action</option>
                </select>
              </div>
              <div>
                <FieldLabel>Target channels</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {channelOptions.map((ch) => {
                    const on = channels.includes(ch.key);
                    return (
                      <button
                        key={ch.key}
                        type="button"
                        onClick={() => toggleChannel(ch.key)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors",
                          on
                            ? "border-foreground/30 bg-primary text-primary-foreground"
                            : "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        {on && <CheckCircle2 className="size-3.5" strokeWidth={2} />}
                        {ch.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <FieldLabel>Message payload (supports variables)</FieldLabel>
                <div className="mb-1.5 flex gap-1.5">
                  <Chip>{"{{customer_name}}"}</Chip>
                  <Chip>{"{{cart_value}}"}</Chip>
                </div>
              </div>
              <textarea
                rows={3}
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                placeholder="You are just {{missing_amount}} away from free shipping!"
                className={cn(inputClass, "resize-none")}
              />
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-[13px] font-semibold text-foreground">
              Anti-spam & frequency controls
            </h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Max fires per session</FieldLabel>
                <input type="number" defaultValue={1} className={inputClass} />
              </div>
              <div>
                <FieldLabel>Max fires per day</FieldLabel>
                <input type="number" defaultValue={1} className={inputClass} />
              </div>
            </div>
            <ToggleRow title="Don't fire if customer is in an active conversation" defaultChecked />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Save rule
            </button>
            <button
              type="button"
              onClick={() => {
                setRuleName("");
                setPayload("");
                setResult(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Live testing panel" icon={Search}>
          <p className="-mt-2 mb-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Simulate a customer event to see if this trigger rule would fire before saving it.
          </p>
          <FieldLabel>Simulate event type</FieldLabel>
          <select
            value={simEvent}
            onChange={(e) => setSimEvent(e.target.value)}
            className={inputClass}
          >
            {eventTypes.map((ev) => (
              <option key={ev.value} value={ev.value}>
                {ev.label}
              </option>
            ))}
          </select>
          <div className="mt-3">
            <FieldLabel>Mock event value</FieldLabel>
            <input
              value={mockValue}
              onChange={(e) => setMockValue(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={runSimulation}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-card px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Search className="size-3.5" strokeWidth={2} />
            Run simulation
          </button>

          {result && (
            <div
              className={cn(
                "mt-3 rounded-xl border p-3",
                result.fires
                  ? "border-success/40 bg-success/10"
                  : "border-border/70 bg-background",
              )}
            >
              <div className="flex items-center gap-1.5">
                <CheckCircle2
                  className={cn("size-4", result.fires ? "text-success" : "text-muted-foreground")}
                  strokeWidth={2}
                />
                <p className="text-[13px] font-semibold text-foreground">
                  Rule {result.fires ? "WOULD" : "would NOT"} fire
                </p>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                {result.text}
              </p>
              {result.fires && payload && (
                <>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Simulated output
                  </p>
                  <p className="mt-1 rounded-lg bg-card px-2.5 py-2 text-[12.5px] text-foreground">
                    "{payload}"
                  </p>
                </>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Frequency guardrails" icon={Settings2}>
          <div className="grid gap-3">
            <div>
              <FieldLabel>Max triggers per session</FieldLabel>
              <input type="number" defaultValue={2} className={inputClass} />
            </div>
            <div>
              <FieldLabel>Cooldown between triggers (mins)</FieldLabel>
              <input type="number" defaultValue={15} className={inputClass} />
            </div>
          </div>
          <div className="mt-3">
            <ToggleRow title="Pause triggers during live handoff" defaultChecked />
            <ToggleRow title="Skip returning customers with open tickets" defaultChecked />
          </div>
        </Panel>
      </div>
    </div>
  );
}

const actions = [
  {
    name: "check_order_status",
    method: "POST",
    path: "/api/mcp/orders",
    context: "Look up customer order status by email or order ID",
  },
  {
    name: "generate_coupon",
    method: "POST",
    path: "/api/mcp/coupons",
    context: "Generate a unique discount coupon code",
  },
  {
    name: "create_ticket",
    method: "POST",
    path: "/api/mcp/tickets",
    context: "Create a support ticket when the issue needs a human",
  },
];

function McpTab() {
  return (
    <Panel
      title="MCP actions (functions)"
      icon={Plug}
      action={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" strokeWidth={2.2} />
          Add action
        </button>
      }
    >
      <p className="-mt-2 mb-4 text-[12.5px] text-muted-foreground">
        Let the bot fetch data or trigger external work — order lookups, coupons, tickets — through
        webhooks.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {actions.map((a) => (
          <div
            key={a.name}
            className="rounded-xl border border-border/70 bg-background p-3.5 transition-shadow hover:shadow-card"
          >
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-surface text-muted-foreground">
                <Plug className="size-4" strokeWidth={1.8} />
              </span>
              <p className="truncate font-mono text-[12.5px] font-semibold text-foreground">
                {a.name}
              </p>
              <button
                type="button"
                aria-label={`Configure ${a.name}`}
                className="ml-auto grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Settings2 className="size-3.5" strokeWidth={1.9} />
              </button>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-secondary-foreground">
                {a.method}
              </span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{a.path}</span>
            </div>
            <p className="mt-3 rounded-lg border border-border/70 px-2.5 py-2 text-[12.5px] text-secondary-foreground">
              {a.context}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/70 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Search className="size-3.5" strokeWidth={1.9} />
                Test payload
              </button>
              <button
                type="button"
                aria-label={`Delete ${a.name}`}
                className="grid size-8 place-items-center rounded-lg border border-border/70 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" strokeWidth={1.9} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AppearanceTab() {
  const [title, setTitle] = useState("AI Assistant");
  const [color, setColor] = useState("#1d1d1f");
  const [welcome, setWelcome] = useState("Hi there! How can I help you today?");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Panel title="Widget customization" icon={SlidersHorizontal}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Widget title</FieldLabel>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel>Theme color</FieldLabel>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label="Theme color"
                  className="size-9 shrink-0 cursor-pointer rounded-xl border border-border/70 bg-background p-1"
                />
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className={cn(inputClass, "font-mono")}
                />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <FieldLabel hint="used if no trigger fires">Fallback welcome message</FieldLabel>
            <textarea
              rows={3}
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              className={cn(inputClass, "resize-none")}
            />
          </div>
          <div className="mt-2">
            <ToggleRow title="Show “Powered by Vittain AI”" defaultChecked />
            <ToggleRow title="Launcher on mobile" defaultChecked />
          </div>
        </Panel>

        <Panel title="Web installation snippet" icon={Copy}>
          <p className="-mt-2 mb-3 text-[12.5px] text-muted-foreground">
            Paste this just before the closing body tag on your site.
          </p>
          <div className="relative rounded-xl bg-primary p-3.5">
            <button
              type="button"
              className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-lg bg-primary-foreground/10 px-2 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-80"
            >
              <Copy className="size-3" strokeWidth={2} />
              Copy
            </button>
            <pre className="overflow-x-auto whitespace-pre font-mono text-[11px] leading-relaxed text-primary-foreground/90">{`<script>
  window.VITTAIN_CONFIG = {
    botId: "a1c24249-0bf4-4219-8b0a-cdfe6667f345",
  };
</script>
<script src="https://cdn.vittain.ai/widget.js" async></script>`}</pre>
          </div>
        </Panel>
      </div>

      <Panel title="Live preview" icon={Sparkles}>
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border/70 bg-background shadow-card">
          <div
            className="flex items-center gap-2.5 px-4 py-3"
            style={{ backgroundColor: color }}
          >
            <span className="grid size-8 place-items-center rounded-full bg-white/15 text-white">
              <Bot className="size-4" strokeWidth={1.9} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-white">{title || "AI Assistant"}</p>
              <p className="text-[10.5px] text-white/70">Online now</p>
            </div>
          </div>
          <div className="flex min-h-56 flex-col gap-2 bg-surface px-3.5 py-4">
            <span className="mx-auto rounded-full bg-card px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Today
            </span>
            <div className="max-w-[80%] rounded-2xl rounded-tl-md border border-border/70 bg-card px-3 py-2 text-[12.5px] text-foreground shadow-card">
              {welcome}
            </div>
            <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-md px-3 py-2 text-[12.5px] text-white" style={{ backgroundColor: color }}>
              Do you ship to Berlin?
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border/70 bg-card px-3 py-2.5">
            <input
              placeholder="Type your message…"
              className="h-8 flex-1 rounded-full border border-border/70 bg-background px-3 text-[12px] outline-none placeholder:text-muted-foreground"
            />
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full text-white"
              style={{ backgroundColor: color }}
            >
              <Send className="size-3.5" strokeWidth={2} />
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ---------- page ---------- */

function BotSettingsPage() {
  const { botId } = Route.useParams();
  const [tab, setTab] = useState<TabKey>("identity");

  return (
    <AppShell
      header={({ menuButton }) => (
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-5">
          {menuButton}
          <p className="truncate text-xs text-muted-foreground">Bots / {botId} / Edit</p>
          <div className="ml-auto flex items-center gap-2">
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
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2} />
          Back to bots
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-surface text-muted-foreground">
              <Bot className="size-5" strokeWidth={1.8} />
            </span>
            <div>
              <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-foreground sm:text-[26px]">
                webchatbot settings
              </h1>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Persona, knowledge, channel, behavior, triggers and actions — all in one place.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              <LayoutTemplate className="size-3.5" strokeWidth={2} />
              Visual builder
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Save configuration
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="flex gap-1 overflow-x-auto border-b border-border/70 px-2 py-2">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
                  tab === key
                    ? "bg-primary font-medium text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" strokeWidth={1.9} />
                {label}
              </button>
            ))}
          </div>

          <div className="bg-surface/60 p-3 sm:p-4">
            {tab === "identity" && <IdentityTab />}
            {tab === "knowledge" && <KnowledgeTab />}
            {tab === "channels" && <ChannelsTab />}
            {tab === "behavior" && <BehaviorTab />}
            {tab === "triggers" && <TriggersTab />}
            {tab === "mcp" && <McpTab />}
            {tab === "appearance" && <AppearanceTab />}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
