/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[--primary]/50",
  {
    variants: {
      variant: {
        default:
          "border border-[--border] bg-[--surface-2] text-[--foreground]",
        secondary:
          "border-transparent bg-[--surface-3] text-[--muted-foreground]",
        destructive:
          "border-transparent bg-[--danger] text-white",
        outline: "text-[--foreground] border-[--border]",
        success: "bg-[--success]/15 text-[--success] border-[--success]/25",
        warning: "bg-[--warning]/15 text-[--warning] border-[--warning]/25",
        danger: "bg-[--danger]/15 text-[--danger] border-[--danger]/25",
        info: "bg-[--info]/15 text-[--info] border-[--info]/25",
        muted: "bg-[--surface-3] text-[--muted-foreground]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
