import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card" className={cn('card', className)} {...props} />
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div data-slot="card-header" className={cn('grid auto-rows-min items-start gap-1.5 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]', className)} {...props} /> }
/** `as` keeps the document outline correct when a card sits directly under the page h1. */
export function CardTitle({ as: Heading = 'h3', className, ...props }: HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4' }) { return <Heading data-slot="card-title" className={cn('font-semibold leading-none', className)} {...props} /> }
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) { return <p data-slot="card-description" className={cn('text-sm text-[var(--color-muted)]', className)} {...props} /> }
export function CardAction({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div data-slot="card-action" className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...props} /> }
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div data-slot="card-content" className={cn('px-0', className)} {...props} /> }
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div data-slot="card-footer" className={cn('flex items-center', className)} {...props} /> }
