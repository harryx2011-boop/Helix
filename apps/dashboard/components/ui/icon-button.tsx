// @harry/icon-button (D:/harry-ui registry): an icon-only button with a required name and a tooltip, on shadcn button + tooltip + kbd.
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type IconButtonProps = Omit<React.ComponentProps<typeof Button>, "size" | "children"> & {
  /** Accessible name and tooltip text. Required: an icon alone has no name. */
  label: string
  icon: React.ReactNode
  shortcut?: string
  size?: "sm" | "default" | "lg"
  side?: React.ComponentProps<typeof TooltipContent>["side"]
}

// Helix: its Button has icon-sm (32px) and icon-lg (40px), so the sizes map onto those, not the template's size classes.
const SIZE = { sm: "icon-sm", default: "icon", lg: "icon-lg" } as const

// forwardRef: a <ToolbarItem> (Radix asChild) needs the button element on React 18 as well as 19.
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, shortcut, size = "default", variant = "ghost", side, className, ...props },
  ref,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          variant={variant}
          size={SIZE[size]}
          aria-label={label}
          data-slot="icon-button"
          className={cn("text-[color:var(--h-subtle-fg,var(--muted-foreground))] hover:text-foreground", className)}
          {...props}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent {...(side && { side })} className="flex items-center gap-2">
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
})

export { IconButton }
