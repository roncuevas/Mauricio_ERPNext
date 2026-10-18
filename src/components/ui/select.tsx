import * as SelectPrimitive from '@radix-ui/react-select'
import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { EntityCombobox } from '../entity-combobox'

type SelectProps = ComponentProps<typeof SelectPrimitive.Root> & { searchable?: boolean }
type SelectOption = { value: string; label: string }
type ElementProps = { children?: ReactNode; value?: unknown; placeholder?: string; 'aria-label'?: string }

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!isValidElement(node)) return ''
  return textContent((node.props as ElementProps).children)
}

function collectOptions(node: ReactNode, options: SelectOption[] = []) {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return
    if (child.type === SelectItem) {
      const childProps = child.props as ElementProps
      const value = String(childProps.value ?? '')
      if (value) options.push({ value, label: textContent(childProps.children) || value })
      return
    }
    collectOptions((child.props as ElementProps).children, options)
  })
  return options
}

export function Select({ searchable = false, children, value, defaultValue, onValueChange, disabled, ...props }: SelectProps) {
  const trigger = Children.toArray(children).find((child) => isValidElement(child) && child.type === SelectTrigger)
  const content = Children.toArray(children).find((child) => isValidElement(child) && child.type === SelectContent)
  const options = collectOptions(content && isValidElement(content) ? (content.props as ElementProps).children : null)
  const shouldSearch = searchable || options.length > 8
  if (shouldSearch && options.length > 0) {
    const triggerProps = trigger && isValidElement(trigger) ? trigger.props as ElementProps : {}
    const valuePlaceholder = Children.toArray(triggerProps.children).find((child) => isValidElement(child) && child.type === SelectValue)
    const placeholder = valuePlaceholder && isValidElement(valuePlaceholder) ? (valuePlaceholder.props as ElementProps).placeholder : undefined
    return <EntityCombobox ariaLabel={String(triggerProps['aria-label'] ?? 'Seleccionar opción')} value={typeof value === 'string' ? value : typeof defaultValue === 'string' ? defaultValue : ''} onValueChange={onValueChange ?? (() => undefined)} options={options} placeholder={placeholder || 'Selecciona una opción'} disabled={Boolean(disabled)} allowClear={false} />
  }
  return <SelectPrimitive.Root {...props} value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled}>{children}</SelectPrimitive.Root>
}

export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value
export const SelectLabel = SelectPrimitive.Label
export const SelectSeparator = SelectPrimitive.Separator
export const SelectItem = ({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) => <SelectPrimitive.Item className={cn('relative flex w-full cursor-default select-none items-center rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-[var(--color-primary-soft)] data-[highlighted]:text-[var(--color-primary-hover)]', className)} {...props}><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>
export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) { return <SelectPrimitive.Trigger className={cn('control ui-select-trigger flex w-full items-center justify-between gap-2 text-left', className)} {...props}>{children}<svg aria-hidden="true" className="ui-select-chevron" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg></SelectPrimitive.Trigger> }
export function SelectContent({ className, children, position = 'popper', ...props }: ComponentProps<typeof SelectPrimitive.Content>) { return <SelectPrimitive.Portal><SelectPrimitive.Content position={position} className={cn('z-50 max-h-80 min-w-[8rem] overflow-y-auto rounded-lg border bg-[var(--color-surface)] p-1 text-[var(--color-heading)] shadow-[var(--shadow-card)]', className)} {...props}>{children}</SelectPrimitive.Content></SelectPrimitive.Portal> }
