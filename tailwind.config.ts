import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6C5CE7',
          hover: '#7E6FF0',
          light: 'rgba(108, 92, 231, 0.15)',
          cyan: '#00D2FF',
          'cyan-light': 'rgba(0, 210, 255, 0.15)',
        },
        surface: {
          // Client Dashboard Tokens
          DEFAULT: '#FFFFFF',
          muted: '#F9F9F8',
          subtle: '#F3F3F2',
          border: '#E8E8E6',
          // Admin Dashboard Tokens
          primary: '#0A0A0F',
          secondary: '#12121A',
          tertiary: '#1A1A25',
          quaternary: '#22222F',
          hover: '#2A2A38',
          active: '#32324A',
        },
        ink: {
          DEFAULT: '#1A1A19',
          secondary: '#6B6B68',
          muted: '#A8A8A4',
        },
        accent: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
          light: '#EFF6FF',
          muted: '#BFDBFE',
        },
        status: {
          green: '#16A34A',
          greenBg: '#F0FDF4',
          amber: '#D97706',
          amberBg: '#FFFBEB',
          red: '#DC2626',
          redBg: '#FEF2F2',
          blue: '#2563EB',
          blueBg: '#EFF6FF',
        },
        // Shadcn UI Defaults (Mapped to White Minimalist for Client Dashboard)
        background: '#FFFFFF',
        foreground: '#1A1A19',
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#1A1A19',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#1A1A19',
        },
        border: '#E8E8E6',
        input: '#E8E8E6',
        ring: '#2563EB',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        glow: '0 0 20px rgba(108, 92, 231, 0.3)',
        'glow-cyan': '0 0 20px rgba(0, 210, 255, 0.3)',
        'glow-sm': '0 0 10px rgba(108, 92, 231, 0.2)',
      },
    },
  },
  plugins: [],
}
export default config
