import * as SelectPrimitive from '@radix-ui/react-select'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value
export const SelectLabel = SelectPrimitive.Label
export const SelectSeparator = SelectPrimitive.Separator
export const SelectItem = ({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) => <SelectPrimitive.Item className={cn('relative flex w-full cursor-default select-none items-center rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-[var(--color-primary-soft)] data-[highlighted]:text-[var(--color-primary-hover)]', className)} {...props}><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>
export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) { return <SelectPrimitive.Trigger className={cn('control ui-select-trigger flex w-full items-center justify-between gap-2 text-left', className)} {...props}>{children}<svg aria-hidden="true" className="ui-select-chevron" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg></SelectPrimitive.Trigger> }
export function SelectContent({ className, children, position = 'popper', ...props }: ComponentProps<typeof SelectPrimitive.Content>) { return <SelectPrimitive.Portal><SelectPrimitive.Content position={position} className={cn('z-50 max-h-80 min-w-[8rem] overflow-y-auto rounded-lg border bg-[var(--color-surface)] p-1 text-[var(--color-heading)] shadow-[var(--shadow-card)]', className)} {...props}>{children}</SelectPrimitive.Content></SelectPrimitive.Portal> }
