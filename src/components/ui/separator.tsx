import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Separator({ className, orientation = 'horizontal', ...props }: ComponentProps<'div'> & { orientation?: 'horizontal' | 'vertical' }) {
  return <div data-slot="separator" role="separator" aria-orientation={orientation} className={cn('shrink-0 bg-[var(--color-border-subtle)]', orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full', className)} {...props} />
}
