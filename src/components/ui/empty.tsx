import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Empty({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return <div data-slot="empty" className={cn('grid place-items-center gap-2 rounded-lg border border-dashed p-8 text-center', className)} {...props}>{children}</div>
}

export function EmptyHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div data-slot="empty-header" className={cn('grid gap-1.5', className)} {...props} /> }
export function EmptyTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) { return <h3 data-slot="empty-title" className={cn('font-semibold', className)} {...props} /> }
export function EmptyDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) { return <p data-slot="empty-description" className={cn('text-sm text-[var(--color-muted)]', className)} {...props} /> }
