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
}

const GLIDE = { type: "spring", bounce: 0, duration: 0.3 } as const

function TabBar({ items, value, onValueChange, variant = "underline", animated = true, listClassName, listLabel, indicatorClassName, className, children, ...props }: TabBarProps) {
  const id = React.useId()
  const still = useReducedMotion() || !animated
  const pill = variant === "pill"
  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      data-slot="tab-bar"
      data-animated={String(!still)}
      className={className}
      {...props}
    >
      <TabsList
        aria-label={listLabel}
        // No variant prop and leading-! modifiers, so it works on Tailwind 3 and 4 and on shadcn tabs with or without variants.
        className={cn(pill ? "!h-8 gap-0.5 !rounded-full bg-muted !p-0.5" : "!h-9 w-full justify-start gap-4 !rounded-none border-b !bg-transparent !p-0", listClassName)}
      >
        {items.map(({ value: itemValue, label, badge, className: itemClass, ...triggerProps }) => (
          <TabsTrigger
            key={itemValue}
            value={itemValue}
            className={cn(
              "relative flex-none !border-transparent !bg-transparent !shadow-none after:hidden",
              // Triggers fill the list height, so listClassName sets both.
              pill ? "h-full rounded-full px-3" : "h-full rounded-none px-0.5",
              itemClass,
            )}
            {...triggerProps}
          >
            {itemValue === value && (
              <motion.span
                layoutId={`${id}-indicator`}
                data-slot="tab-bar-indicator"
                transition={still ? { duration: 0 } : GLIDE}
                className={cn(
                  "absolute",
                  pill
                    ? "inset-0 rounded-full bg-background shadow-sm ring-1 ring-border"
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
      {children}
    </Tabs>
  )
}

export { TabBar, type TabBarItem }
export { TabsContent as TabBarContent } from "@/components/ui/tabs"
