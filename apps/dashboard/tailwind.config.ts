import type { Config } from 'tailwindcss';

// Two surfaces, one config (WEBSITE.md §3): `m-*` / `violet-*` tokens belong to the
// light marketing surface; the shadcn-style hsl tokens belong to the dark app.
const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        tier: {
          plain: 'hsl(var(--tier-plain))',
          tls: 'hsl(var(--tier-tls))',
          lightpanda: 'hsl(var(--tier-lightpanda))',
          chromium: 'hsl(var(--tier-chromium))',
        },
        m: {
          bg: 'var(--m-bg)',
          'bg-lighter': 'var(--m-bg-lighter)',
          surface: 'var(--m-surface)',
          ink: 'var(--m-ink)',
          border: { faint: 'var(--m-border-faint)', muted: 'var(--m-border-muted)', loud: 'var(--m-border-loud)' },
          illus: { faint: 'var(--m-illus-faint)', muted: 'var(--m-illus-muted)', DEFAULT: 'var(--m-illus-default)' },
        },
        violet: {
          DEFAULT: 'var(--violet-100)',
          100: 'var(--violet-100)',
          90: 'var(--violet-90)',
          48: 'var(--violet-48)',
          40: 'var(--violet-40)',
          24: 'var(--violet-24)',
          20: 'var(--violet-20)',
          16: 'var(--violet-16)',
          12: 'var(--violet-12)',
          8: 'var(--violet-8)',
          4: 'var(--violet-4)',
          hover: 'var(--violet-hover)',
          deep: 'var(--violet-deep)',
        },
      },
      borderRadius: {
        pill: '999px',
        card: '6px',
        panel: '8px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontWeight: { normal: '400', medium: '450', semibold: '500' },
      letterSpacing: { tightest: '-0.52px', tighter: '-0.4px', tight: '-0.24px', normal: '0.14px', wide: '0.8px' },
      maxWidth: { container: '1112px' },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-sm': 'var(--shadow-card-sm)',
        btn: 'var(--shadow-btn)',
        'btn-hover': 'var(--shadow-btn-hover)',
        cutout: 'var(--ring-cutout)',
      },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0, 0, 0.2, 1)' },
      transitionDuration: { DEFAULT: '200ms', fast: '150ms', reveal: '300ms', slow: '400ms' },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms cubic-bezier(0, 0, 0.2, 1)',
        'slide-up': 'slide-up 200ms cubic-bezier(0, 0, 0.2, 1)',
        'fade-up': 'fade-up 300ms cubic-bezier(0, 0, 0.2, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
