import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

export function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) { return <DialogPrimitive.Portal {...props} /> }
export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) { return <DialogPrimitive.Overlay className={cn('fixed inset-0 z-50 bg-slate-950/35', className)} {...props} /> }
export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) { return <DialogPortal><DialogOverlay /><DialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-[var(--color-surface)] p-6 text-[var(--color-heading)] shadow-[var(--shadow-card)]', className)} {...props}>{children}</DialogPrimitive.Content></DialogPortal> }
export function DialogHeader({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('grid gap-1.5', className)} {...props} /> }
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} /> }
