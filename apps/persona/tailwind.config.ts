import type { Config } from 'tailwindcss';

// Persona's system (PERSONA.md §2): light, Inter + JetBrains Mono, black
// primary, blue reserved for actions, eleven role tints for content. The
// shadcn-style hsl tokens exist only so the copied ui/ primitives work; they
// resolve to the same palette.
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
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        p: {
          bg: 'var(--p-bg)',
          surface: 'var(--p-surface)',
          ink: 'var(--p-ink)',
          'ink-2': 'var(--p-ink-2)',
          'ink-3': 'var(--p-ink-3)',
          line: 'var(--p-line)',
          'line-2': 'var(--p-line-2)',
          code: 'var(--p-code)',
          highlight: 'var(--p-highlight)',
          illus: 'var(--p-illus)',
          wash: 'var(--p-wash)',
          'wash-hover': 'var(--p-wash-hover)',
        },
        blue: {
          DEFAULT: 'var(--p-blue)',
          hover: 'var(--p-blue-hover)',
          soft: 'var(--p-blue-soft)',
          ring: 'var(--p-blue-ring)',
          60: 'var(--p-blue-60)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        pill: '999px',
        card: '10px',
        panel: '14px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        btn: 'var(--shadow-btn)',
        'btn-hover': 'var(--shadow-btn-hover)',
        'card-sm': 'var(--shadow-card-sm)',
        card: 'var(--shadow-card)',
        panel: 'var(--shadow-panel)',
      },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0, 0, 0.2, 1)' },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        stripes: { from: { backgroundPosition: '0 0' }, to: { backgroundPosition: '28px 0' } },
        blink: { '0%, 100%': { opacity: '0' }, '50%': { opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms cubic-bezier(0, 0, 0.2, 1)',
        'fade-up': 'fade-up 240ms cubic-bezier(0, 0, 0.2, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        stripes: 'stripes 700ms linear infinite',
        blink: 'blink 1s step-end infinite',
      },
    },
  },
  plugins: [],
};

export default config;
