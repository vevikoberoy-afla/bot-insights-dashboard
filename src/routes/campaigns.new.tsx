import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  Filter,
  Hash,
  Mail,
  MessageCircle,
  Rocket,
  Send,
  Smartphone,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/campaigns/new")({
  head: () => ({
    meta: [
      { title: "Create Campaign — Vittain AI Console" },
      {
        name: "description",
        content:
          "Build and launch a multi-channel campaign: pick a channel, target an audience, design the message and schedule the send.",
      },
      { property: "og:title", content: "Create Campaign — Vittain AI Console" },
      {
        property: "og:description",
        content:
          "Four-step campaign builder for WhatsApp, Email, SMS, Telegram and Slack with live audience reach preview.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateCampaignPage,
});

const steps = [
  { id: 1, title: "Basics & channel", hint: "Name, type, delivery channel" },
  { id: 2, title: "Audience", hint: "Segments, filters, uploads" },
  { id: 3, title: "Message design", hint: "Template & variables" },
  { id: 4, title: "Schedule & launch", hint: "Review, consent, send" },
];

type ChannelKey = "whatsapp" | "email" | "sms" | "telegram" | "slack";

const channels: {
  key: ChannelKey;
  label: string;
  icon: LucideIcon;
  hint: string;
  tint: string;
}[] = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, hint: "High open rates · Templates required", tint: "var(--chart-3)" },
  { key: "email", label: "Email", icon: Mail, hint: "Rich formatting · No opt-in limit", tint: "var(--chart-5)" },
  { key: "sms", label: "SMS", icon: Smartphone, hint: "Direct alerts · 160 chars", tint: "var(--chart-4)" },
  { key: "telegram", label: "Telegram", icon: Send, hint: "Bot broadcasts · No limits", tint: "var(--chart-2)" },
  { key: "slack", label: "Slack", icon: Hash, hint: "Internal team messaging", tint: "var(--chart-1)" },
];

const segments = [
  { id: "hot", name: "Hot Leads (Score > 80)", desc: "Highly engaged contacts who haven’t purchased.", contacts: 342, icon: Users },
  { id: "vip", name: "VIP Buyers", desc: "Total spend > 5,000", contacts: 128, icon: Filter },
  { id: "cart", name: "Cart Abandoners · 7d", desc: "Left checkout in the last week.", contacts: 486, icon: Upload },
];

const templates = [
  { id: "bf", label: "black_friday_promo", body: "Hi {{1}}, our Black Friday sale is live! Get 50% off all premium plans." },
  { id: "cart", label: "cart_reminder_v2", body: "Hi {{1}}, you left items in your cart. Complete your order in one tap." },
  { id: "winback", label: "winback_offer", body: "Hi {{1}}, we miss you — here’s 20% off your next order." },
];

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="text-center">
      <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-foreground sm:text-[22px]">
        {title}
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-border/70 bg-card px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40";

