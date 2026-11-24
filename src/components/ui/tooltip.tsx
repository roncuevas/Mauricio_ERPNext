import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { useState, type ComponentProps, type ReactElement } from 'react'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger
export function TooltipContent({ className, sideOffset = 5, ...props }: ComponentProps<typeof TooltipPrimitive.Content> & { sideOffset?: number }) { return <TooltipPrimitive.Portal><TooltipPrimitive.Content data-slot="tooltip-content" sideOffset={sideOffset} className={cn('z-50 max-w-xs rounded-lg border bg-[var(--color-heading)] px-3 py-2 text-xs font-medium text-[var(--color-surface)] shadow-[var(--shadow-card)]', className)} {...props} /></TooltipPrimitive.Portal> }

/**
 * Names an icon-only control on hover and keyboard focus; with no `label` it renders the control alone. `suppressed`
 * hides it while the control shows its own popup, such as an open Select, so the two never overlap.
 */
export function WithTooltip({ label, suppressed = false, children }: { label?: string; suppressed?: boolean; children: ReactElement }) {
  const [open, setOpen] = useState(false)
  if (!label) return children
  return <Tooltip open={open && !suppressed} onOpenChange={setOpen}><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}
