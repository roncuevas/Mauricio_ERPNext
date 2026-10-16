import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { cn } from '@/lib/utils'

export const RadioGroup = RadioGroupPrimitive.Root

export function RadioGroupItem({ className, ...props }: RadioGroupPrimitive.RadioGroupItemProps) {
  return <RadioGroupPrimitive.Item className={cn('inline-flex h-4 w-4 shrink-0 rounded-full border border-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] data-[state=checked]:border-[var(--color-primary)]', className)} {...props}><RadioGroupPrimitive.Indicator className="flex items-center justify-center"><span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" /></RadioGroupPrimitive.Indicator></RadioGroupPrimitive.Item>
}
