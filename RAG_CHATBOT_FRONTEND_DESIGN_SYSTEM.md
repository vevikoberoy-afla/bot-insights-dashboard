# RAG Chatbot Widget — Complete Frontend Design System & Page Specifications

## Table of Contents

1. [Design System Foundation](#1-design-system-foundation)
2. [Navigation & Layout Architecture](#2-navigation--layout-architecture)
3. [Authentication Pages](#3-authentication-pages)
4. [Admin Dashboard Pages](#4-admin-dashboard-pages)
5. [Client Manager Pages](#5-client-manager-pages)
6. [Chat Widget Design](#6-chat-widget-design)
7. [Shared Components Library](#7-shared-components-library)
8. [Responsive Breakpoints](#8-responsive-breakpoints)
9. [Animation & Motion Design](#9-animation--motion-design)
10. [Accessibility Standards](#10-accessibility-standards)

---

## 1. Design System Foundation

### 1.1 Color Palette

#### Dark Mode (Primary Theme)

```css
:root {
  /* Background Layers */
  --bg-primary: #0A0A0F;           /* Main background - deepest black with slight blue */
  --bg-secondary: #12121A;         /* Card backgrounds */
  --bg-tertiary: #1A1A25;          /* Elevated surfaces */
  --bg-quaternary: #22222F;        /* Input fields, dropdowns */
  --bg-hover: #2A2A38;             /* Hover states */
  --bg-active: #32324A;            /* Active/selected states */
  
  /* Glass Effect */
  --glass-bg: rgba(18, 18, 26, 0.8);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  --glass-blur: blur(20px);
  
  /* Text Colors */
  --text-primary: #F5F5F7;         /* Primary text - slightly off-white */
  --text-secondary: #A0A0B8;       /* Secondary text */
  --text-tertiary: #6B6B80;        /* Muted text */
  --text-disabled: #4A4A5A;        /* Disabled text */
  --text-inverse: #0A0A0F;         /* Text on light backgrounds */
  
  /* Brand Colors */
  --brand-primary: #6C5CE7;        /* Electric Purple - primary brand */
  --brand-primary-hover: #7E6FF0;
  --brand-primary-light: rgba(108, 92, 231, 0.15);
  --brand-secondary: #00D2FF;      /* Cyan accent */
  --brand-secondary-light: rgba(0, 210, 255, 0.15);
  
  /* Gradient */
  --gradient-primary: linear-gradient(135deg, #6C5CE7 0%, #00D2FF 100%);
  --gradient-secondary: linear-gradient(135deg, #FF6B6B 0%, #FFE66D 100%);
  --gradient-glass: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 100%);
  
  /* Status Colors */
  --status-success: #00E676;
  --status-success-bg: rgba(0, 230, 118, 0.12);
  --status-warning: #FFB74D;
  --status-warning-bg: rgba(255, 183, 77, 0.12);
  --status-error: #FF5252;
  --status-error-bg: rgba(255, 82, 82, 0.12);
  --status-info: #42A5F5;
  --status-info-bg: rgba(66, 165, 245, 0.12);
  
  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.1);
  --border-strong: rgba(255, 255, 255, 0.18);
  --border-focus: #6C5CE7;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
  --shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.6);
  --shadow-glow: 0 0 20px rgba(108, 92, 231, 0.3);
  --shadow-glow-cyan: 0 0 20px rgba(0, 210, 255, 0.3);
}
```

#### Light Mode (Alternative Theme)

```css
[data-theme="light"] {
  --bg-primary: #F8F9FC;
  --bg-secondary: #FFFFFF;
  --bg-tertiary: #F0F1F5;
  --bg-quaternary: #E8E9EF;
  --text-primary: #1A1A2E;
  --text-secondary: #6B6B80;
  --border-subtle: rgba(0, 0, 0, 0.06);
  --border-default: rgba(0, 0, 0, 0.1);
  /* ... other light mode variables */
}
```

### 1.2 Typography

```css
:root {
  /* Font Families */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  --font-display: 'Plus Jakarta Sans', 'Inter', sans-serif;
  
  /* Font Sizes - Modular Scale (1.250) */
  --text-xs: 0.75rem;      /* 12px */
  --text-sm: 0.875rem;     /* 14px */
  --text-base: 1rem;       /* 16px */
  --text-lg: 1.125rem;     /* 18px */
  --text-xl: 1.25rem;      /* 20px */
  --text-2xl: 1.5rem;      /* 24px */
  --text-3xl: 1.875rem;    /* 30px */
  --text-4xl: 2.25rem;     /* 36px */
  --text-5xl: 3rem;        /* 48px */
  
  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  --font-extrabold: 800;
  
  /* Line Heights */
  --leading-none: 1;
  --leading-tight: 1.25;
  --leading-snug: 1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  
  /* Letter Spacing */
  --tracking-tighter: -0.05em;
  --tracking-tight: -0.025em;
  --tracking-normal: 0;
  --tracking-wide: 0.025em;
  --tracking-wider: 0.05em;
  --tracking-widest: 0.1em;
}
```

### 1.3 Spacing & Sizing

```css
:root {
  /* Spacing Scale (4px base) */
  --space-0: 0;
  --space-1: 0.25rem;    /* 4px */
  --space-2: 0.5rem;     /* 8px */
  --space-3: 0.75rem;    /* 12px */
  --space-4: 1rem;       /* 16px */
  --space-5: 1.25rem;    /* 20px */
  --space-6: 1.5rem;     /* 24px */
  --space-8: 2rem;       /* 32px */
  --space-10: 2.5rem;    /* 40px */
  --space-12: 3rem;      /* 48px */
  --space-16: 4rem;      /* 64px */
  --space-20: 5rem;      /* 80px */
  --space-24: 6rem;      /* 96px */
  
  /* Border Radius */
  --radius-none: 0;
  --radius-sm: 0.375rem;   /* 6px */
  --radius-md: 0.5rem;     /* 8px */
  --radius-lg: 0.75rem;    /* 12px */
  --radius-xl: 1rem;       /* 16px */
  --radius-2xl: 1.5rem;    /* 24px */
  --radius-full: 9999px;
  
  /* Z-Index Scale */
  --z-base: 0;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-modal-backdrop: 300;
  --z-modal: 400;
  --z-popover: 500;
  --z-tooltip: 600;
  --z-toast: 700;
  
  /* Transition Timing */
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
  
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 350ms;
}
```

### 1.4 Iconography

**Icon Library:** Lucide Icons (consistent, open-source, tree-shakeable)

**Icon Sizes:**
- `icon-xs`: 14px — inline with text
- `icon-sm`: 16px — buttons, inputs
- `icon-md`: 20px — navigation, cards
- `icon-lg`: 24px — feature highlights
- `icon-xl`: 32px — empty states
- `icon-2xl`: 48px — hero sections

---

## 2. Navigation & Layout Architecture

### 2.1 Admin Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Top Navigation Bar (Height: 64px, Glass Effect)           ││
│  │  ┌──────────┐  ┌────────────────────┐  ┌────────────────┐  ││
│  │  │  Logo    │  │  Search Bar        │  │  User Menu     │  ││
│  │  │  + Name  │  │  (⌘K shortcut)     │  │  + Notif Bell  │  ││
│  │  └──────────┘  └────────────────────┘  └────────────────┘  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌──────────────┐  ┌───────────────────────────────────────────┐│
│  │              │  │                                           ││
│  │  Sidebar     │  │  Main Content Area                       ││
│  │  (240px)     │  │                                           ││
│  │              │  │  ┌─────────────────────────────────────┐  ││
│  │  ┌────────┐  │  │  │  Page Header                       │  ││
│  │  │Nav Item│  │  │  │  Title + Breadcrumbs + Actions      │  ││
│  │  │  ...   │  │  │  └─────────────────────────────────────┘  ││
│  │  │        │  │  │                                           ││
│  │  │Nav Item│  │  │  ┌─────────────────────────────────────┐  ││
│  │  │  ...   │  │  │  │                                     │  ││
│  │  │        │  │  │  │  Page Content                       │  ││
│  │  │Nav Item│  │  │  │                                     │  ││
│  │  │  ...   │  │  │  │                                     │  ││
│  │  │        │  │  │  │                                     │  ││
│  │  │        │  │  │  └─────────────────────────────────────┘  ││
│  │  └────────┘  │  │                                           ││
│  │              │  └───────────────────────────────────────────┘│
│  │  ┌────────┐  │                                               │
│  │  │Plan    │  │                                               │
│  │  │Upgrade │  │                                               │
│  │  └────────┘  │                                               │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

**Sidebar Navigation Structure:**

```
┌────────────────────────────┐
│                            │
│  ◉ RAGChat                 │  ← Logo + Brand
│  ─────────────────────     │
│                            │
│  MAIN                      │  ← Section Label
│  ┌────────────────────┐    │
│  │ 📊 Dashboard       │    │  ← Active (highlighted)
│  └────────────────────┘    │
│  ┌────────────────────┐    │
│  │ 👥 Clients         │    │  ← With badge count
│  └────────────────────┘    │
│  ┌────────────────────┐    │
│  │ ➕ New Chatbot     │    │
│  └────────────────────┘    │
│                            │
│  ANALYTICS                 │
│  ┌────────────────────┐    │
│  │ 📈 Overview        │    │
│  └────────────────────┘    │
│  ┌────────────────────┐    │
│  │ 💬 Conversations   │    │
│  └────────────────────┘    │
│                            │
│  SETTINGS                  │
│  ┌────────────────────┐    │
│  │ 👤 Team            │    │
│  └────────────────────┘    │
│  ┌────────────────────┐    │
│  │ 🔗 Webhooks        │    │
│  └────────────────────┘    │
│  ┌────────────────────┐    │
│  │ 📋 Audit Log       │    │
│  └────────────────────┘    │
│  ┌────────────────────┐    │
│  │ ⚙️  Settings       │    │
│  └────────────────────┘    │
│                            │
│  ─────────────────────     │
│                            │
│  ┌────────────────────┐    │
│  │ 💎 Free Plan       │    │  ← Plan indicator
│  │ 247/500 messages   │    │  ← Usage bar
│  │ [Upgrade]          │    │  ← CTA button
│  └────────────────────┘    │
│                            │
│  ─────────────────────     │
│                            │
│  ┌────────────────────┐    │
│  │ 👤 John Doe        │    │  ← User profile
│  │ john@example.com   │    │
│  └────────────────────┘    │
│                            │
└────────────────────────────┘
```

### 2.2 Client Manager Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Top Bar (Height: 56px)                                    ││
│  │  ┌──────────┐  ┌────────────────┐  ┌────────────────────┐  ││
│  │  │ ← Back   │  │  Client Name   │  │  Share + Settings  │  ││
│  │  └──────────┘  └────────────────┘  └────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Tab Navigation (Scrollable on mobile)                     ││
│  │  [Context] [Q&A] [Add Content] [Database] [Chats] [Handoff]││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Tab Content                                                ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Authentication Pages

### 3.1 Login Page (`/auth/login`)

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐ │
│  │                     │  │                                  │ │
│  │  Left Panel (40%)   │  │  Right Panel (60%)               │ │
│  │                     │  │                                  │ │
│  │  ┌───────────────┐  │  │  ┌──────────────────────────┐   │ │
│  │  │               │  │  │  │                          │   │ │
│  │  │  Animated     │  │  │  │  Login Form              │   │ │
│  │  │  Gradient     │  │  │  │                          │   │ │
│  │  │  Background   │  │  │  │  ┌────────────────────┐  │   │ │
│  │  │               │  │  │  │  │  ◉ RAGChat         │  │   │ │
│  │  │  ┌─────────┐  │  │  │  │  │                    │  │   │ │
│  │  │  │ AI Chat │  │  │  │  │  │  Welcome back      │  │   │ │
│  │  │  │ Demo    │  │  │  │  │  │  Sign in to        │  │   │ │
│  │  │  │ Bubble  │  │  │  │  │  │  your dashboard    │  │   │ │
│  │  │  └─────────┘  │  │  │  │  │                    │  │   │ │
│  │  │               │  │  │  │  │  ┌────────────────┐│  │   │ │
│  │  │  "Build AI    │  │  │  │  │  │ Email          ││  │   │ │
│  │  │   chatbots    │  │  │  │  │  │ ─────────────  ││  │   │ │
│  │  │   in minutes" │  │  │  │  │  └────────────────┘│  │   │ │
│  │  │               │  │  │  │  │  ┌────────────────┐│  │   │ │
│  │  │  ┌─────────┐  │  │  │  │  │  │ Password    👁 ││  │   │ │
│  │  │  │ Feature │  │  │  │  │  │  │ ─────────────  ││  │   │ │
│  │  │  │ Cards   │  │  │  │  │  │  └────────────────┘│  │   │ │
│  │  │  └─────────┘  │  │  │  │  │                    │  │   │ │
│  │  │               │  │  │  │  │  ┌────────────────┐│  │   │ │
│  │  └───────────────┘  │  │  │  │  │                ││  │   │ │
│  │                     │  │  │  │  │  Sign In    →  ││  │   │ │
│  │                     │  │  │  │  │                ││  │   │ │
│  │                     │  │  │  │  └────────────────┘│  │   │ │
│  │                     │  │  │  │                    │  │   │ │
│  │                     │  │  │  │  ─── or ───        │  │   │ │
│  │                     │  │  │  │                    │  │   │ │
│  │                     │  │  │  │  ┌────────────────┐│  │   │ │
│  │                     │  │  │  │  │ 🔑 Sign in     ││  │   │ │
│  │                     │  │  │  │  │ with Magic Link││  │   │ │
│  │                     │  │  │  │  └────────────────┘│  │   │ │
│  │                     │  │  │  │                    │  │   │ │
│  │                     │  │  │  │  Don't have an     │  │   │ │
│  │                     │  │  │  │  account? Sign up  │  │   │ │
│  │                     │  │  │  └──────────────────┘   │ │
│  │                     │  │                                  │ │
│  └─────────────────────┘  └──────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Design Details:**

| Element | Specification |
|---------|--------------|
| Left Panel BG | Animated mesh gradient (purple → cyan → pink), subtle particle animation |
| Form Container | Glass card, `bg-secondary`, `border-subtle`, `radius-2xl`, `shadow-xl` |
| Logo | SVG, 40px height, with brand name |
| Input Fields | `height: 48px`, `bg-quaternary`, `border-subtle`, `radius-lg`, focus ring `border-focus` |
| Primary Button | Full-width, gradient background, `height: 48px`, `radius-lg`, hover scale 1.02 |
| Social Login Buttons | Outlined style, icon + text, `height: 44px` |
| Error State | Red border, error icon, error text below input |
| Loading State | Spinner replaces button text, button disabled |

**Interaction States:**

```css
/* Input Focus */
.input:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px var(--brand-primary-light);
}

/* Button Hover */
.btn-primary:hover {
  background: var(--brand-primary-hover);
  box-shadow: var(--shadow-glow);
  transform: translateY(-1px);
}

/* Button Active */
.btn-primary:active {
  transform: translateY(0);
}
```

### 3.2 Registration Page (`/auth/register`)

**Layout:** Similar to login with additional fields:

```
┌──────────────────────────────────────────┐
│                                          │
│  Create your account                     │
│  Start building AI chatbots today        │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Full Name                          │  │
│  │ ────────────────────────────────── │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Work Email                         │  │
│  │ ────────────────────────────────── │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Company Name (optional)            │  │
│  │ ────────────────────────────────── │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Password                Strength:  │  │
│  │ ──────────────────  ████████░░ Strong│
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Confirm Password                   │  │
│  │ ────────────────────────────────── │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ☑ I agree to Terms of Service           │
│    and Privacy Policy                    │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │         Create Account →           │  │
│  └────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

**Password Strength Indicator:**

```
Weak:    █░░░░░░░░░  Red (#FF5252)
Fair:    ████░░░░░░  Orange (#FFB74D)
Good:    ███████░░░  Yellow (#FFE66D)
Strong:  ██████████  Green (#00E676)
```

### 3.3 Forgot Password Page (`/auth/forgot-password`)

```
┌──────────────────────────────────────────┐
│                                          │
│  Reset your password                     │
│  Enter your email and we'll send you     │
│  a reset link                            │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Email Address                      │  │
│  │ ────────────────────────────────── │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │       Send Reset Link →            │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ← Back to login                        │
│                                          │
└──────────────────────────────────────────┘

/* After submission */

┌──────────────────────────────────────────┐
│                                          │
│           ✉️ Check your email            │
│                                          │
│  We've sent a password reset link to     │
│  john@example.com                        │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │        Open Email App →            │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Didn't receive it? Resend in 0:45      │
│                                          │
└──────────────────────────────────────────┘
```

### 3.4 Email Verification Page (`/auth/verify-email`)

**Loading State:**

```
┌──────────────────────────────────────────┐
│                                          │
│              ⏳ Verifying...             │
│                                          │
│  Please wait while we verify your        │
│  email address                           │
│                                          │
│  ████████████░░░░░░░░░ 60%              │
│                                          │
└──────────────────────────────────────────┘
```

**Success State:**

```
┌──────────────────────────────────────────┐
│                                          │
│              ✅ Verified!                │
│                                          │
│  Your email has been verified            │
│  successfully. You can now access        │
│  your dashboard.                         │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │       Go to Dashboard →            │  │
│  └────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

---

## 4. Admin Dashboard Pages

### 4.1 Main Dashboard (`/admin`)

**Page Header:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Dashboard                          🔍 Search...    ⚙️  👤      │
│  Welcome back, John                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Stats Cards Row:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────┐│
│  │ Total Clients│ │ Total Messages│ │ Active Bots │ │ Revenue ││
│  │              │ │              │ │              │ │         ││
│  │    12        │ │   8,547      │ │    10        │ │  $2,340 ││
│  │              │ │              │ │              │ │         ││
│  │  ↑ 2 this   │ │  ↑ 1,234    │ │  ↑ 2 this   │ │  ↑ 12%  ││
│  │    month     │ │    week      │ │    week      │ │   MoM   ││
│  │              │ │              │ │              │ │         ││
│  │  📊 Sparkline│ │  📈 Sparkline│ │  🟢 Status  │ │  💰     ││
│  │              │ │              │ │              │ │         ││
│  └──────────────┘ └──────────────┘ └──────────────┘ └─────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Card Component Details:**

```tsx
// Stats Card Component
interface StatsCardProps {
  title: string;          // "Total Clients"
  value: string | number; // "12"
  change: {
    value: string;        // "+2"
    trend: 'up' | 'down' | 'neutral';
    label: string;        // "this month"
  };
  icon: ReactNode;        // Lucide icon
  sparkline?: number[];   // Mini chart data
  color: 'purple' | 'cyan' | 'green' | 'orange';
}
```

**Design Specifications:**

| Element | Properties |
|---------|-----------|
| Card BG | `bg-secondary`, `border-subtle`, `radius-xl` |
| Card Padding | `24px` all sides |
| Title | `text-sm`, `text-secondary`, `font-medium` |
| Value | `text-3xl`, `text-primary`, `font-bold` |
| Change Badge | `radius-full`, `text-xs`, green/red bg |
| Icon Container | `40px`, `radius-lg`, brand color bg with 15% opacity |
| Hover State | `translateY(-2px)`, `shadow-md` |
| Animation | Number count-up on load, 800ms duration |

**Quick Actions Bar:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Quick Actions                                                    │
│                                                                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │  ➕ New Chatbot  │ │  📊 View Reports│ │  👥 Manage Team │   │
│  │                  │ │                  │ │                  │   │
│  │  Create a new    │ │  View detailed   │ │  Add or remove   │   │
│  │  client chatbot  │ │  analytics       │ │  team members    │   │
│  │                  │ │                  │ │                  │   │
│  │  →               │ │  →               │ │  →               │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Client List Table:**

```
┌─────────────────────────────────────────────────────────────────┐
│  All Clients                    🔍 Filter...    [Export] [+ New] │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ☐  Name ↑↓      Website      Status    Messages  Actions   ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ ☐  Acme Corp    acme.com     🟢 Active  1,234    ⋮        ││
│  │    John Smith                                             ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ ☐  TechStart    tech.co      🟡 Crawling  456    ⋮        ││
│  │    Sarah Lee                                              ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ ☐  GlobalBiz    gb.io        🟢 Active  2,345    ⋮        ││
│  │    Mike Chen                                              ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ ☐  DevShop      devshop.dev  🔴 Error    89      ⋮        ││
│  │    Alex Kim                                               ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ ☐  RetailMax    retail.com   🟢 Active  3,456    ⋮        ││
│  │    Lisa Wang                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Showing 1-5 of 12          ← 1 2 3 →                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Table Design Specifications:**

| Element | Properties |
|---------|-----------|
| Table Container | `bg-secondary`, `radius-xl`, `overflow-hidden` |
| Header Row | `bg-tertiary`, `text-secondary`, `font-semibold`, sticky top |
| Row Height | `72px` (allows for two-line content) |
| Row Hover | `bg-hover` |
| Row Selected | `bg-active`, checkbox checked |
| Status Dot | `8px` circle, color-coded |
| Actions Menu | Dropdown on `⋮` click, `radius-lg`, `shadow-lg` |
| Pagination | Bottom-right, compact design |

**Empty State (No Clients):**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                        ┌─────────┐                              │
│                        │    🤖   │                              │
│                        │         │                              │
│                        └─────────┘                              │
│                                                                 │
│                    No clients yet                               │
│                                                                 │
│          Create your first chatbot to get started               │
│                                                                 │
│                 ┌────────────────────┐                          │
│                 │  ➕ Create Chatbot  │                          │
│                 └────────────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 New Chatbot Wizard (`/admin/new`)

**Multi-Step Form with Progress:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Create New Chatbot                                             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Step 1 ●──────────── Step 2 ──────────── Step 3            ││
│  │  Website     →        Configure    →      Deploy            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  STEP 1: Website Configuration                              ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │ Website URL                                         │   ││
│  │  │ 🔗 https://example.com                              │   ││
│  │  │ ─────────────────────────────────────────────────── │   ││
│  │  │                                                     │   ││
│  │  │  ✓ Valid URL detected                               │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  Client Information                                         ││
│  │                                                             ││
│  │  ┌────────────────────┐  ┌────────────────────────────┐   ││
│  │  │ Client Name        │  │ Contact Email              │   ││
│  │  │ ────────────────── │  │ ────────────────────────── │   ││
│  │  └────────────────────┘  └────────────────────────────┘   ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │ Notes (optional)                                    │   ││
│  │  │ ─────────────────────────────────────────────────── │   ││
│  │  │                                                     │   ││
│  │  │                                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │                                             [Next →]        ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Step 2: Crawl Configuration:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  STEP 2: Crawl Configuration                                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Max Pages to Crawl                                         ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  ◄━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━►   │   ││
│  │  │  5                   50                   200        │   ││
│  │  │                                                     │   ││
│  │  │  Selected: 50 pages                                 │   ││
│  │  │  Estimated time: ~5 minutes                         │   ││
│  │  │  💡 More pages = longer crawl time but better       │   ││
│  │  │     coverage                                        │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  🔽 Advanced Filters (expand)                       │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  /* Expanded state */                                       ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  🔽 Advanced Filters (collapse)                     │   ││
│  │  │                                                     │   ││
│  │  │  Include Paths (optional)                           │   ││
│  │  │  Only crawl these URL paths                         │   ││
│  │  │  ┌─────────────────────────────────────────────┐   │   ││
│  │  │  │ /pricing    ✕                              │   │   ││
│  │  │  │ /faq        ✕                              │   │   ││
│  │  │  │ /about      ✕                              │   │   ││
│  │  │  │ ────────────────────────────────────────── │   │   ││
│  │  │  │ + Add path                                 │   │   ││
│  │  │  └─────────────────────────────────────────────┘   │   ││
│  │  │                                                     │   ││
│  │  │  Exclude Paths (optional)                           │   ││
│  │  │  Skip these URL paths                               │   ││
│  │  │  ┌─────────────────────────────────────────────┐   │   ││
│  │  │  │ /blog/*     ✕                              │   │   ││
│  │  │  │ /products/* ✕                              │   │   ││
│  │  │  │ /admin/*    ✕                              │   │   ││
│  │  │  │ ────────────────────────────────────────── │   │   ││
│  │  │  │ + Add path                                 │   │   ││
│  │  │  └─────────────────────────────────────────────┘   │   ││
│  │  │                                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  [← Back]                                      [Next →]     ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Step 3: Crawl Progress & Deploy:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  STEP 3: Processing & Deploy                                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Crawl Progress                                             ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │                                                     │   ││
│  │  │  ████████████████████░░░░░░░░░░░░░░░░░░░░  52%     │   ││
│  │  │                                                     │   ││
│  │  │  26 of 50 pages crawled                             │   ││
│  │  │  18 pages processed                                 │   ││
│  │  │  142 chunks created                                 │   ││
│  │  │  ⏱️ Estimated time remaining: 2:34                   │   ││
│  │  │                                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  Activity Log                                               ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │ 10:32:15  ✓ Crawled /about                          │   ││
│  │  │ 10:32:18  ✓ Crawled /pricing                        │   ││
│  │  │ 10:32:21  ✓ Crawled /faq                            │   ││
│  │  │ 10:32:24  ⏳ Processing /contact...                 │   ││
│  │  │ 10:32:27  ✓ Crawled /team                           │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  /* After completion */                                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  ✅ Chatbot Ready!                                          ││
│  │                                                             ││
│  │  Your chatbot has been created successfully.                ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  🔗 Manage URL                                       │   ││
│  │  │  ┌──────────────────────────────────────────┐ [📋] │   ││
│  │  │  │ https://app.ragchat.com/manage/abc123   │      │   ││
│  │  │  └──────────────────────────────────────────┘      │   ││
│  │  │  Share this URL with your client                    │   ││
│  │  │                                                     │   ││
│  │  │  📝 Embed Snippet                                   │   ││
│  │  │  ┌──────────────────────────────────────────┐ [📋] │   ││
│  │  │  │ <script src="...">                       │      │   ││
│  │  │  │ </script>                                │      │   ││
│  │  │  └──────────────────────────────────────────┘      │   ││
│  │  │  Add this to your website's <head>                  │   ││
│  │  │                                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  [← Back to Dashboard]          [View Client →]             ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Client Detail Page (`/admin/client/[id]`)

**Overview Tab:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ← Back to Clients    Acme Corp                    [⚙️ Settings]│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  [Overview]  [Analytics]  [Conversations]  [Settings]       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Client Information                                         ││
│  │                                                             ││
│  │  ┌────────────────────┐  ┌────────────────────────────┐   ││
│  │  │                    │  │                            │   ││
│  │  │  Company Name      │  │  Contact                   │   ││
│  │  │  Acme Corp         │  │  john@acme.com             │   ││
│  │  │                    │  │                            │   ││
│  │  │  Website           │  │  Status                    │   ││
│  │  │  acme.com ↗        │  │  🟢 Active                 │   ││
│  │  │                    │  │                            │   ││
│  │  │  Created           │  │  Last Activity             │   ││
│  │  │  Jan 15, 2026      │  │  2 hours ago               │   ││
│  │  │                    │  │                            │   ││
│  │  └────────────────────┘  └────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐│
│  │                      │  │                                  ││
│  │  Quick Stats         │  │  Quick Actions                   ││
│  │                      │  │                                  ││
│  │  1,234 messages      │  │  [🔄 Recrawl]  [📋 Copy Snippet]││
│  │  456 chunks          │  │                                  ││
│  │  23 Q&A pairs        │  │  [🔗 Manage URL]  [🗑️ Delete]   ││
│  │  12 conversations    │  │                                  ││
│  │                      │  │                                  ││
│  └──────────────────────┘  └──────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Recent Conversations                                       ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  Session #abc123    3 messages    2 hours ago        │   ││
│  │  │  "Where is my order ORD-010?"                       │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  Session #def456    7 messages    5 hours ago        │   ││
│  │  │  "What are your pricing plans?"                     │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  Session #ghi789    2 messages    1 day ago          │   ││
│  │  │  "Do you offer refunds?"                            │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  View all conversations →                                   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Analytics Page (`/admin/analytics`)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Analytics                   📅 Last 30 days ▼    [Export]      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Messages Over Time                                         ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │       ╭──────╮                                      │   ││
│  │  │      ╭╯      ╰╮         ╭──────╮                   │   ││
│  │  │  ───╯          ╰───╮    ╭╯      ╰╮                  │   ││
│  │  │                    ╰──╯         ╰────────           │   ││
│  │  │  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug             │   ││
│  │  │                                                     │   ││
│  │  │  ● Messages  ● Conversations                       │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐│
│  │                              │  │                          ││
│  │  Top Questions               │  │  Top Sources             ││
│  │                              │  │                          ││
│  │  1. "What are your prices?" │  │  1. /pricing    34%      ││
│  │     ████████████  145       │  │     ████████████         ││
│  │                              │  │                          ││
│  │  2. "How to return?"        │  │  2. /faq        28%      ││
│  │     ██████████   123        │  │     ██████████           ││
│  │                              │  │                          ││
│  │  3. "Shipping time?"        │  │  3. /about      22%      ││
│  │     ████████    98          │  │     ████████             ││
│  │                              │  │                          ││
│  │  4. "Order status?"         │  │  4. /contact    16%      ││
│  │     ██████     76           │  │     ██████               ││
│  │                              │  │                          ││
│  │  5. "Support hours?"        │  │  5. /products   12%      ││
│  │     ████      54            │  │     ████                 ││
│  │                              │  │                          ││
│  └──────────────────────────────┘  └──────────────────────────┘│
│                                                                 │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐│
│  │                              │  │                          ││
│  │  Response Time               │  │  Satisfaction            ││
│  │                              │  │                          ││
│  │  ┌────────────────────┐     │  │     ┌──────────┐         ││
│  │  │                    │     │  │     │   4.7    │         ││
│  │  │  Average: 1.2s     │     │  │     │   ⭐⭐⭐⭐⭐  │         ││
│  │  │  P95: 2.8s         │     │  │     │          │         ││
│  │  │  P99: 4.5s         │     │  │     │  Based on│         ││
│  │  │                    │     │  │     │  234     │         ││
│  │  │  ████████████      │     │  │     │  ratings │         ││
│  │  │  <1s    1-3s  >3s  │     │  │     │          │         ││
│  │  │                    │     │  │     └──────────┘         ││
│  │  └────────────────────┘     │  │                          ││
│  │                              │  │                          ││
│  └──────────────────────────────┘  └──────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.5 Conversations Page (`/admin/conversations`)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Conversations              🔍 Search messages...    [Export]    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Filter by: [All Clients ▼]  [Date Range ▼]  [Status ▼]    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Session #abc123           Acme Corp    2h ago    3 msgs     ││
│  │  ───────────────────────────────────────────────────────    ││
│  │  Visitor: "Where is my order ORD-010?"                      ││
│  │  Bot: "Let me check that for you..."                        ││
│  │  Visitor: "Thanks, it says shipped"                         ││
│  │                                                             ││
│  │  [View Full Conversation →]                                 ││
│  │                                                             ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │                                                             ││
│  │  Session #def456           TechStart    5h ago    7 msgs     ││
│  │  ───────────────────────────────────────────────────────    ││
│  │  Visitor: "What are your pricing plans?"                    ││
│  │  Bot: "We offer three plans..."                             ││
│  │  Visitor: "What's included in Pro?"                         ││
│  │  ...                                                        ││
│  │                                                             ││
│  │  [View Full Conversation →]                                 ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.6 Team Management Page (`/admin/team`)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Team Management                                    [+ Invite]  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Team Members (5)                                           ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  👤  John Doe              john@example.com         │   ││
│  │  │      Owner                    Joined Jan 2026       │   ││
│  │  │                                  [Edit]             │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  👤  Sarah Lee             sarah@example.com        │   ││
│  │  │      Admin                    Joined Feb 2026       │   ││
│  │  │                          [Change Role]  [Remove]     │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  👤  Mike Chen             mike@example.com         │   ││
│  │  │      Manager                  Joined Mar 2026       │   ││
│  │  │                          [Change Role]  [Remove]     │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  👤  Alex Kim              alex@example.com         │   ││
│  │  │      Viewer                   Joined Apr 2026       │   ││
│  │  │                          [Change Role]  [Remove]     │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  ⏳  Lisa Wang             lisa@example.com         │   ││
│  │  │      Invited • Pending        Sent 2 days ago       │   ││
│  │  │                          [Resend]  [Revoke]          │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Role Permissions                                           ││
│  │                                                             ││
│  │  ┌─────────────┬────────┬─────────┬─────────┬──────────┐   ││
│  │  │ Permission  │ Owner  │ Admin   │ Manager │ Viewer   │   ││
│  │  ├─────────────┼────────┼─────────┼─────────┼──────────┤   ││
│  │  │ Dashboard   │   ✅   │   ✅    │   ✅    │   ✅     │   ││
│  │  │ Manage      │   ✅   │   ✅    │   ✅    │   👁️     │   ││
│  │  │ Create      │   ✅   │   ✅    │   ✅    │   ❌     │   ││
│  │  │ Delete      │   ✅   │   ✅    │   ❌    │   ❌     │   ││
│  │  │ Billing     │   ✅   │   👁️    │   ❌    │   ❌     │   ││
│  │  │ Team        │   ✅   │   ✅    │   ❌    │   ❌     │   ││
│  │  │ Settings    │   ✅   │   ✅    │   ❌    │   ❌     │   ││
│  │  └─────────────┴────────┴─────────┴─────────┴──────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.7 Webhooks Page (`/admin/webhooks`)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Webhooks                                           [+ Add]     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Active Webhooks (3)                                        ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  🔗 Slack Notifications                             │   ││
│  │  │  https://hooks.slack.com/services/T00/B00/xxx       │   ││
│  │  │  Events: message.received, handoff.requested         │   ││
│  │  │  Status: 🟢 Healthy  Last triggered: 2h ago          │   ││
│  │  │                              [Test] [Edit] [Delete]  │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  🔗 CRM Integration                                 │   ││
│  │  │  https://api.example.com/webhooks/ragchat           │   ││
│  │  │  Events: conversation.started, conversation.ended    │   ││
│  │  │  Status: 🟢 Healthy  Last triggered: 5h ago          │   ││
│  │  │                              [Test] [Edit] [Delete]  │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  🔗 Analytics Service                               │   ││
│  │  │  https://analytics.example.com/ingest               │   ││
│  │  │  Events: All events                                 │   ││
│  │  │  Status: 🔴 Failing  Last error: 502 Bad Gateway    │   ││
│  │  │                         [Retry] [Test] [Edit] [Delete]│   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Recent Deliveries                                          ││
│  │                                                             ││
│  │  ┌───────────┬─────────────────┬──────────┬────────────┐   ││
│  │  │ Time      │ Event           │ Webhook  │ Status     │   ││
│  │  ├───────────┼─────────────────┼──────────┼────────────┤   ││
│  │  │ 10:32 AM  │ message.receive │ Slack    │ ✅ 200 OK  │   ││
│  │  │ 10:28 AM  │ conversation.st │ CRM      │ ✅ 200 OK  │   ││
│  │  │ 10:25 AM  │ message.receive │ Analytics│ ❌ 502     │   ││
│  │  │ 10:20 AM  │ handoff.request │ Slack    │ ✅ 200 OK  │   ││
│  │  └───────────┴─────────────────┴──────────┴────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.8 Audit Log Page (`/admin/audit`)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Audit Log                                          [Export]    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  🔍 Search events...    [Date Range ▼]  [User ▼] [Action ▼]│
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Today                                                      ││
│  │  ──────────────────────────────────────────────────────     ││
│  │                                                             ││
│  │  10:32 AM  👤 John Doe                                      ││
│  │            Created new client "Acme Corp"                   ││
│  │            client.create • id: abc123                       ││
│  │                                                             ││
│  │  10:28 AM  👤 John Doe                                      ││
│  │            Updated chunk for acme.com                       ││
│  │            chunk.update • context: xyz789                   ││
│  │                                                             ││
│  │  10:15 AM  👤 Sarah Lee                                     ││
│  │            Logged in from 192.168.1.1                       ││
│  │            user.login • ip: 192.168.1.1                     ││
│  │                                                             ││
│  │  Yesterday                                                   ││
│  │  ──────────────────────────────────────────────────────     ││
│  │                                                             ││
│  │  4:32 PM   👤 Mike Chen                                     ││
│  │            Deleted Q&A pair for TechStart                   ││
│  │            qa.delete • question: "What is your return..."   ││
│  │                                                             ││
│  │  2:15 PM   👤 System                                        ││
│  │            Auto-downgraded plan due to payment failure      ││
│  │            billing.downgrade • reason: payment_failed       ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Load more...                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.9 Settings Pages

#### Organization Settings (`/admin/settings`)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Settings                                                       │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐│
│  │                  │  │                                      ││
│  │  Navigation      │  │  Organization Settings               ││
│  │                  │  │                                      ││
│  │  ┌────────────┐  │  │  ┌─────────────────────────────────┐ ││
│  │  │ Organization│  │  │  │ Company Logo                    │ ││
│  │  └────────────┘  │  │  │                                 │ ││
│  │  ┌────────────┐  │  │  │  ┌─────────┐                    │ ││
│  │  │ Profile    │  │  │  │  │  📷     │  [Upload]          │ ││
│  │  └────────────┘  │  │  │  └─────────┘                    │ ││
│  │  ┌────────────┐  │  │  │                                 │ ││
│  │  │ Security   │  │  │  └─────────────────────────────────┘ ││
│  │  └────────────┘  │  │                                      ││
│  │  ┌────────────┐  │  │  ┌─────────────────────────────────┐ ││
│  │  │ Billing    │  │  │  │ Company Name                    │ ││
│  │  └────────────┘  │  │  │ ─────────────────────────────── │ ││
│  │  ┌────────────┐  │  │  └─────────────────────────────────┘ ││
│  │  │ Notifications│ │  │                                      ││
│  │  └────────────┘  │  │  ┌─────────────────────────────────┐ ││
│  │  ┌────────────┐  │  │  │ Website URL                     │ ││
│  │  │ Privacy    │  │  │  │ ─────────────────────────────── │ ││
│  │  └────────────┘  │  │  └─────────────────────────────────┘ ││
│  │  ┌────────────┐  │  │                                      ││
│  │  │ API Keys   │  │  │  ┌─────────────────────────────────┐ ││
│  │  └────────────┘  │  │  │ Timezone                        │ ││
│  │                  │  │  │ ─────────────────────────────── │ ││
│  │                  │  │  └─────────────────────────────────┘ ││
│  │                  │  │                                      ││
│  │                  │  │  [Save Changes]                      ││
│  │                  │  │                                      ││
│  └──────────────────┘  └──────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Security Settings

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Security Settings                                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Change Password                                            ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │ Current Password                                    │   ││
│  │  │ ─────────────────────────────────────────────────── │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │ New Password                                        │   ││
│  │  │ ─────────────────────────────────────────────────── │   ││
│  │  │ Strength: ████████░░ Strong                         │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │ Confirm New Password                                │   ││
│  │  │ ─────────────────────────────────────────────────── │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  [Update Password]                                         ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Two-Factor Authentication                                  ││
│  │                                                             ││
│  │  Status: ❌ Not enabled                                     ││
│  │                                                             ││
│  │  Add an extra layer of security to your account by          ││
│  │  enabling 2FA.                                              ││
│  │                                                             ││
│  │  [Enable 2FA]                                               ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Active Sessions                                            ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  💻 Chrome on macOS • 192.168.1.1                   │   ││
│  │  │  Current session • Last active: Now                 │   ││
│  │  │                                                     │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  📱 Safari on iPhone • 192.168.1.2                  │   ││
│  │  │  Last active: 2 hours ago                           │   ││
│  │  │                              [Revoke]               │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  [Revoke All Other Sessions]                                ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Billing Page (`/admin/billing`)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Billing & Subscription                                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Current Plan                                               ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │                                                     │   ││
│  │  │  💎 Professional Plan                               │   ││
│  │  │                                                     │   ││
│  │  │  $79/month • Renews on Feb 15, 2026                 │   ││
│  │  │                                                     │   ││
│  │  │  ┌─────────────────────────────────────────────┐   │   ││
│  │  │  │  Messages used                               │   │   ││
│  │  │  │  ████████████████░░░░░░░░░░░░░░  12,450     │   │   ││
│  │  │  │  12,450 of 25,000 (49.8%)                   │   │   ││
│  │  │  └─────────────────────────────────────────────┘   │   ││
│  │  │                                                     │   ││
│  │  │  ┌─────────────────────────────────────────────┐   │   ││
│  │  │  │  Pages crawled                               │   │   ││
│  │  │  │  ██████████░░░░░░░░░░░░░░░░░░░  856         │   │   ││
│  │  │  │  856 of 2,000 (42.8%)                       │   │   ││
│  │  │  └─────────────────────────────────────────────┘   │   ││
│  │  │                                                     │   ││
│  │  │  ┌─────────────────────────────────────────────┐   │   ││
│  │  │  │  Team members                                │   │   ││
│  │  │  │  ████████████████░░░░░░░░░░░░░░  3          │   │   ││
│  │  │  │  3 of 5 (60%)                               │   │   ││
│  │  │  └─────────────────────────────────────────────┘   │   ││
│  │  │                                                     │   ││
│  │  │  [Change Plan]  [Cancel Subscription]               │   ││
│  │  │                                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Available Plans                                            ││
│  │                                                             ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        ││
│  │  │ Starter     │  │ Professional│  │ Enterprise  │        ││
│  │  │ $29/mo      │  │ $79/mo      │  │ $299/mo     │        ││
│  │  │             │  │             │  │             │        ││
│  │  │ • 3 bots    │  │ • 10 bots   │  │ • Unlimited │        ││
│  │  │ • 5K msgs   │  │ • 25K msgs  │  │ • Unlimited │        ││
│  │  │ • 500 pages │  │ • 2K pages  │  │ • 10K pages │        ││
│  │  │ • 2 members │  │ • 5 members │  │ • Unlimited │        ││
│  │  │             │  │             │  │             │        ││
│  │  │ [Current]   │  │ [Upgrade]   │  │ [Contact]   │        ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘        ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Invoice History                                            ││
│  │                                                             ││
│  │  ┌───────────┬─────────┬─────────┬───────────┬─────────┐   ││
│  │  │ Date      │ Amount  │ Status  │ Invoice   │ Receipt │   ││
│  │  ├───────────┼─────────┼─────────┼───────────┼─────────┤   ││
│  │  │ Jan 2026  │ $79.00  │ Paid    │ 📥 PDF    │ 📥      │   ││
│  │  │ Dec 2025  │ $79.00  │ Paid    │ 📥 PDF    │ 📥      │   ││
│  │  │ Nov 2025  │ $79.00  │ Paid    │ 📥 PDF    │ 📥      │   ││
│  │  │ Oct 2025  │ $29.00  │ Paid    │ 📥 PDF    │ 📥      │   ││
│  │  └───────────┴─────────┴─────────┴───────────┴─────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### API Keys Page

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  API Keys                                           [+ Create]  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Your API Keys                                              ││
│  │                                                             ││
│  │  API keys allow external applications to access your        ││
│  │  chatbots programmatically.                                 ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  🔑 Production Key                                  │   ││
│  │  │                                                     │   ││
│  │  │  Key: sk_live_abc123••••••••••••••••••••            │   ││
│  │  │  Scopes: chat:write, chunks:read                    │   ││
│  │  │  Created: Jan 15, 2026                              │   ││
│  │  │  Last used: 2 hours ago                             │   ││
│  │  │                                                     │   ││
│  │  │  [👁 Reveal] [📋 Copy] [🗑️ Revoke]                  │   ││
│  │  │                                                     │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  🔑 Development Key                                 │   ││
│  │  │                                                     │   ││
│  │  │  Key: sk_test_xyz789••••••••••••••••••••            │   ││
│  │  │  Scopes: All                                        │   ││
│  │  │  Created: Feb 1, 2026                               │   ││
│  │  │  Last used: Never                                   │   ││
│  │  │                                                     │   ││
│  │  │  [👁 Reveal] [📋 Copy] [🗑️ Revoke]                  │   ││
│  │  │                                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Client Manager Pages

### 5.1 Main Client Manager (`/manage/[id]`)

**Overview:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ⚙️ Acme Corp Chatbot                    [Share] [Preview Bot]  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  [Context]  [Q&A]  [Add Content]  [Database]  [Chats]       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  🔍 Search your chatbot's knowledge...                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Quick Stats                                                ││
│  │                                                             ││
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐││
│  │  │ 📄 Chunks  │ │ ❓ Q&A     │ │ 💬 Chats   │ │ 🔗 Links │││
│  │  │            │ │            │ │            │ │          │││
│  │  │    456     │ │     23     │ │     89     │ │    34    │││
│  │  │            │ │            │ │            │ │          │││
│  │  └────────────┘ └────────────┘ └────────────┘ └──────────┘││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Context Chunks (456)                                       ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  📄 About Us - Company Overview                     │   ││
│  │  │  "Acme Corp is a leading provider of..."            │   ││
│  │  │  Source: /about  •  Added: Jan 15  •  142 tokens    │   ││
│  │  │                                    [🗑️ Delete]      │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  📄 Pricing - Starter Plan                          │   ││
│  │  │  "Our Starter plan at $29/month includes..."        │   ││
│  │  │  Source: /pricing  •  Added: Jan 15  •  98 tokens   │   ││
│  │  │                                    [🗑️ Delete]      │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  📎 Uploaded Document: handbook.pdf                 │   ││
│  │  │  "Employee Handbook Section 1: Introduction..."     │   ││
│  │  │  Source: PDF  •  Added: Jan 20  •  256 tokens       │   ││
│  │  │                                    [🗑️ Delete]      │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  Load more...                                               ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Q&A Tab

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Q&A Pairs (23)                                    [+ Add Q&A]  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Q&A pairs let you control exactly how the chatbot          ││
│  │  answers specific questions.                                ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  Q: "What are your business hours?"                 │   ││
│  │  │  A: "We're open Monday-Friday 9AM-6PM EST.         │   ││
│  │  │      Weekend support via email only."               │   ││
│  │  │  🔗 Link: /contact                                  │   ││
│  │  │  Match: 95% • Hits: 45                              │   ││
│  │  │                              [Edit] [🗑️ Delete]      │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  Q: "Do you offer refunds?"                         │   ││
│  │  │  A: "Yes! We offer a 30-day money-back guarantee.   │   ││
│  │  │      Contact support@acme.com to initiate."         │   ││
│  │  │  🔗 Link: /refund-policy                            │   ││
│  │  │  Match: 92% • Hits: 32                              │   ││
│  │  │                              [Edit] [🗑️ Delete]      │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  Q: "How do I contact support?"                     │   ││
│  │  │  A: "Email us at support@acme.com or call           │   ││
│  │  │      1-800-ACME during business hours."             │   ││
│  │  │  🔗 Link: /contact                                  │   ││
│  │  │  Match: 88% • Hits: 28                              │   ││
│  │  │                              [Edit] [🗑️ Delete]      │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Add Content Tab

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Add Content                                                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Choose content type                                        ││
│  │                                                             ││
│  │  ┌───────────────────┐  ┌───────────────────┐              ││
│  │  │                   │  │                   │              ││
│  │  │  📝 Text Content  │  │  ❓ Q&A Pair      │              ││
│  │  │                   │  │                   │              ││
│  │  │  Add plain text   │  │  Add a specific   │              ││
│  │  │  that the bot     │  │  question and     │              ││
│  │  │  should know      │  │  answer pair      │              ││
│  │  │                   │  │                   │              ││
│  │  │  →                │  │  →                │              ││
│  │  └───────────────────┘  └───────────────────┘              ││
│  │                                                             ││
│  │  ┌───────────────────┐  ┌───────────────────┐              ││
│  │  │                   │  │                   │              ││
│  │  │  📄 Upload PDF    │  │  📄 Upload DOCX   │              ││
│  │  │                   │  │                   │              ││
│  │  │  Upload a PDF     │  │  Upload a Word    │              ││
│  │  │  document to      │  │  document to      │              ││
│  │  │  extract content  │  │  extract content  │              ││
│  │  │                   │  │                   │              ││
│  │  │  →                │  │  →                │              ││
│  │  └───────────────────┘  └───────────────────┘              ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  /* Text Content Form */                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Add Text Content                                           ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  Content Title (optional)                           │   ││
│  │  │  ─────────────────────────────────────────────────── │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  Content Text                                       │   ││
│  │  │  ─────────────────────────────────────────────────── │   ││
│  │  │  │                                                 │   ││
│  │  │  │                                                 │   ││
│  │  │  │  Type or paste your content here...             │   ││
│  │  │  │                                                 │   ││
│  │  │  │                                                 │   ││
│  │  │  │                                                 │   ││
│  │  │  ─────────────────────────────────────────────────── │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  Character count: 0 / 10,000                                ││
│  │                                                             ││
│  │  [Add Content]                                              ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  /* Q&A Pair Form */                                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Add Q&A Pair                                               ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  Question                                           │   ││
│  │  │  What question should trigger this answer?          │   ││
│  │  │  ─────────────────────────────────────────────────── │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  Answer                                             │   ││
│  │  │  What should the chatbot respond with?              │   ││
│  │  │  ─────────────────────────────────────────────────── │   ││
│  │  │  │                                                 │   ││
│  │  │  │                                                 │   ││
│  │  │  ─────────────────────────────────────────────────── │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  Link (optional)                                    │   ││
│  │  │  URL to include with the answer                     │   ││
│  │  │  ─────────────────────────────────────────────────── │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  [Add Q&A Pair]                                             ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  /* File Upload */                                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Upload Document                                            ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │                                                     │   ││
│  │  │                                                     │   ││
│  │  │           📄                                        │   ││
│  │  │                                                     │   ││
│  │  │     Drag & drop your file here                      │   ││
│  │  │     or click to browse                              │   ││
│  │  │                                                     │   ││
│  │  │     Supports PDF and DOCX (max 10MB)                │   ││
│  │  │                                                     │   ││
│  │  │                                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  /* After upload */                                         ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  📎 handbook.pdf                    2.4 MB          │   ││
│  │  │                                                     │   ││
│  │  │  ████████████████████░░░░░░░░░░░░  Processing...   │   ││
│  │  │                                                     │   ││
│  │  │  Extracting text... • Chunking... • Embedding...    │   ││
│  │  │                                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 Database Tab

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Order Database Connection                                      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Connect a database to let the chatbot look up order        ││
│  │  status and other information in real-time.                 ││
│  │                                                             ││
│  │  Connection Type                                            ││
│  │                                                             ││
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ││
│  │  │               │  │               │  │               │  ││
│  │  │  📊 Google    │  │  🔗 REST API  │  │  📄 CSV URL   │  ││
│  │  │  Sheets       │  │               │  │               │  ││
│  │  │               │  │               │  │               │  ││
│  │  │  Connect via  │  │  Connect any  │  │  Link to a    │  ││
│  │  │  sharing URL  │  │  REST API     │  │  public CSV   │  ││
│  │  │               │  │               │  │               │  ││
│  │  │  [Selected]   │  │               │  │               │  ││
│  │  └───────────────┘  └───────────────┘  └───────────────┘  ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  /* Google Sheets Form */                                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Google Sheets Connection                                   ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  Google Sheets URL                                  │   ││
│  │  │  ─────────────────────────────────────────────────── │   ││
│  │  │                                                     │   ││
│  │  │  💡 Make sure the sheet is shared with "Anyone       │   ││
│  │  │  with the link"                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  Field Mapping                                              ││
│  │                                                             ││
│  │  ┌────────────────────┐  ┌────────────────────────────┐   ││
│  │  │ Order ID Column    │  │ Status Column              │   ││
│  │  │ ────────────────── │  │ ────────────────────────── │   ││
│  │  │  A ▼               │  │  C ▼                       │   ││
│  │  └────────────────────┘  └────────────────────────────┘   ││
│  │                                                             ││
│  │  ┌────────────────────┐  ┌────────────────────────────┐   ││
│  │  │ Date Column        │  │ Customer Name Column       │   ││
│  │  │ ────────────────── │  │ ────────────────────────── │   ││
│  │  │  D ▼               │  │  B ▼                       │   ││
│  │  └────────────────────┘  └────────────────────────────┘   ││
│  │                                                             ││
│  │  [Connect]                                                  ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  /* After connection */                                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  ✅ Connected: orders-sheet.csv                             ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  Test Lookup                                        │   ││
│  │  │                                                     │   ││
│  │  │  ┌─────────────────────────────────────────────┐   │   ││
│  │  │  │  Enter test order ID    [Test]              │   │   ││
│  │  │  │  ─────────────────────────────────────────── │   │   ││
│  │  │  └─────────────────────────────────────────────┘   │   ││
│  │  │                                                     │   ││
│  │  │  /* Result */                                       │   ││
│  │  │  ┌─────────────────────────────────────────────┐   │   ││
│  │  │  │  ✓ Order found!                             │   │   ││
│  │  │  │                                             │   │   ││
│  │  │  │  Order ID: ORD-010                          │   │   ││
│  │  │  │  Customer: John Smith                       │   │   ││
│  │  │  │  Status: Shipped                            │   │   ││
│  │  │  │  Date: Jan 15, 2026                         │   │   ││
│  │  │  └─────────────────────────────────────────────┘   │   ││
│  │  │                                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  │  [Disconnect]                                               ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.5 Chats Tab

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Conversations (89)                              [Export CSV]    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Recent Conversations                                       ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  Session #abc123                                    │   ││
│  │  │  Started: Jan 20, 2026 10:32 AM                    │   ││
│  │  │  Messages: 5  •  Duration: 4 min                    │   ││
│  │  │                                                     │   ││
│  │  │  👤 "Where is my order ORD-010?"                   │   ││
│  │  │  🤖 "Let me check that for you. Your order         │   ││
│  │  │      ORD-010 is currently..."                       │   ││
│  │  │  👤 "Thanks, when will it arrive?"                  │   ││
│  │  │  🤖 "Based on the tracking information..."         │   ││
│  │  │                                                     │   ││
│  │  │  [View Full Conversation]                           │   ││
│  │  │                                                     │   ││
│  │  ├─────────────────────────────────────────────────────┤   ││
│  │  │  Session #def456                                    │   ││
│  │  │  Started: Jan 20, 2026 9:15 AM                     │   ││
│  │  │  Messages: 8  •  Duration: 7 min                    │   ││
│  │  │                                                     │   ││
│  │  │  👤 "What are your pricing plans?"                 │   ││
│  │  │  🤖 "We offer three plans: Starter ($29/mo)..."    │   ││
│  │  │  👤 "What's included in Professional?"             │   ││
│  │  │  🤖 "The Professional plan includes..."            │   ││
│  │  │  👤 "Can I try it free first?"                     │   ││
│  │  │  🤖 "Absolutely! We offer a 14-day free trial..."  │   ││
│  │  │                                                     │   ││
│  │  │  [View Full Conversation]                           │   ││
│  │  │                                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.6 Full Conversation View (Modal/Expandable)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ← Back    Conversation #abc123              [Export] [Delete]  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  Started: Jan 20, 2026 10:32 AM                            ││
│  │  Duration: 4 min  •  Messages: 5                            ││
│  │                                                             ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │                                                     │   ││
│  │  │  10:32 AM                                           │   ││
│  │  │  ┌─────────────────────────────────────────────┐   │   ││
│  │  │  │ 👤 Visitor                                  │   │   ││
│  │  │  │                                             │   │   ││
│  │  │  │ Where is my order ORD-010?                  │   │   ││
│  │  │  │                                             │   │   ││
│  │  │  └─────────────────────────────────────────────┘   │   ││
│  │  │                                                     │   ││
│  │  │  10:32 AM                                           │   ││
│  │  │  ┌─────────────────────────────────────────────┐   │   ││
│  │  │  │ 🤖 Chatbot                                  │   │   ││
│  │  │  │                                             │   │   ││
│  │  │  │ Let me check that for you! Your order       │   │   ││
│  │  │  │ ORD-010 is currently "Shipped" and was      │   │   ││
│  │  │  │ placed on Jan 15, 2026.                     │   │   ││
│  │  │  │                                             │   │   ││
│  │  │  │ 🔗 Source: /order-tracking                  │   │   ││
│  │  │  │                                             │   │   ││
│  │  │  └─────────────────────────────────────────────┘   │   ││
│  │  │                                                     │   ││
│  │  │  10:33 AM                                           │   ││
│  │  │  ┌─────────────────────────────────────────────┐   │   ││
│  │  │  │ 👤 Visitor                                  │   │   ││
│  │  │  │                                             │   │   ││
│  │  │  │ Thanks, when will it arrive?                │   │   ││
│  │  │  │                                             │   │   ││
│  │  │  └─────────────────────────────────────────────┘   │   ││
│  │  │                                                     │   ││
│  │  │  10:33 AM                                           │   ││
│  │  │  ┌─────────────────────────────────────────────┐   │   ││
│  │  │  │ 🤖 Chatbot                                  │   │   ││
│  │  │  │                                             │   │   ││
│  │  │  │ Based on the tracking information, your     │   │   ││
│  │  │  │ order should arrive within 3-5 business     │   │   ││
│  │  │  │ days. You can track it here:                │   │   ││
│  │  │  │                                             │   │   ││
│  │  │  │ 🔗 Source: /shipping-info                   │   │   ││
│  │  │  │                                             │   │   ││
│  │  │  └─────────────────────────────────────────────┘   │   ││
│  │  │                                                     │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Chat Widget Design

### 6.1 Chat Bubble (Collapsed State)

```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                      ┌──────┐       │
│                      │      │       │
│                      │  💬  │       │
│                      │      │       │
│                      │   3  │       │  ← Unread badge
│                      └──────┘       │
│                                     │
└─────────────────────────────────────┘
```

**Bubble Specifications:**

```css
.chat-bubble {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--gradient-primary);
  box-shadow: var(--shadow-lg), var(--shadow-glow);
  cursor: pointer;
  transition: all 0.3s var(--ease-bounce);
  z-index: 999999;
}

.chat-bubble:hover {
  transform: scale(1.1);
  box-shadow: var(--shadow-xl), var(--shadow-glow);
}

.chat-bubble .badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 22px;
  height: 22px;
  background: var(--status-error);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: white;
  animation: badge-pulse 2s infinite;
}

@keyframes badge-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}
```

### 6.2 Chat Window (Expanded State)

```
┌─────────────────────────────────────┐
│                                     │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  │  Header                       │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │  🤖  Acme Corp Support  │  │  │
│  │  │      ● Online            │  │  │
│  │  │                          │  │  │
│  │  │              [─] [✕]    │  │  │
│  │  └─────────────────────────┘  │  │
│  │                               │  │
│  │  Welcome Screen               │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │                         │  │  │
│  │  │  👋 Hi there!           │  │  │
│  │  │                         │  │  │
│  │  │  I'm the Acme Corp      │  │  │
│  │  │  assistant. How can I   │  │  │
│  │  │  help you today?        │  │  │
│  │  │                         │  │  │
│  │  │  ┌───────────────────┐  │  │  │
│  │  │  │ 💰 Pricing info   │  │  │  │
│  │  │  └───────────────────┘  │  │  │
│  │  │  ┌───────────────────┐  │  │  │
│  │  │  │ 📦 Track order    │  │  │  │
│  │  │  └───────────────────┘  │  │  │
│  │  │  ┌───────────────────┐  │  │  │
│  │  │  │ ❓ FAQ             │  │  │  │
│  │  │  └───────────────────┘  │  │  │
│  │  │                         │  │  │
│  │  └─────────────────────────┘  │  │
│  │                               │  │
│  │  Messages Area                │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │                         │  │  │
│  │  │  /* Messages appear */  │  │  │
│  │  │                         │  │  │
│  │  │                         │  │  │
│  │  │                         │  │  │
│  │  │                         │  │  │
│  │  │                         │  │  │
│  │  │                         │  │  │
│  │  └─────────────────────────┘  │  │
│  │                               │  │
│  │  Input Area                   │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │                         │  │  │
│  │  │  Type a message...  📎 ➤│  │  │
│  │  │                         │  │  │
│  │  └─────────────────────────┘  │  │
│  │                               │  │
│  │  Footer                       │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │  Powered by RAGChat ⚡  │  │  │
│  │  └─────────────────────────┘  │  │
│  │                               │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

**Chat Window Specifications:**

```css
.chat-window {
  position: fixed;
  bottom: 100px;
  right: 24px;
  width: 380px;
  height: 580px;
  max-height: calc(100vh - 120px);
  background: var(--bg-primary);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s var(--ease-out);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

**Message Bubbles:**

```
/* User Message */
┌─────────────────────────────────────────────┐
│                                             │
│                      ┌─────────────────┐    │
│                      │                 │    │
│                      │ Where is my     │    │
│                      │ order ORD-010?  │    │
│                      │                 │    │
│                      │         10:32 AM│    │
│                      └─────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘

/* Bot Message */
┌─────────────────────────────────────────────┐
│                                             │
│  ┌─────────────────┐                        │
│  │                 │                        │
│  │ Let me check    │                        │
│  │ that for you!   │                        │
│  │                 │                        │
│  │ Your order      │                        │
│  │ ORD-010 is      │                        │
│  │ currently       │                        │
│  │ "Shipped"...    │                        │
│  │                 │                        │
│  │ 10:32 AM       │                        │
│  │                 │                        │
│  │ [🔗 Source]    │                        │
│  │                 │                        │
│  └─────────────────┘                        │
│                                             │
└─────────────────────────────────────────────┘

/* Typing Indicator */
┌─────────────────────────────────────────────┐
│                                             │
│  ┌─────────────────┐                        │
│  │                 │                        │
│  │ ● ● ●           │  ← Animated dots      │
│  │                 │                        │
│  └─────────────────┘                        │
│                                             │
└─────────────────────────────────────────────┘
```

**Message Styling:**

```css
/* User Message */
.message-user {
  background: var(--brand-primary);
  color: white;
  border-radius: 18px 18px 4px 18px;
  padding: 12px 16px;
  max-width: 80%;
  margin-left: auto;
  font-size: 14px;
  line-height: 1.5;
}

/* Bot Message */
.message-bot {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-radius: 18px 18px 18px 4px;
  padding: 12px 16px;
  max-width: 80%;
  margin-right: auto;
  font-size: 14px;
  line-height: 1.5;
}

/* Source Link */
.source-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--brand-primary-light);
  color: var(--brand-primary);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  text-decoration: none;
  margin-top: 8px;
}

.source-link:hover {
  background: var(--brand-primary);
  color: white;
}
```

**Typing Indicator Animation:**

```css
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--text-tertiary);
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-8px);
    opacity: 1;
  }
}
```

### 6.3 Error States

```
/* Rate Limit Error */
┌─────────────────────────────────────────────┐
│                                             │
│  ┌─────────────────┐                        │
│  │                 │                        │
│  │  ⚠️             │                        │
│  │                 │                        │
│  │  You've sent    │                        │
│  │  too many       │                        │
│  │  messages.      │                        │
│  │                 │                        │
│  │  Please wait    │                        │
│  │  a moment and   │                        │
│  │  try again.     │                        │
│  │                 │                        │
│  │  [Retry]        │                        │
│  │                 │                        │
│  └─────────────────┘                        │
│                                             │
└─────────────────────────────────────────────┘

/* Connection Error */
┌─────────────────────────────────────────────┐
│                                             │
│  ┌─────────────────┐                        │
│  │                 │                        │
│  │  📡             │                        │
│  │                 │                        │
│  │  Connection     │                        │
│  │  lost.          │                        │
│  │                 │                        │
│  │  Please check   │                        │
│  │  your internet  │                        │
│  │  connection.    │                        │
│  │                 │                        │
│  │  [Retry]        │                        │
│  │                 │                        │
│  └─────────────────┘                        │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 7. Shared Components Library

### 7.1 Buttons

```
/* Primary Button */
┌──────────────────────────┐
│     Primary Button    →  │  → gradient bg, white text
└──────────────────────────┘

/* Secondary Button */
┌──────────────────────────┐
│   Secondary Button       │  → outlined, brand color text
└──────────────────────────┘

/* Ghost Button */
┌──────────────────────────┐
│   Ghost Button           │  → transparent, subtle hover
└──────────────────────────┘

/* Danger Button */
┌──────────────────────────┐
│   Delete          🗑️    │  → red, destructive action
└──────────────────────────┘

/* Icon Button */
┌────────┐
│   📋   │  → square, icon only
└────────┘

/* Loading State */
┌──────────────────────────┐
│   ⏳ Processing...       │  → spinner + disabled
└──────────────────────────┘
```

**Button Specifications:**

| Variant | Height | Padding | Font | Border | Background |
|---------|--------|---------|------|--------|------------|
| Primary | 40px | 16px 24px | 14px semibold | none | gradient |
| Secondary | 40px | 16px 24px | 14px semibold | 1px brand | transparent |
| Ghost | 40px | 16px 24px | 14px medium | none | transparent |
| Danger | 40px | 16px 24px | 14px semibold | none | red |
| Small | 32px | 8px 16px | 13px medium | varies | varies |
| Large | 48px | 16px 32px | 16px semibold | none | gradient |

### 7.2 Form Inputs

```
/* Text Input */
┌──────────────────────────────────────┐
│  Label                               │
│  ┌────────────────────────────────┐  │
│  │  Placeholder text              │  │
│  └────────────────────────────────┘  │
│  Helper text                         │
└──────────────────────────────────────┘

/* Error State */
┌──────────────────────────────────────┐
│  Label                               │
│  ┌────────────────────────────────┐  │
│  │  Invalid input           ❌   │  │  ← red border
│  └────────────────────────────────┘  │
│  ⚠️ Error message                    │  ← red text
└──────────────────────────────────────┘

/* Success State */
┌──────────────────────────────────────┐
│  Label                               │
│  ┌────────────────────────────────┐  │
│  │  Valid input              ✅   │  │  ← green border
│  └────────────────────────────────┘  │
│  ✓ Looks good!                       │  ← green text
└──────────────────────────────────────┘

/* Textarea */
┌──────────────────────────────────────┐
│  Label                               │
│  ┌────────────────────────────────┐  │
│  │                                │  │
│  │  Multi-line text...            │  │
│  │                                │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│  125 / 500 characters                │
└──────────────────────────────────────┘

/* Select / Dropdown */
┌──────────────────────────────────────┐
│  Label                               │
│  ┌────────────────────────────────┐  │
│  │  Selected option          ▼   │  │
│  └────────────────────────────────┘  │
│  /* Open state */                    │
│  ┌────────────────────────────────┐  │
│  │  Selected option          ▲   │  │
│  ├────────────────────────────────┤  │
│  │  Option 1                      │  │
│  │  Option 2                      │  │
│  │  Option 3                      │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘

/* Toggle Switch */
┌──────────────────────────────────────┐
│  Label                    ┌────┐     │
│  Description              │ ●──│ OFF │  ← gray track
│                           └────┘     │
│                           ┌────┐     │
│                           │──● │ ON  │  ← brand track
│                           └────┘     │
└──────────────────────────────────────┘

/* Checkbox */
┌──────────────────────────────────────┐
│  ☐ Unchecked                         │
│  ☑ Checked                           │
│  ■ Indeterminate                     │
│  ☐ Disabled (grayed out)             │
└──────────────────────────────────────┘

/* Radio Button */
┌──────────────────────────────────────┐
│  ○ Option A                          │
│  ● Option B (selected)               │
│  ○ Option C                          │
└──────────────────────────────────────┘
```

### 7.3 Cards

```
/* Standard Card */
┌──────────────────────────────────────┐
│                                      │
│  Card Title                          │
│                                      │
│  Card content goes here.             │
│                                      │
│  [Action Button]                     │
│                                      │
└──────────────────────────────────────┘

/* Glass Card */
╔══════════════════════════════════════╗
║                                      ║
║  Glassmorphism Effect                ║
║  (semi-transparent, blur behind)     ║
║                                      ║
╚══════════════════════════════════════╝

/* Stat Card */
┌──────────────────────────────────────┐
│                                      │
│  ┌────┐                              │
│  │ 📊 │  Metric Name                 │
│  └────┘                              │
│                                      │
│       1,234                          │
│                                      │
│  ↑ 12% from last month              │
│                                      │
└──────────────────────────────────────┘
```

### 7.4 Badges & Tags

```
/* Status Badges */
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ 🟢     │ │ 🟡     │ │ 🔴     │ │ 🔵     │
│ Active │ │Pending │ │ Error  │ │  Info  │
└────────┘ └────────┘ └────────┘ └────────┘

/* Count Badge */
┌────┐
│ 5  │  ← Pill shape, brand color
└────┘

/* Source Type Tags */
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ 🌐     │ │ 📄     │ │ ❓     │ │ 📎     │
│ Web    │ │  PDF   │ │  Q&A   │ │Upload  │
└────────┘ └────────┘ └────────┘ └────────┘
```

### 7.5 Modals & Dialogs

```
/* Confirmation Dialog */
┌─────────────────────────────────────────┐
│                                         │
│  ┌─────────────────────────────────────┐│
│  │                                     ││
│  │  ⚠️ Delete Client?                  ││
│  │                                     ││
│  │  This will permanently delete       ││
│  │  "Acme Corp" and all associated     ││
│  │  data including:                    ││
│  │                                     ││
│  │  • 456 context chunks               ││
│  │  • 23 Q&A pairs                     ││
│  │  • 89 conversations                 ││
│  │                                     ││
│  │  This action cannot be undone.      ││
│  │                                     ││
│  │  ┌─────────────┐ ┌─────────────┐   ││
│  │  │   Cancel    │ │   Delete    │   ││
│  │  │             │ │   (Red)     │   ││
│  │  └─────────────┘ └─────────────┘   ││
│  │                                     ││
│  └─────────────────────────────────────┘│
│                                         │
└─────────────────────────────────────────┘

/* Form Modal */
┌─────────────────────────────────────────┐
│                                         │
│  ┌─────────────────────────────────────┐│
│  │                                     ││
│  │  Edit Client                 [✕]   ││
│  │                                     ││
│  │  ┌───────────────────────────────┐ ││
│  │  │ Client Name                   │ ││
│  │  │ ───────────────────────────── │ ││
│  │  └───────────────────────────────┘ ││
│  │                                     ││
│  │  ┌───────────────────────────────┐ ││
│  │  │ Email                         │ ││
│  │  │ ───────────────────────────── │ ││
│  │  └───────────────────────────────┘ ││
│  │                                     ││
│  │  ┌───────────────────────────────┐ ││
│  │  │ Notes                         │ ││
│  │  │ ───────────────────────────── │ ││
│  │  │                               │ ││
│  │  └───────────────────────────────┘ ││
│  │                                     ││
│  │  ┌─────────────┐ ┌─────────────┐   ││
│  │  │   Cancel    │ │    Save     │   ││
│  │  └─────────────┘ └─────────────┘   ││
│  │                                     ││
│  └─────────────────────────────────────┘│
│                                         │
└─────────────────────────────────────────┘
```

### 7.6 Toast Notifications

```
/* Success Toast */
┌─────────────────────────────────────────┐
│  ✅  Client created successfully!    [✕]│
└─────────────────────────────────────────┘

/* Error Toast */
┌─────────────────────────────────────────┐
│  ❌  Failed to save changes.         [✕]│
└─────────────────────────────────────────┘

/* Warning Toast */
┌─────────────────────────────────────────┐
│  ⚠️  Usage limit at 80%.            [✕]│
└─────────────────────────────────────────┘

/* Info Toast */
┌─────────────────────────────────────────┐
│  ℹ️  New feature available!          [✕]│
└─────────────────────────────────────────┘
```

**Toast Position:** Bottom-right, stacked, auto-dismiss after 5s

### 7.7 Tooltips

```
/* Hover Tooltip */
           ┌────────────────────┐
           │ This is a tooltip  │
           └────────────────────┘
                    ▼
              ┌──────────┐
              │  Element  │
              └──────────┘

/* Rich Tooltip */
┌────────────────────────────────────┐
│  🔑 API Key                        │
│  ─────────────────────────────     │
│  Use this key to authenticate      │
│  API requests. Keep it secret!     │
│                                    │
│  Permissions: chat:write           │
│  Rate limit: 100 req/min           │
└────────────────────────────────────┘
```

### 7.8 Loading States

```
/* Skeleton Loader (Table) */
┌─────────────────────────────────────────┐
│  ████████  ████████████  ████████  ████ │
│  ████████  ████████████  ████████  ████ │
│  ████████  ████████████  ████████  ████ │
│  ████████  ████████████  ████████  ████ │
└─────────────────────────────────────────┘

/* Skeleton Loader (Card) */
┌─────────────────────────────────────────┐
│  ████████████████                       │
│  ████████                               │
│                                         │
│  ████████████████████████████████████   │
│  ████████████████████████████████████   │
│  ██████████████████                     │
│                                         │
│  ████████████                           │
└─────────────────────────────────────────┘

/* Spinner */
      ╭──────╮
     ╱        ╲
    │    ⏳    │
     ╲        ╱
      ╰──────╯

/* Progress Bar */
┌─────────────────────────────────────────┐
│  ████████████████░░░░░░░░░░░░░░  52%   │
└─────────────────────────────────────────┘
```

### 7.9 Empty States

```
/* Empty List */
┌─────────────────────────────────────────┐
│                                         │
│              ┌─────────┐                │
│              │   📭    │                │
│              └─────────┘                │
│                                         │
│           No items yet                  │
│                                         │
│     Create your first item to get       │
│     started.                            │
│                                         │
│        ┌──────────────────┐            │
│        │  + Create Item   │            │
│        └──────────────────┘            │
│                                         │
└─────────────────────────────────────────┘

/* Search No Results */
┌─────────────────────────────────────────┐
│                                         │
│              ┌─────────┐                │
│              │   🔍    │                │
│              └─────────┘                │
│                                         │
│         No results found                │
│                                         │
│     Try adjusting your search or        │
│     filter to find what you're          │
│     looking for.                        │
│                                         │
│        ┌──────────────────┐            │
│        │  Clear Filters   │            │
│        └──────────────────┘            │
│                                         │
└─────────────────────────────────────────┘
```

### 7.10 Data Table

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────────────┐  🔍 Search...  [Filter ▼]  [Export]  [+ New]│
│  │ Bulk Actions ▼  │                                              │
│  └─────────────────┘                                              │
│                                                                   │
│  ┌─────┬──────────────┬──────────────┬───────────┬─────────┬────┐│
│  │  ☐  │  Name    ↑↓  │  Status  ↑↓  │  Date ↑↓  │  ↑↓    │    ││
│  ├─────┼──────────────┼──────────────┼───────────┼─────────┼────┤│
│  │  ☐  │  Item 1      │  🟢 Active   │  Jan 15   │  ⋮    │    ││
│  ├─────┼──────────────┼──────────────┼───────────┼─────────┼────┤│
│  │  ☐  │  Item 2      │  🟡 Pending  │  Jan 14   │  ⋮    │    ││
│  ├─────┼──────────────┼──────────────┼───────────┼─────────┼────┤│
│  │  ☑  │  Item 3      │  🟢 Active   │  Jan 13   │  ⋮    │    ││
│  ├─────┼──────────────┼──────────────┼───────────┼─────────┼────┤│
│  │  ☐  │  Item 4      │  🔴 Error    │  Jan 12   │  ⋮    │    ││
│  └─────┴──────────────┴──────────────┴───────────┴─────────┴────┘│
│                                                                   │
│  2 selected  [Delete Selected]                                    │
│                                                                   │
│  Showing 1-4 of 12         [←] 1 2 3 [→]                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Responsive Breakpoints

### 8.1 Breakpoint Definitions

```css
/* Mobile First Approach */
:root {
  --bp-sm: 640px;    /* Small phones */
  --bp-md: 768px;    /* Tablets */
  --bp-lg: 1024px;   /* Small laptops */
  --bp-xl: 1280px;   /* Desktops */
  --bp-2xl: 1536px;  /* Large screens */
}

/* Media Queries */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
@media (min-width: 1536px) { /* 2xl */ }
```

### 8.2 Responsive Layouts

**Admin Dashboard - Mobile:**

```
┌─────────────────────┐
│                     │
│  ≡  Dashboard       │
│                     │
│  ┌─────────────────┐│
│  │ Total Clients   ││
│  │      12         ││
│  └─────────────────┘│
│  ┌─────────────────┐│
│  │ Total Messages  ││
│  │     8,547       ││
│  └─────────────────┘│
│  ┌─────────────────┐│
│  │ Active Bots     ││
│  │      10         ││
│  └─────────────────┘│
│  ┌─────────────────┐│
│  │ Revenue         ││
│  │    $2,340       ││
│  └─────────────────┘│
│                     │
│  /* Table becomes */│
│                     │
│  ┌─────────────────┐│
│  │ Acme Corp       ││
│  │ acme.com        ││
│  │ 🟢 Active       ││
│  │ 1,234 messages  ││
│  │ [View →]        ││
│  ├─────────────────┤│
│  │ TechStart       ││
│  │ tech.co         ││
│  │ 🟡 Crawling     ││
│  │ 456 messages    ││
│  │ [View →]        ││
│  └─────────────────┘│
│                     │
└─────────────────────┘
```

**Sidebar - Mobile (Drawer):**

```
/* Hidden by default, slides in from left */

┌────────────┬────────┐
│            │        │
│  Sidebar   │ Overlay│
│  (280px)   │ (dark) │
│            │        │
│  ┌──────┐  │        │
│  │Logo  │  │        │
│  └──────┘  │        │
│            │        │
│  Dashboard │        │
│  Clients   │        │
│  ...       │        │
│            │        │
│  User      │        │
│            │        │
└────────────┴────────┘
```

**Chat Widget - Mobile:**

```
┌─────────────────────┐
│                     │
│  /* Full screen */  │
│                     │
│  ┌─────────────────┐│
│  │ 🤖 Support  [✕] ││
│  ├─────────────────┤│
│  │                 ││
│  │  Messages...    ││
│  │                 ││
│  │                 ││
│  │                 ││
│  │                 ││
│  │                 ││
│  │                 ││
│  ├─────────────────┤│
│  │ Type message... ││
│  │              [➤]││
│  └─────────────────┘│
│                     │
└─────────────────────┘
```

### 8.3 Responsive Components

| Component | Mobile (<768px) | Tablet (768-1024px) | Desktop (>1024px) |
|-----------|----------------|---------------------|-------------------|
| Sidebar | Hidden (drawer) | Collapsed (icons) | Full (240px) |
| Stats Cards | 1 column, stacked | 2 columns | 4 columns |
| Data Table | Card view | Scrollable | Full |
| Chat Widget | Full screen | 380px fixed | 380px fixed |
| Modals | Full screen | 600px centered | 600px centered |
| Forms | Full width | 600px centered | 700px centered |
| Navigation | Bottom tabs | Sidebar | Sidebar |

---

## 9. Animation & Motion Design

### 9.1 Transition Principles

1. **Purposeful** — Every animation serves a function
2. **Quick** — 150-350ms for most transitions
3. **Smooth** — Use easing curves, not linear
4. **Consistent** — Same elements animate the same way

### 9.2 Animation Library

```css
/* Fade In */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Slide Up */
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Slide Down */
@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Slide In Right */
@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Scale In */
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Number Count Up (JS controlled) */
// Uses requestAnimationFrame for smooth counting

/* Skeleton Shimmer */
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-tertiary) 25%,
    var(--bg-quaternary) 50%,
    var(--bg-tertiary) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

### 9.3 Page Transitions

```css
/* Page Enter */
.page-enter {
  animation: fadeIn 0.3s var(--ease-out),
             slideUp 0.3s var(--ease-out);
}

/* Page Exit */
.page-exit {
  animation: fadeOut 0.2s var(--ease-in);
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
```

### 9.4 Micro-Interactions

| Interaction | Animation | Duration |
|-------------|-----------|----------|
| Button hover | scale(1.02), shadow increase | 150ms |
| Button click | scale(0.98) | 100ms |
| Input focus | border-color, ring appear | 200ms |
| Checkbox check | scale bounce | 200ms |
| Toggle switch | slide + color | 250ms |
| Dropdown open | slideDown + fadeIn | 200ms |
| Modal open | scaleIn + fadeIn | 250ms |
| Modal close | scaleOut + fadeOut | 200ms |
| Toast appear | slideInRight | 300ms |
| Toast dismiss | slideOutRight | 250ms |
| Table row hover | background change | 150ms |
| Card hover | translateY(-2px) | 200ms |
| Icon spin (loading) | rotate 360deg | 1s infinite |

---

## 10. Accessibility Standards

### 10.1 WCAG 2.1 AA Compliance

**Color Contrast:**

| Element | Minimum Ratio | Recommended |
|---------|---------------|-------------|
| Normal text | 4.5:1 | 7:1 |
| Large text (18px+) | 3:1 | 4.5:1 |
| UI components | 3:1 | 4.5:1 |

**Focus Indicators:**

```css
/* Visible focus ring for keyboard navigation */
:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Remove outline for mouse clicks */
:focus:not(:focus-visible) {
  outline: none;
}
```

**ARIA Labels:**

```html
<!-- Buttons -->
<button aria-label="Close dialog">✕</button>
<button aria-label="Delete client">🗑️</button>

<!-- Form inputs -->
<label for="email">Email Address</label>
<input id="email" type="email" aria-describedby="email-help" aria-invalid="true" />
<span id="email-help">We'll never share your email</span>

<!-- Status indicators -->
<span role="status" aria-live="polite">Client created successfully</span>

<!-- Loading states -->
<div role="progressbar" aria-valuenow="52" aria-valuemin="0" aria-valuemax="100">
  52% complete
</div>

<!-- Modals -->
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Delete Client?</h2>
</div>
```

### 10.2 Keyboard Navigation

| Key | Action |
|-----|--------|
| Tab | Move focus forward |
| Shift+Tab | Move focus backward |
| Enter/Space | Activate button/link |
| Escape | Close modal/dropdown |
| Arrow keys | Navigate within components |
| Home/End | First/last item in list |

### 10.3 Screen Reader Support

```html
<!-- Skip to main content -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<!-- Live regions for dynamic content -->
<div aria-live="polite" aria-atomic="true">
  <!-- Toast notifications appear here -->
</div>

<!-- Announce page changes -->
<h1 aria-live="polite">Dashboard</h1>

<!-- Table headers -->
<table>
  <thead>
    <tr>
      <th scope="col">Name</th>
      <th scope="col">Status</th>
    </tr>
  </thead>
</table>
```

### 10.4 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 11. Component Specifications Summary

### 11.1 Spacing System

| Token | Value | Use Case |
|-------|-------|----------|
| space-1 | 4px | Tight gaps (icon + text) |
| space-2 | 8px | Small gaps (within components) |
| space-3 | 12px | Medium gaps (form fields) |
| space-4 | 16px | Standard gaps (card padding) |
| space-6 | 24px | Large gaps (section padding) |
| space-8 | 32px | Extra large gaps (page sections) |
| space-12 | 48px | Section dividers |
| space-16 | 64px | Page margins (mobile) |
| space-24 | 96px | Page margins (desktop) |

### 11.2 Shadow System

| Level | Value | Use Case |
|-------|-------|----------|
| sm | 0 1px 2px rgba(0,0,0,0.3) | Buttons, inputs |
| md | 0 4px 12px rgba(0,0,0,0.4) | Cards, dropdowns |
| lg | 0 8px 32px rgba(0,0,0,0.5) | Modals, popovers |
| xl | 0 16px 48px rgba(0,0,0,0.6) | Tooltips, chat widget |
| glow | 0 0 20px rgba(108,92,231,0.3) | Primary buttons hover |

### 11.3 Border Radius System

| Token | Value | Use Case |
|-------|-------|----------|
| radius-sm | 6px | Badges, small elements |
| radius-md | 8px | Buttons, inputs |
| radius-lg | 12px | Cards, dropdowns |
| radius-xl | 16px | Modals, large cards |
| radius-2xl | 24px | Chat widget, hero sections |
| radius-full | 9999px | Avatars, pills, circles |

---

## 12. Implementation Notes

### 12.1 CSS Architecture

```css
/* Use CSS Custom Properties for theming */
/* Organize by component */
/* Use BEM naming convention */

/* Example */
.card { /* Block */ }
.card__header { /* Element */ }
.card__body { /* Element */ }
.card__footer { /* Element */ }
.card--featured { /* Modifier */ }
.card--loading { /* Modifier */ }
```

### 12.2 Component Structure

```
src/
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   ├── Table.tsx
│   │   ├── Tabs.tsx
│   │   ├── Tooltip.tsx
│   │   ├── Skeleton.tsx
│   │   └── EmptyState.tsx
│   │
│   ├── layout/
│   │   ├── AdminLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── TopBar.tsx
│   │   ├── PageHeader.tsx
│   │   └── MobileNav.tsx
│   │
│   ├── dashboard/
│   │   ├── StatsCard.tsx
│   │   ├── ClientList.tsx
│   │   ├── QuickActions.tsx
│   │   └── RecentActivity.tsx
│   │
│   ├── client/
│   │   ├── ContextList.tsx
│   │   ├── QAList.tsx
│   │   ├── ChatHistory.tsx
│   │   ├── AddContent.tsx
│   │   └── DatabaseConnection.tsx
│   │
│   └── widget/
│       ├── ChatBubble.tsx
│       ├── ChatWindow.tsx
│       ├── MessageBubble.tsx
│       ├── TypingIndicator.tsx
│       └── WelcomeScreen.tsx
│
├── styles/
│   ├── globals.css
│   ├── variables.css
│   ├── animations.css
│   └── utilities.css
│
└── lib/
    └── cn.ts  // classname utility (clsx + tailwind-merge)
```

### 12.3 Recommended Libraries

```json
{
  "dependencies": {
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "framer-motion": "^10.0.0",
    "lucide-react": "^0.300.0",
    "recharts": "^2.10.0",
    "@tremor/react": "^3.12.0",
    "react-hot-toast": "^2.4.0",
    "cmdk": "^0.2.0",
    "vaul": "^0.8.0",
    "sonner": "^1.0.0"
  }
}
```

---

## 13. Quick Reference Cheat Sheet

### Colors

```
Background:   #0A0A0F → #12121A → #1A1A25 → #22222F
Text:         #F5F5F7 → #A0A0B8 → #6B6B80 → #4A4A5A
Brand:        #6C5CE7 (purple) → #00D2FF (cyan)
Status:       ✅ #00E676  ⚠️ #FFB74D  ❌ #FF5252  ℹ️ #42A5F5
```

### Typography

```
Headings:     Plus Jakarta Sans / Inter, 300-48px, Bold
Body:         Inter, 16px, Regular/Semi
Small:        Inter, 14px, Medium
Mono:         JetBrains Mono, 14px
```

### Spacing

```
4px → 8px → 12px → 16px → 24px → 32px → 48px → 64px
```

### Radius

```
6px → 8px → 12px → 16px → 24px → 9999px
```

### Shadows

```
sm → md → lg → xl → glow
```

---

*Document Version: 1.0*
*Created: 2026-08-01*
*Total Pages Covered: 15+*
*Components Specified: 50+*
*Status: Ready for Development*
