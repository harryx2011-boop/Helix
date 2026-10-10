# Tokens: Helix

Source of truth: `apps/dashboard/app/globals.css` (CSS variables) and `apps/dashboard/tailwind.config.ts` (Tailwind keys). Themes: dark default. `ThemeProvider` puts `.dark` on `<html>` (`apps/dashboard/components/shell/theme-provider.tsx`). Light is the `:root` fallback and the `.light` opt-out. The `prefers-color-scheme: dark` block (`apps/dashboard/app/globals.css:83`) repeats the dark values under `:root:not(.light)`. The marketing surface (`[data-surface='marketing']`) is out of scope; see `DESIGN-SYSTEM.md`, Brand.

## Color
| token | value | use | source |
| --- | --- | --- | --- |
| `--background` | `0 0% 100%` | light: page ground (`bg-background`) | `apps/dashboard/app/globals.css:11` |
| `--foreground` | `222 48% 9%` | light: text | `apps/dashboard/app/globals.css:12` |
| `--card` | `0 0% 100%` | light: card surface | `apps/dashboard/app/globals.css:13` |
| `--card-foreground` | `222 48% 9%` | light: card text | `apps/dashboard/app/globals.css:14` |
| `--popover` | `0 0% 100%` | light: popover surface | `apps/dashboard/app/globals.css:15` |
| `--popover-foreground` | `222 48% 9%` | light: popover text | `apps/dashboard/app/globals.css:16` |
| `--primary` | `263 83% 58%` | light: primary fill (`bg-primary`), links | `apps/dashboard/app/globals.css:17` |
| `--primary-foreground` | `0 0% 100%` | light: text on primary | `apps/dashboard/app/globals.css:18` |
| `--secondary` | `240 20% 97%` | light: secondary fill, inline code | `apps/dashboard/app/globals.css:19` |
| `--secondary-foreground` | `222 48% 9%` | light: text on secondary | `apps/dashboard/app/globals.css:20` |
| `--muted` | `240 20% 97%` | light: muted fill | `apps/dashboard/app/globals.css:21` |
| `--muted-foreground` | `222 18% 40%` | light: muted text, placeholder | `apps/dashboard/app/globals.css:22` |
| `--accent` | `258 90% 96%` | light: hover wash (`hover:bg-accent`) | `apps/dashboard/app/globals.css:23` |
| `--accent-foreground` | `263 83% 40%` | light: text on accent | `apps/dashboard/app/globals.css:24` |
| `--destructive` | `0 74% 42%` | light: destructive fill | `apps/dashboard/app/globals.css:25` |
| `--destructive-foreground` | `0 0% 100%` | light: text on destructive | `apps/dashboard/app/globals.css:26` |
| `--success` | `142 71% 29%` | light: success | `apps/dashboard/app/globals.css:27` |
| `--success-foreground` | `0 0% 100%` | light: text on success | `apps/dashboard/app/globals.css:28` |
| `--warning` | `38 92% 33%` | light: warning | `apps/dashboard/app/globals.css:29` |
| `--warning-foreground` | `0 0% 100%` | light: text on warning | `apps/dashboard/app/globals.css:30` |
| `--border` | `228 22% 91%` | light: borders (`border-border`) | `apps/dashboard/app/globals.css:31` |
| `--input` | `228 22% 91%` | light: input border | `apps/dashboard/app/globals.css:32` |
| `--ring` | `263 83% 58%` | light: focus ring | `apps/dashboard/app/globals.css:33` |
| `--tier-plain` | `262 93% 68%` | light: fetch-ladder tier, plain | `apps/dashboard/app/globals.css:38` |
| `--tier-tls` | `258 90% 66%` | light: fetch-ladder tier, TLS | `apps/dashboard/app/globals.css:39` |
| `--tier-lightpanda` | `263 83% 58%` | light: fetch-ladder tier, lightpanda | `apps/dashboard/app/globals.css:40` |
| `--tier-chromium` | `265 69% 42%` | light: fetch-ladder tier, chromium | `apps/dashboard/app/globals.css:41` |
| `--background` | `0 0% 3%` | dark: page ground (`bg-background`) | `apps/dashboard/app/globals.css:51` |
| `--foreground` | `0 0% 96%` | dark: text | `apps/dashboard/app/globals.css:52` |
| `--card` | `0 0% 5%` | dark: card surface | `apps/dashboard/app/globals.css:53` |
| `--card-foreground` | `0 0% 96%` | dark: card text | `apps/dashboard/app/globals.css:54` |
| `--popover` | `0 0% 7%` | dark: popover surface | `apps/dashboard/app/globals.css:55` |
| `--popover-foreground` | `0 0% 96%` | dark: popover text | `apps/dashboard/app/globals.css:56` |
| `--primary` | `258 90% 66%` | dark: primary fill (`bg-primary`), links | `apps/dashboard/app/globals.css:57` |
| `--primary-foreground` | `0 0% 100%` | dark: text on primary | `apps/dashboard/app/globals.css:58` |
| `--secondary` | `0 0% 10%` | dark: secondary fill, inline code | `apps/dashboard/app/globals.css:59` |
| `--secondary-foreground` | `0 0% 96%` | dark: text on secondary | `apps/dashboard/app/globals.css:60` |
| `--muted` | `0 0% 10%` | dark: muted fill | `apps/dashboard/app/globals.css:61` |
| `--muted-foreground` | `0 0% 64%` | dark: muted text, placeholder | `apps/dashboard/app/globals.css:62` |
| `--accent` | `262 40% 16%` | dark: hover wash (`hover:bg-accent`) | `apps/dashboard/app/globals.css:63` |
| `--accent-foreground` | `258 90% 76%` | dark: text on accent | `apps/dashboard/app/globals.css:64` |
| `--destructive` | `0 91% 71%` | dark: destructive fill | `apps/dashboard/app/globals.css:65` |
| `--destructive-foreground` | `0 0% 3%` | dark: text on destructive | `apps/dashboard/app/globals.css:66` |
| `--success` | `142 69% 58%` | dark: success | `apps/dashboard/app/globals.css:67` |
| `--success-foreground` | `0 0% 3%` | dark: text on success | `apps/dashboard/app/globals.css:68` |
| `--warning` | `43 96% 56%` | dark: warning | `apps/dashboard/app/globals.css:69` |
| `--warning-foreground` | `0 0% 3%` | dark: text on warning | `apps/dashboard/app/globals.css:70` |
| `--border` | `0 0% 14%` | dark: borders (`border-border`) | `apps/dashboard/app/globals.css:71` |
| `--input` | `0 0% 14%` | dark: input border | `apps/dashboard/app/globals.css:72` |
| `--ring` | `258 90% 66%` | dark: focus ring | `apps/dashboard/app/globals.css:73` |
| `--tier-plain` | `253 100% 92%` | dark: fetch-ladder tier, plain | `apps/dashboard/app/globals.css:77` |
| `--tier-tls` | `262 93% 85%` | dark: fetch-ladder tier, TLS | `apps/dashboard/app/globals.css:78` |
| `--tier-lightpanda` | `258 90% 76%` | dark: fetch-ladder tier, lightpanda | `apps/dashboard/app/globals.css:79` |
| `--tier-chromium` | `262 91% 68%` | dark: fetch-ladder tier, chromium | `apps/dashboard/app/globals.css:80` |

