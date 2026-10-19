import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const ToggleGroup = ToggleGroupPrimitive.Root
export function ToggleGroupItem({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return <ToggleGroupPrimitive.Item data-slot="toggle-group-item" className={cn('rounded-md px-3 py-2 text-sm font-semibold text-[var(--color-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] data-[state=on]:bg-[var(--color-primary-soft)] data-[state=on]:text-[var(--color-primary-hover)]', className)} {...props} />
}
