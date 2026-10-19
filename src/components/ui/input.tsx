import { forwardRef, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} data-slot="input" className={cn('control w-full', className)} {...props} />
})
Input.displayName = 'Input'
