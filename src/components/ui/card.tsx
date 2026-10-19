import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card" className={cn('card', className)} {...props} />
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div data-slot="card-header" className={cn('grid gap-1.5', className)} {...props} /> }
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) { return <h3 data-slot="card-title" className={cn('font-semibold leading-none', className)} {...props} /> }
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) { return <p data-slot="card-description" className={cn('text-sm text-[var(--color-muted)]', className)} {...props} /> }
export function CardAction({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div data-slot="card-action" className={cn('justify-self-end', className)} {...props} /> }
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div data-slot="card-content" className={cn('px-0', className)} {...props} /> }
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div data-slot="card-footer" className={cn('flex items-center', className)} {...props} /> }
