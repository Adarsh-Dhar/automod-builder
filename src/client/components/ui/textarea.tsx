import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
          "flex min-h-[60px] w-full rounded-[16px] border border-[#EBEBEB] bg-[#F4F2F7] px-4 py-3 text-base shadow-sm placeholder:text-[#AAAAAA] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#F5C842] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
