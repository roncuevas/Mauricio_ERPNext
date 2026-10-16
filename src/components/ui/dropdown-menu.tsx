import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup = DropdownMenuPrimitive.Group
export const DropdownMenuLabel = DropdownMenuPrimitive.Label
export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator
export function DropdownMenuContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content> & { sideOffset?: number }) { return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content sideOffset={sideOffset} className={cn('z-50 min-w-40 rounded-lg border bg-[var(--color-surface)] p-1 text-[var(--color-heading)] shadow-[var(--shadow-card)]', className)} {...props} /></DropdownMenuPrimitive.Portal> }
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item>) { return <DropdownMenuPrimitive.Item className={cn('flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none focus:bg-[var(--color-primary-soft)]', className)} {...props} /> }
export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return <DropdownMenuPrimitive.CheckboxItem className={cn('relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none focus:bg-[var(--color-primary-soft)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}><span className="absolute left-2 inline-flex h-4 w-4 items-center justify-center">{props.checked ? '✓' : ''}</span>{children}</DropdownMenuPrimitive.CheckboxItem>
}
