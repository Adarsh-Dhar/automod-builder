import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--primary]/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow-sm hover:shadow-md active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-[--primary] text-[--primary-foreground] font-semibold shadow-sm hover:bg-[--primary]/90 hover:shadow-md",
        destructive:
          "bg-[--danger] text-white shadow-sm hover:bg-[--danger]/90 hover:shadow-md",
        outline: "border-2 border-[--border] bg-transparent text-[--foreground] hover:bg-[--surface-3] hover:border-[--border-strong]",
        secondary:
          "bg-[--surface-2] text-[--foreground] border border-[--border] hover:bg-[--surface-3]",
        ghost: "hover:bg-[--surface-3] hover:text-[--foreground] text-[--muted-foreground]",
        link: "text-[--primary] underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-9 px-5 py-2",
        sm: "min-h-8 rounded-xl px-3 text-xs",
        lg: "min-h-10 rounded-2xl px-8",
        icon: "h-9 w-9 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
