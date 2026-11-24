import * as SheetPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { IconButton } from './button'
import { cn } from '@/lib/utils'

export const Sheet = SheetPrimitive.Root
export const SheetTrigger = SheetPrimitive.Trigger
export const SheetClose = SheetPrimitive.Close
export const SheetTitle = SheetPrimitive.Title
export const SheetDescription = SheetPrimitive.Description

/** As in shadcn, every sheet gets a close button in its top corner; `showCloseButton={false}` leaves it out. */
export function SheetContent({ side = 'right', showCloseButton = true, className, children, ...props }: ComponentProps<typeof SheetPrimitive.Content> & { side?: 'top' | 'right' | 'bottom' | 'left'; showCloseButton?: boolean }) {
  const { t } = useTranslation()
  return <SheetPrimitive.Portal><SheetPrimitive.Overlay data-slot="sheet-overlay" className="fixed inset-0 z-50 bg-slate-950/35" /><SheetPrimitive.Content data-slot="sheet-content" className={cn('fixed z-50 flex max-h-screen flex-col gap-4 border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-heading)] shadow-[var(--shadow-card)]', side === 'right' && 'inset-y-0 right-0 w-[min(100%,28rem)] border-l', side === 'left' && 'inset-y-0 left-0 w-[min(100%,28rem)] border-r', side === 'top' && 'inset-x-0 top-0 border-b', side === 'bottom' && 'inset-x-0 bottom-0 border-t', className)} {...props}>
    {children}
    {showCloseButton && <SheetPrimitive.Close asChild><IconButton type="button" size="compact" data-slot="sheet-close" className="sheet-close" label={t('common.close')} icon={<X aria-hidden="true" />} /></SheetPrimitive.Close>}
  </SheetPrimitive.Content></SheetPrimitive.Portal>
}
export function SheetHeader({ className, ...props }: ComponentProps<'div'>) { return <div data-slot="sheet-header" className={cn('grid gap-1.5', className)} {...props} /> }
export function SheetFooter({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('mt-auto flex flex-col gap-2', className)} {...props} /> }
