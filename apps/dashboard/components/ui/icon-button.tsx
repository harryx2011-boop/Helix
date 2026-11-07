// @harry/icon-button (D:/harry-ui registry): an icon-only button with a required name and a tooltip, on shadcn button + tooltip + kbd.
import type * as React from "react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type IconButtonProps = Omit<React.ComponentProps<typeof Button>, "size" | "children"> & {
  label: string
  icon: React.ReactNode
  shortcut?: string
  size?: "sm" | "default" | "lg"
  side?: React.ComponentProps<typeof TooltipContent>["side"]
}

const SIZE = { sm: "icon-sm", default: "icon", lg: "icon-lg" } as const

function IconButton({ label, icon, shortcut, size = "default", variant = "ghost", side, className, ...props }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={SIZE[size]}
          aria-label={label}
          data-slot="icon-button"
          className={cn("text-muted-foreground hover:text-foreground", className)}
          {...props}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side ?? "top"} className="flex items-center gap-2">
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

export { IconButton }
