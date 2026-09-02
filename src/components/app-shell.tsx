import { Link } from "@tanstack/react-router";
import { Bot, ChevronDown, LayoutGrid, Menu, Radio, Users, X, Zap } from "lucide-react";
import { useState, type ReactNode } from "react";

type NavItem = {
  label: string;
  icon: typeof Bot;
  to?: "/" | "/inbox" | "/overview" | "/campaigns";
  badge?: string;
};

const nav: NavItem[] = [
  { label: "Overview", icon: LayoutGrid, to: "/overview" },
  { label: "Live Inbox", icon: Radio, to: "/inbox", badge: "3" },
  { label: "Campaigns", icon: Zap, to: "/campaigns" },
  { label: "Bots", icon: Bot, to: "/" },
  { label: "Analytics", icon: Users },
];


function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2 px-2 pb-6">
        <span className="grid size-7 place-items-center rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground">
          V
        </span>
        <span className="text-sm font-semibold tracking-tight text-foreground">Vittain AI</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {nav.map(({ label, icon: Icon, badge, to }) => {
          const content = (
            <>
              <Icon className="size-4 shrink-0" strokeWidth={1.9} />
              <span className="truncate">{label}</span>
              {badge && (
                <span className="ml-auto rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {badge}
                </span>
              )}
            </>
          );
          const base =
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

          return to ? (
            <Link
              key={label}
              to={to}
              onClick={onNavigate}
              className={base}
              activeProps={{ className: "bg-card font-medium text-foreground shadow-card" }}
              activeOptions={{ exact: true }}
            >
              {content}
            </Link>
          ) : (
            <button key={label} type="button" className={base}>
              {content}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-2 rounded-xl border border-border/70 bg-card px-2.5 py-2">
        <span className="grid size-7 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
          VI
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">Vittain AI</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pro plan</p>
        </div>
        <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      </div>
    </>
  );
}

export function AppShell({
  header,
  children,
  contentClassName,
}: {
  header?: (opts: { menuButton: ReactNode }) => ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  const menuButton = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open navigation"
      className="grid size-8 shrink-0 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground transition-colors hover:text-foreground lg:hidden"
    >
      <Menu className="size-4" strokeWidth={1.9} />
    </button>
  );

  return (
    <div className="min-h-screen bg-background font-sans antialiased">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border/70 bg-surface px-3 py-5 lg:flex">
          <SidebarInner />
        </aside>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border/70 bg-surface px-3 py-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="absolute right-3 top-4 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" strokeWidth={1.9} />
              </button>
              <SidebarInner onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}

        <main className={`min-w-0 flex-1 ${contentClassName ?? ""}`}>
          {header?.({ menuButton })}
          {children}
        </main>
      </div>
    </div>
  );
}
