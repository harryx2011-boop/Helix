# Design system: Helix dashboard

Scope: the main product UI, `apps/dashboard` at `/app` (dark), plus the shared primitives under `apps/dashboard/components/ui/`. Values live in `TOKENS.md`; this file names them and never repeats a hex value.

## 1. Principles

- Dark first. The operator console defaults to dark regardless of the OS preference; a stored choice wins (`apps/dashboard/components/shell/theme-provider.tsx`).
- "This should feel like something you run: a terminal, a control panel, an instrument." (`FRONTEND.md:17`)
- Character animation explains the fetch ladder; it does not decorate a loading state (`DESIGN.md` §1, a pre-implementation spec).
- Reduced motion shortens every animation and transition to 0.01ms and sets the iteration count to 1 (`apps/dashboard/app/globals.css:203`).
- Every user-facing string follows the claims guard in `WEBSITE.md` §11; site copy never states counts (`CLAUDE.md`).

## 2. Type scale

- Families: Geist Sans and Geist Mono, loaded in `apps/dashboard/app/layout.tsx` and exposed as `font-sans` and `font-mono` (`TOKENS.md`, Type).
- Weights: `font-normal` (400), `font-medium` (450), `font-semibold` (500). Only these three (`CLAUDE.md`).
- Sizes: no custom size scale is defined in `tailwind.config.ts`. Components use Tailwind's default sizes, for example `text-sm` in `apps/dashboard/components/ui/button.tsx`.
- Mono labels: `font-mono uppercase tracking-wide` (`apps/dashboard/components/app/page-frame.tsx`). The label size there is the arbitrary `text-[11px]`, which is not in `TOKENS.md`.
- Tracking: use the `tracking-*` keys in `TOKENS.md`. `tracking-normal` is overridden to `0.14px`.

## 3. Layout

- Grid: `PageFrame` (`apps/dashboard/components/app/page-frame.tsx`) centres a column of `max-w-[1180px]` (arbitrary, not in `TOKENS.md`) with `border-x border-border` hairlines.
- Breakpoints: Tailwind defaults. `tailwind.config.ts` defines no `screens`.
- Spacing rhythm: Tailwind's default spacing scale. No custom spacing is defined.
- Panel structure: the sidebar sits on `bg-background` with `border-r border-border` (`apps/dashboard/components/app/sidebar.tsx`). Below `lg` the desktop rail is not rendered and the sidebar becomes a drawer. The top bar carries the workspace pill, Help, Docs and the primary action (`context.md`, `/app` shell note).
- Backdrop: `AppShell` draws one grid behind every `/app` screen (`apps/dashboard/components/app/app-shell.tsx`).

## 4. Components