## Type
| token | value | use | source |
| --- | --- | --- | --- |
| `--font-sans` | `var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif` | UI and body font (`font-sans`) | `apps/dashboard/app/globals.css:44` |
| `--font-mono` | `var(--font-geist-mono), ui-monospace, 'SF Mono', monospace` | code and mono labels (`font-mono`) | `apps/dashboard/app/globals.css:45` |
| `fontWeight.normal` | `400` | `font-normal` | `apps/dashboard/tailwind.config.ts:68` |
| `fontWeight.medium` | `450` | `font-medium` | `apps/dashboard/tailwind.config.ts:68` |
| `fontWeight.semibold` | `500` | `font-semibold` | `apps/dashboard/tailwind.config.ts:68` |
| `letterSpacing.tightest` | `-0.52px` | `tracking-tightest` | `apps/dashboard/tailwind.config.ts:69` |
| `letterSpacing.tighter` | `-0.4px` | `tracking-tighter` | `apps/dashboard/tailwind.config.ts:69` |
| `letterSpacing.tight` | `-0.24px` | `tracking-tight` | `apps/dashboard/tailwind.config.ts:69` |
| `letterSpacing.normal` | `0.14px` | `tracking-normal` (replaces Tailwind's `normal`) | `apps/dashboard/tailwind.config.ts:69` |
| `letterSpacing.wide` | `0.8px` | `tracking-wide` | `apps/dashboard/tailwind.config.ts:69` |

## Radius
| token | value | use | source |
| --- | --- | --- | --- |
| `--radius` | `6px` | base radius (`rounded-lg`) | `apps/dashboard/app/globals.css:43` |
| `borderRadius.pill` | `999px` | `rounded-pill` | `apps/dashboard/tailwind.config.ts:57` |
| `borderRadius.card` | `6px` | `rounded-card`: buttons, inputs, tabs | `apps/dashboard/tailwind.config.ts:58` |
| `borderRadius.panel` | `8px` | `rounded-panel` | `apps/dashboard/tailwind.config.ts:59` |
| `borderRadius.lg` | `var(--radius)` | `rounded-lg` | `apps/dashboard/tailwind.config.ts:60` |
| `borderRadius.md` | `calc(var(--radius) - 2px)` | `rounded-md` | `apps/dashboard/tailwind.config.ts:61` |
| `borderRadius.sm` | `calc(var(--radius) - 4px)` | `rounded-sm` | `apps/dashboard/tailwind.config.ts:62` |

## Motion
| token | value | use | source |
| --- | --- | --- | --- |
| `transitionTimingFunction.DEFAULT` | `cubic-bezier(0, 0, 0.2, 1)` | default timing function | `apps/dashboard/tailwind.config.ts:79` |
| `transitionTimingFunction.out-strong` | `cubic-bezier(0.23, 1, 0.32, 1)` | `ease-out-strong` | `apps/dashboard/tailwind.config.ts:79` |
| `transitionDuration.DEFAULT` | `200ms` | default duration | `apps/dashboard/tailwind.config.ts:80` |
| `transitionDuration.fast` | `150ms` | `duration-fast` | `apps/dashboard/tailwind.config.ts:80` |
| `transitionDuration.reveal` | `300ms` | `duration-reveal` | `apps/dashboard/tailwind.config.ts:80` |
| `transitionDuration.slow` | `400ms` | `duration-slow` | `apps/dashboard/tailwind.config.ts:80` |
| `animation.fade-in` | `150ms cubic-bezier(0, 0, 0.2, 1)` | `animate-fade-in` | `apps/dashboard/tailwind.config.ts:142` |
| `animation.slide-up` | `200ms cubic-bezier(0, 0, 0.2, 1)` | `animate-slide-up` | `apps/dashboard/tailwind.config.ts:146` |
| `animation.fade-up` | `300ms cubic-bezier(0, 0, 0.2, 1) both` | `animate-fade-up` | `apps/dashboard/tailwind.config.ts:147` |
| `animation.fade-in-up` | `300ms cubic-bezier(0, 0, 0.2, 1) both` | `animate-fade-in-up` | `apps/dashboard/tailwind.config.ts:150` |
| `animation.text-swap-in` | `150ms ease-in-out both` | `animate-text-swap-in` | `apps/dashboard/tailwind.config.ts:152` |
