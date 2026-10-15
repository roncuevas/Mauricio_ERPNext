import * as SheetPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Sheet = SheetPrimitive.Root
export const SheetTrigger = SheetPrimitive.Trigger
export const SheetClose = SheetPrimitive.Close
export const SheetTitle = SheetPrimitive.Title
export const SheetDescription = SheetPrimitive.Description

export function SheetContent({ side = 'right', className, children, ...props }: ComponentProps<typeof SheetPrimitive.Content> & { side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return <SheetPrimitive.Portal><SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/35" /><SheetPrimitive.Content className={cn('fixed z-50 flex max-h-screen flex-col gap-4 border bg-[var(--color-surface)] p-5 text-[var(--color-heading)] shadow-[var(--shadow-card)]', side === 'right' && 'inset-y-0 right-0 w-[min(100%,28rem)] border-l', side === 'left' && 'inset-y-0 left-0 w-[min(100%,28rem)] border-r', side === 'top' && 'inset-x-0 top-0 border-b', side === 'bottom' && 'inset-x-0 bottom-0 border-t', className)} {...props}>{children}</SheetPrimitive.Content></SheetPrimitive.Portal>
}
export function SheetHeader({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('grid gap-1.5', className)} {...props} /> }
export function SheetFooter({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('mt-auto flex flex-col gap-2', className)} {...props} /> }
