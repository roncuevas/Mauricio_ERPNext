import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { cn } from '@/lib/utils'

export function Checkbox({ className, ...props }: CheckboxPrimitive.CheckboxProps) {
  return <CheckboxPrimitive.Root data-slot="checkbox" className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-400 bg-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] data-[state=checked]:border-[var(--color-primary)] data-[state=checked]:bg-[var(--color-primary)]', className)} {...props} />
}

export function CheckboxIndicator({ className, ...props }: CheckboxPrimitive.CheckboxIndicatorProps) {
  return <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current', className)} {...props}><span aria-hidden="true">✓</span></CheckboxPrimitive.Indicator>
}
