import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const AlertDialog = AlertDialogPrimitive.Root
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger
export const AlertDialogCancel = AlertDialogPrimitive.Cancel
export const AlertDialogAction = AlertDialogPrimitive.Action
export const AlertDialogTitle = AlertDialogPrimitive.Title
export const AlertDialogDescription = AlertDialogPrimitive.Description
export function AlertDialogContent({ className, children, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) { return <AlertDialogPrimitive.Portal><AlertDialogPrimitive.Overlay data-slot="alert-dialog-overlay" className="fixed inset-0 z-50 bg-slate-950/35" /><AlertDialogPrimitive.Content data-slot="alert-dialog-content" className={cn('fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-[var(--color-surface)] p-6 text-[var(--color-heading)] shadow-[var(--shadow-card)]', className)} {...props}>{children}</AlertDialogPrimitive.Content></AlertDialogPrimitive.Portal> }
export function AlertDialogHeader({ className, ...props }: ComponentProps<'div'>) { return <div data-slot="alert-dialog-header" className={cn('grid gap-1.5', className)} {...props} /> }
export function AlertDialogFooter({ className, ...props }: ComponentProps<'div'>) { return <div data-slot="alert-dialog-footer" className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} /> }
