import * as PopoverPrimitive from '@radix-ui/react-popover'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor
export function PopoverContent({ className, align = 'center', sideOffset = 4, ...props }: ComponentProps<typeof PopoverPrimitive.Content> & { sideOffset?: number }) { return <PopoverPrimitive.Portal><PopoverPrimitive.Content align={align} sideOffset={sideOffset} className={cn('z-50 w-72 rounded-xl border bg-[var(--color-surface)] p-3 text-[var(--color-heading)] shadow-[var(--shadow-card)]', className)} {...props} /></PopoverPrimitive.Portal> }