| component | file | notes |
| --- | --- | --- |
| Button | `apps/dashboard/components/ui/button.tsx` | cva variants `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes `default`, `sm`, `lg`, `icon` |
| Input | `apps/dashboard/components/ui/input.tsx` | `h-9`, `rounded-card`, `border-input`, focus ring |
| Dialog | `apps/dashboard/components/ui/dialog.tsx` | Radix dialog; overlay `bg-background/80` with blur |
| Tabs | `apps/dashboard/components/ui/tabs.tsx` | Radix tabs; `rounded-card`, `text-sm font-medium` |
| Table | `apps/dashboard/components/ui/table.tsx` | table primitive set |
| Skeleton | `apps/dashboard/components/ui/skeleton.tsx` | loading placeholder primitive |
| PageFrame | `apps/dashboard/components/app/page-frame.tsx` | page skeleton for `/app` screens |
| AppShell | `apps/dashboard/components/app/app-shell.tsx` | backdrop grid behind `/app` |
| Sidebar | `apps/dashboard/components/app/sidebar.tsx` | desktop rail, drawer below `lg`, collapse state in `helix.app.sidebarCollapsed` |
| FetchLadder | `apps/dashboard/components/ladder/fetch-ladder.tsx` | renders every rung walked, in ladder order |
| FailurePanel | `apps/dashboard/components/result/failure-panel.tsx` | shows a concrete next step, not a generic retry |
| MarkdownView | `apps/dashboard/components/result/markdown-view.tsx` | GFM, KaTeX math, Shiki code blocks (`context.md`, 2026-09-27 note) |
| PromptBox | `apps/dashboard/components/playground/prompt-box.tsx` | `hero` and `app` variants (`context.md`, 1.6.0 note) |
| Logo | `apps/dashboard/components/shell/logo.tsx` | Helix mark with wordmark |
| BrandMark | `apps/dashboard/components/shared/brand-mark.tsx` | third-party real marks; `mono` forces `currentColor` |

## 5. States

- Hover, default button: `bg-primary/90`. Destructive: `bg-destructive/90`. Secondary: `bg-secondary/80`.
- Hover, outline and ghost: `bg-accent` with `text-accent-foreground`. Link: underline.
- Focus (buttons and inputs): `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`. `focus-visible:outline-none` is paired with this ring.
- Active: no active variant is defined in `button.tsx` or `input.tsx`.
- Disabled: button `opacity-50` with `pointer-events-none`; input `opacity-50` with `cursor-not-allowed`.
- Loading: `Skeleton` is the placeholder primitive. No loading rule is defined beyond it.
- Empty: no shared empty-state primitive exists in `components/ui/`.
- Error: `FailurePanel` renders the failure with a next step.

## 6. Motion

- Durations and easings: the Motion group in `TOKENS.md`. Use `duration-fast`, `duration-reveal`, `duration-slow` and `ease-out-strong` by key.
- Known drift: `apps/dashboard/components/ui/button.tsx` uses Tailwind's default `duration-150 ease-out`, not the `duration-fast` and `ease-out-strong` keys.
- Lens pair: `metadata-lens` and `metadata-lens-content` share `ease-in-out` and `3600ms`. The two tracks must share a timing function or the magnified copy drifts out of register (`apps/dashboard/tailwind.config.ts`, the comment above the keyframes).
- Reduced motion: `apps/dashboard/app/globals.css:203` sets animation and transition durations to 0.01ms for every element (`*` selector), so new animations need no separate opt-out.
- Entrance animations defined in `tailwind.config.ts`: `animate-fade-in`, `animate-slide-up`, `animate-fade-up`, `animate-fade-in-up`, `animate-text-swap-in`.

## 7. Brand

- Mark: `apps/dashboard/public/logo.svg`, drawn in `apps/dashboard/components/shell/logo.tsx`.
- Favicon and app icons: `apps/dashboard/app/icon.svg`, `apps/dashboard/app/apple-icon.png`, `apps/dashboard/public/favicon.ico`. PWA icons: `apps/dashboard/public/icon-192.png` and `apps/dashboard/public/icon-512.png` (`apps/dashboard/app/manifest.ts`).
- Voice: plain, declarative sentences. Example of existing copy: the metadata description in `apps/dashboard/app/layout.tsx`.
- Third-party marks: `BrandMark` renders the real mark as a static image (`apps/dashboard/components/shared/brand-mark.tsx`).
- Marketing site: its style source is `apps/dashboard/app/globals.css` under `[data-surface='marketing']`. It is not documented in this file.

## 8. Do / Don't

- Do use the hsl utilities (`bg-primary`, `text-muted-foreground`) for anything painted in `/app`. The marketing `m-*` and `violet-*` tokens render nothing outside `[data-surface='marketing']` (`context.md`, 1.6.0 note).
- Don't apply an alpha to a bare `var()` colour, such as `text-m-ink/56`. Tailwind 3 emits no CSS for it; use the `-rgb` channel tokens (`context.md`, 1.6.0 note).
- Do use the named radii: `rounded-pill`, `rounded-card` (6px), `rounded-panel` (8px) (`CLAUDE.md`).
- Don't use a font other than Geist Sans or Geist Mono, or a weight other than 400, 450 or 500 (`CLAUDE.md`).
- Don't state counts in product or site copy (`CLAUDE.md`, claims guard).
