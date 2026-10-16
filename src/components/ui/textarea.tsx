import { forwardRef, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('control w-full', className)} {...props} />
})
Textarea.displayName = 'Textarea'
