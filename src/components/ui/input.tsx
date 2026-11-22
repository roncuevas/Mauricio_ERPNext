import { forwardRef, type ComponentProps, type WheelEvent } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function Input({ className, onWheel, ...props }, ref) {
  // Browsers step a focused number input on wheel; blur it so scrolling the page never edits a quantity or price.
  const handleWheel = (event: WheelEvent<HTMLInputElement>) => {
    if (props.type === 'number' && document.activeElement === event.currentTarget) event.currentTarget.blur()
    onWheel?.(event)
  }
  return <input ref={ref} data-slot="input" className={cn('control w-full', className)} onWheel={handleWheel} {...props} />
})
Input.displayName = 'Input'
