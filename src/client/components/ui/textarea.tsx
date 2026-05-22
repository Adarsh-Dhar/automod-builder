import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-[--radius] border border-[--border]",
        "bg-[--surface-2] px-3 py-2 text-sm text-[--foreground]",
        "placeholder:text-[--subtle]",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[--primary]/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
