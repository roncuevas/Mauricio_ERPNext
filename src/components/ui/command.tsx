import { Command as CommandPrimitive } from 'cmdk'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Command = ({ className, ...props }: ComponentProps<typeof CommandPrimitive>) => <CommandPrimitive data-slot="command" className={cn('flex h-full w-full flex-col overflow-hidden rounded-lg bg-[var(--color-surface)] text-[var(--color-heading)]', className)} {...props} />
export const CommandInput = ({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) => <CommandPrimitive.Input data-slot="command-input" className={cn('control mb-2 w-full', className)} {...props} />
export const CommandList = ({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) => <CommandPrimitive.List data-slot="command-list" className={cn('max-h-64 overflow-y-auto', className)} {...props} />
export const CommandEmpty = ({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) => <CommandPrimitive.Empty data-slot="command-empty" className={cn('p-4 text-center text-sm text-[var(--color-muted)]', className)} {...props} />
export const CommandGroup = ({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) => <CommandPrimitive.Group data-slot="command-group" className={cn('overflow-hidden p-1', className)} {...props} />
export const CommandItem = ({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) => <CommandPrimitive.Item data-slot="command-item" className={cn('flex cursor-pointer items-center rounded-md px-3 py-2 text-sm outline-none aria-selected:bg-[var(--color-primary-soft)] aria-selected:text-[var(--color-primary-hover)]', className)} {...props} />
