// @harry/tab-bar (D:/harry-ui registry): pill or underline tabs with a gliding indicator, on shadcn tabs; motion after Watermelon UI continuous-tabs (MIT).
import * as React from "react"
import { motion, useReducedMotion } from "motion/react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type TabBarItem = Omit<React.ComponentProps<typeof TabsTrigger>, "value" | "children"> & {
  value: string
  label: React.ReactNode
  badge?: React.ReactNode
}

type TabBarProps = Omit<React.ComponentProps<typeof Tabs>, "value" | "onValueChange"> & {
  items: TabBarItem[]
  value: string
  onValueChange: (value: string) => void
  variant?: "underline" | "pill"
  animated?: boolean
  /** Classes for the tab list, merged last. The base sizes use `!`, so overrides need it too: "!h-11" for 44px phone targets. */
  listClassName?: string
  /** Accessible name of the tab list ("Player", "Settings sections"). */
  listLabel?: string
  /** Classes for the sliding indicator, e.g. a brand colour for the selected tab ("bg-primary"). */
  indicatorClassName?: string
  /** Content drawn in the same bar, before the tabs (a label such as "Ask Your Ledger"). Unset keeps the plain markup. */
  leading?: React.ReactNode
  /** Classes for that bar (layout, gap); only used with leading. */
  barClassName?: string
}

const GLIDE = { type: "spring", bounce: 0, duration: 0.3 } as const
// preventScroll is the default; it is here so TS libs without focusVisible still accept the object.
const MOUSE_FOCUS = { preventScroll: false, focusVisible: false }

function TabBar({ items, value, onValueChange, variant = "underline", animated = true, listClassName, listLabel, indicatorClassName, leading, barClassName, className, children, ...props }: TabBarProps) {
  const id = React.useId()
  const still = useReducedMotion() || !animated
  const pill = variant === "pill"
  const list = (
    <TabsList
      aria-label={listLabel}
      // No variant prop and leading-! modifiers, so it works on Tailwind 3 and 4 and on shadcn tabs with or without variants.
      className={cn(pill ? "!h-8 gap-0.5 !rounded-full bg-[color:var(--h-subtle,var(--muted))] !p-0.5" : "!h-9 w-full justify-start gap-4 !rounded-none border-b border-[color:var(--h-line,var(--border))] !bg-transparent !p-0", listClassName)}
    >
      {items.map(({ value: itemValue, label, badge, className: itemClass, ...triggerProps }) => (
        <TabsTrigger
          key={itemValue}
          value={itemValue}
          className={cn(
            "relative flex-none !border-transparent !bg-transparent !shadow-none after:hidden",
            // Triggers fill the list height, so listClassName sets both.
            // The ring offset is drawn in the list's colour, not --background (the pill's), so the ring stays apart
            // from the pill when an app points the pill and --ring at one colour (Sentinel's green).
            pill ? "h-full rounded-full px-3 focus-visible:!ring-offset-2 focus-visible:!ring-offset-[color:var(--h-subtle,var(--muted))]" : "h-full rounded-none px-0.5",
            itemClass,
          )}
          {...triggerProps}
          onMouseDown={(event) => {
            triggerProps.onMouseDown?.(event)
            // Radix focuses the tab from script on mousedown, which Chrome marks :focus-visible, so a click drew the ring.
            // Focusing first with focusVisible off keeps the ring for keyboard users only; older browsers ignore the option.
            if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey) event.currentTarget.focus(MOUSE_FOCUS)
          }}
        >
          {itemValue === value && (
            <motion.span
              layoutId={`${id}-indicator`}
              data-slot="tab-bar-indicator"
              transition={still ? { duration: 0 } : GLIDE}
              className={cn(
                "absolute",
                pill
                  ? "inset-0 rounded-full bg-background shadow-sm ring-1 ring-[color:var(--h-line,var(--border))]"
                  : "inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground",
                indicatorClassName,
              )}
              aria-hidden
            />
          )}
          <span className="relative z-10 inline-flex items-center gap-1.5">
            {label}
            {badge}
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  )
  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      data-slot="tab-bar"
      // The prop, not `still`: the server cannot see reduced motion, so markup built from it would not hydrate.
      data-animated={String(animated)}
      className={className}
      {...props}
    >
      {leading ? (
        <div data-slot="tab-bar-bar" className={cn("flex items-center", barClassName)}>
          {leading}
          {list}
        </div>
      ) : (
        list
      )}
      {children}
    </Tabs>
  )
}

export { TabBar, type TabBarItem }
export { TabsContent as TabBarContent } from "@/components/ui/tabs"