function CreateCampaignPage() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [type, setType] = useState("One-off broadcast");
  const [channel, setChannel] = useState<ChannelKey>("whatsapp");
  const [audienceTab, setAudienceTab] = useState<"Saved segments" | "Build filter" | "Upload CSV" | "All contacts">(
    "Saved segments",
  );
  const [segment, setSegment] = useState("hot");
  const [template, setTemplate] = useState("bf");
  const [mapping, setMapping] = useState("Contact: First name");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [sendAt, setSendAt] = useState("2026-09-05T10:00");
  const [consent, setConsent] = useState(false);

  const activeChannel = channels.find((c) => c.key === channel)!;
  const activeSegment = segments.find((s) => s.id === segment)!;
  const activeTemplate = templates.find((t) => t.id === template)!;

  const reach = useMemo(() => {
    const total = audienceTab === "All contacts" ? 2450 : activeSegment.contacts;
    return {
      total,
      whatsapp: Math.round(total * 0.84),
      email: Math.round(total * 0.99),
      sms: Math.round(total * 0.46),
    };
  }, [audienceTab, activeSegment]);

  const canContinue =
    step === 1 ? name.trim().length > 0 : step === 4 ? consent : true;

  return (
    <AppShell
      header={({ menuButton }) => (
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-5">
          {menuButton}
          <p className="text-xs text-muted-foreground">Campaigns / Create</p>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/campaigns"
              className="hidden rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent sm:block"
            >
              All campaigns
            </Link>
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
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-foreground sm:text-[26px]">
            Create campaign
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Launch an automated multi-channel outreach sequence in four steps.
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
          {/* Left: vertical stepper */}
          <aside className="rounded-2xl border border-border/70 bg-card p-3 shadow-card">
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                Progress
              </p>
              <span className="text-[11px] font-semibold tabular-nums text-foreground">
                {Math.round(((step - 1) / (steps.length - 1)) * 100)}%
              </span>
            </div>
            <div className="mx-1 mb-3 h-1 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
              />
            </div>

            <ol className="relative flex flex-col gap-1">
              {steps.map((s, i) => {
                const done = s.id < step;
                const current = s.id === step;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setStep(s.id)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors",
                        current ? "bg-surface" : "hover:bg-accent",
                      )}
                    >
                      <span className="relative flex flex-col items-center">
                        <span
                          className={cn(
                            "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold tabular-nums transition-colors",
                            done
                              ? "border-transparent bg-primary text-primary-foreground"
                              : current
                                ? "border-primary text-primary"
                                : "border-border/80 text-muted-foreground",
                          )}
                        >
                          {done ? <Check className="size-3.5" strokeWidth={2.6} /> : s.id}
                        </span>
                        {i < steps.length - 1 && (
                          <span
                            className={cn(
                              "mt-1 h-6 w-px",
                              done ? "bg-primary/60" : "bg-border/80",
                            )}
                          />
                        )}
                      </span>
                      <span className="min-w-0 pt-0.5">
                        <span
                          className={cn(
                            "block truncate text-[13px] font-medium",
                            current || done ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {s.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                          {s.hint}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          {/* Center: step content */}
          <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:p-6">
            {step === 1 && (
              <div className="space-y-6">
                <SectionTitle title="Campaign basics" sub="Start by naming your campaign and choosing a channel." />
                <div className="mx-auto max-w-xl space-y-4">
                  <Field label="Campaign name">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Black Friday — Hot leads"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Campaign type">
                    <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                      {["One-off broadcast", "Recurring", "Triggered journey"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                      Delivery channel
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {channels.map(({ key, label, icon: Icon, hint, tint }) => {
                        const on = key === channel;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setChannel(key)}
                            className={cn(
                              "relative rounded-2xl border p-3 text-center transition-all",
                              on
                                ? "border-primary/60 bg-primary/[0.04] shadow-card"
                                : "border-border/70 hover:bg-accent",
                            )}
                          >
                            {on && (
                              <CheckCircle2
                                className="absolute right-2 top-2 size-4 text-primary"
                                strokeWidth={2.2}
                              />
                            )}
                            <span
                              className="mx-auto grid size-9 place-items-center rounded-full"
                              style={{
                                color: on ? "var(--primary-foreground)" : tint,
                                backgroundColor: on
                                  ? "var(--primary)"
                                  : `color-mix(in oklab, ${tint} 12%, transparent)`,
                              }}
                            >
                              <Icon className="size-4" strokeWidth={2} />
                            </span>
                            <span className="mt-2 block text-[13px] font-medium text-foreground">{label}</span>
                            <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                              {hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-surface/60 p-3.5">
                    <p className="text-[13px] font-medium text-foreground">
                      Select {activeChannel.label} instance
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Choose which connected account to send from.
                    </p>
                    <div className="mt-3 rounded-xl border border-dashed border-border py-5 text-center">
                      <p className="text-[12px] text-muted-foreground">
                        No {activeChannel.label} accounts connected yet.
                      </p>
                      <button type="button" className="mt-1 text-[12px] font-medium text-primary hover:underline">
                        → Go to integrations to add one
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <SectionTitle title="Target audience" sub="Who should receive this campaign?" />
                <div className="mx-auto max-w-xl space-y-4">
                  <div className="flex flex-wrap gap-1 rounded-xl border border-border/70 bg-surface/60 p-1">
                    {(["Saved segments", "Build filter", "Upload CSV", "All contacts"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setAudienceTab(t)}
                        className={cn(
                          "flex-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
                          audienceTab === t
                            ? "bg-card text-foreground shadow-card"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {audienceTab === "Saved segments" && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                        Select a saved segment
                      </p>
                      {segments.map(({ id, name: sname, desc, contacts, icon: Icon }) => {
                        const on = id === segment;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setSegment(id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all",
                              on ? "border-primary/60 bg-primary/[0.04]" : "border-border/70 hover:bg-accent",
                            )}
                          >
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted-foreground">
                              <Icon className="size-4" strokeWidth={1.9} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-foreground">{sname}</span>
                              <span className="block truncate text-[11px] text-muted-foreground">{desc}</span>
                            </span>
                            <span className="text-right">
                              <span className="block text-[14px] font-semibold tabular-nums text-foreground">
                                {contacts.toLocaleString("en-US")}
                              </span>
                              <span className="block text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                                contacts
                              </span>
                            </span>
                            {on && <CheckCircle2 className="size-4 shrink-0 text-primary" strokeWidth={2.2} />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {audienceTab === "Build filter" && (
                    <div className="space-y-3 rounded-2xl border border-border/70 bg-surface/60 p-3.5">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <select className={inputCls}>
                          {["Lead score", "Total spend", "Last active"].map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                        <select className={inputCls}>
                          {["is greater than", "is less than", "equals"].map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                        <input className={inputCls} placeholder="80" />
                      </div>
                      <button type="button" className="text-[12px] font-medium text-primary hover:underline">
                        + Add condition
                      </button>
                    </div>
                  )}

                  {audienceTab === "Upload CSV" && (
                    <div className="rounded-2xl border border-dashed border-border py-10 text-center">
                      <Upload className="mx-auto size-5 text-muted-foreground" strokeWidth={1.9} />
                      <p className="mt-2 text-[13px] font-medium text-foreground">Drop a CSV file here</p>
                      <p className="text-[11px] text-muted-foreground">Columns: name, phone, email</p>
                    </div>
                  )}

                  {audienceTab === "All contacts" && (
                    <div className="rounded-2xl border border-border/70 bg-surface/60 p-4 text-center">
                      <p className="text-[22px] font-semibold tabular-nums text-foreground">2,450</p>
                      <p className="text-[11px] text-muted-foreground">All opted-in contacts will be targeted.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <SectionTitle title="Design message" sub="Craft what your audience will see." />
                <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
                  <div className="space-y-4">
                    {channel === "whatsapp" && (
                      <div
                        className="rounded-xl px-3 py-2.5 text-[12px]"
                        style={{
                          color: "var(--chart-4)",
                          backgroundColor: "color-mix(in oklab, var(--chart-4) 12%, transparent)",
                        }}
                      >
                        WhatsApp requires a pre-approved template for initial outreach.
                      </div>
                    )}
                    <Field label={`Select ${activeChannel.label} template`}>
                      <select value={template} onChange={(e) => setTemplate(e.target.value)} className={inputCls}>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="rounded-2xl border border-border/70 bg-surface/60 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                        Variable mapping
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="rounded-lg border border-border/70 bg-card px-2 py-1 text-[12px] text-foreground">
                          {"{{1}}"}
                        </code>
                        <span className="text-[11px] text-muted-foreground">maps to</span>
                        <select
                          value={mapping}
                          onChange={(e) => setMapping(e.target.value)}
                          className={cn(inputCls, "h-9 flex-1")}
                        >
                          {["Contact: First name", "Contact: Full name", "Contact: City"].map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-surface/60 p-4">
                    <p className="text-center text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                      Preview
                    </p>
                    <div className="mx-auto mt-3 w-full max-w-[240px] rounded-2xl border border-border/70 bg-card p-3">
                      <div className="rounded-2xl rounded-br-md bg-primary/10 px-3 py-2">
                        <p className="text-[12.5px] leading-relaxed text-foreground">
                          {activeTemplate.body.replace("{{1}}", "Alex")}
                        </p>
                        <p className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">10:42 AM</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <SectionTitle title="Review & schedule" sub="Almost there. Double check your settings." />
                <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border/70 p-3.5">
                      <p className="text-[13px] font-semibold text-foreground">Campaign summary</p>
                      <dl className="mt-3 space-y-2 text-[12.5px]">
                        {[
                          ["Name", name || "Untitled campaign"],
                          ["Type", type],
                          ["Channel", activeChannel.label],
                          [
                            "Audience",
                            `${audienceTab === "All contacts" ? "All contacts" : activeSegment.name} (${reach.total.toLocaleString("en-US")})`,
                          ],
                          ["Template", activeTemplate.label],
                        ].map(([k, v]) => (
                          <div key={k} className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className="text-right font-medium text-foreground">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    <div className="rounded-2xl border border-border/70 p-3.5">
                      <p className="text-[13px] font-semibold text-foreground">Schedule</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {([
                          ["now", "Send now", Rocket],
                          ["later", "Schedule later", CalendarClock],
                        ] as const).map(([key, label, Icon]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setWhen(key)}
                            className={cn(
                              "rounded-2xl border p-3 text-center transition-all",
                              when === key
                                ? "border-primary/60 bg-primary/[0.04]"
                                : "border-border/70 hover:bg-accent",
                            )}
                          >
                            <span
                              className={cn(
                                "mx-auto grid size-8 place-items-center rounded-full",
                                when === key ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground",
                              )}
                            >
                              <Icon className="size-4" strokeWidth={2} />
                            </span>
                            <span className="mt-2 block text-[12.5px] font-medium text-foreground">{label}</span>
                          </button>
                        ))}
                      </div>
                      {when === "later" && (
                        <div className="mt-3">
                          <Field label="Send at">
                            <input
                              type="datetime-local"
                              value={sendAt}
                              onChange={(e) => setSendAt(e.target.value)}
                              className={inputCls}
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className="rounded-2xl border p-3.5"
                    style={{
                      borderColor: "color-mix(in oklab, var(--chart-4) 40%, transparent)",
                      backgroundColor: "color-mix(in oklab, var(--chart-4) 8%, transparent)",
                    }}
                  >
                    <p className="text-[13px] font-semibold text-foreground">Compliance & safety</p>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                      By sending this campaign, you confirm that all recipients have explicitly opted in to receive
                      messages from your business in accordance with local regulations (TCPA, GDPR, etc.).
                    </p>
                    <label className="mt-3 flex items-start gap-2 text-[12.5px] text-foreground">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-0.5 size-4 rounded border-border accent-primary"
                      />
                      I agree and confirm consent.
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-7 flex items-center justify-between border-t border-border/70 pt-4">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                <ArrowLeft className="size-3.5" strokeWidth={2.1} />
                Back
              </button>
              {step < steps.length ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(steps.length, s + 1))}
                  disabled={!canContinue}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Continue
                  <ArrowRight className="size-3.5" strokeWidth={2.1} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!consent}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Launch campaign
                  <Rocket className="size-3.5" strokeWidth={2.1} />
                </button>
              )}
            </div>
          </section>

          {/* Right: live details */}
          <aside className="space-y-3">
            <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-card">
              <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                Audience preview
              </p>
              <p className="mt-2 text-[26px] font-semibold tabular-nums tracking-tight text-foreground">
                {reach.total.toLocaleString("en-US")}
              </p>
              <p className="text-[11px] text-muted-foreground">Estimated total reach</p>

              <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                {[
                  ["WhatsApp", reach.whatsapp, "var(--chart-3)"],
                  ["Email", reach.email, "var(--chart-5)"],
                  ["SMS", reach.sms, "var(--chart-4)"],
                ].map(([label, value, tint]) => (
                  <div key={label as string} className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: tint as string }} />
                      {label as string}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {(value as number).toLocaleString("en-US")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-card">
              <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                Projected results
              </p>
              <div className="mt-2 space-y-2">
                {[
                  ["Delivered", 0.96],
                  ["Opened", 0.62],
                  ["Clicked", 0.24],
                ].map(([label, rate]) => (
                  <div key={label as string}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-muted-foreground">{label as string}</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {Math.round(reach.total * (rate as number)).toLocaleString("en-US")}
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${(rate as number) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-card">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                <Sparkles className="size-3" strokeWidth={2.2} />
                Vittain AI tip
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                {step === 1
                  ? `${activeChannel.label} performs best for this segment between 10:00–12:00 local time.`
                  : step === 2
                    ? "Hot leads convert 3.1× better than a broad blast — keep the segment tight."
                    : step === 3
                      ? "Personalised first-name openers lift click rate by ~18%."
                      : "Scheduling for Saturday 10:00 could raise opens by 9%."}
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-card">
              <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                Send window
              </p>
              <p className="mt-2 text-[12.5px] font-medium text-foreground">
                {when === "now" ? "Immediately after launch" : new Date(sendAt).toLocaleString("en-US")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Quiet hours respected · 22:00–08:00 local
              </p>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
