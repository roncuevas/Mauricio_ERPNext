import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from './ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { cn } from '../lib/utils'
import { filterEntityOptions } from './entity-combobox-utils'

export type EntityComboboxOption = {
  value: string
  label: string
  searchText?: string
  disabled?: boolean
  depth?: number
  meta?: ReactNode
}

type EntityComboboxProps = {
  value?: string
  onValueChange: (value: string) => void
  options: EntityComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  ariaLabel: string
  disabled?: boolean
  loading?: boolean
  className?: string
  allowClear?: boolean
  clearLabel?: string
}

export function EntityCombobox({ value = '', onValueChange, options, placeholder = 'Selecciona una opción', searchPlaceholder = 'Buscar…', emptyMessage = 'No hay coincidencias.', ariaLabel, disabled = false, loading = false, className, allowClear = false, clearLabel = 'Sin selección' }: EntityComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = options.find((option) => option.value === value)
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredOptions = useMemo(() => filterEntityOptions(options, normalizedSearch), [normalizedSearch, options])

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="secondary" className={cn('entity-combobox-trigger control flex w-full items-center justify-between gap-2 text-left font-normal', !selected && 'text-[var(--color-muted)]', className)} disabled={disabled || loading} aria-label={ariaLabel} aria-expanded={open} role="combobox">
        <span className="min-w-0 truncate">{loading ? 'Cargando…' : selected?.label || placeholder}</span>
        <span aria-hidden="true" className="shrink-0 text-xs">⌄</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="entity-combobox-content w-[var(--radix-popover-trigger-width)] min-w-56 p-1">
      <Command shouldFilter={false}>
        <CommandInput value={search} onValueChange={setSearch} placeholder={searchPlaceholder} aria-label={`${searchPlaceholder} (${ariaLabel})`} />
        <CommandList>
          <CommandEmpty>{emptyMessage}</CommandEmpty>
          <CommandGroup>
            {allowClear && <CommandItem value="__clear__" onSelect={() => { onValueChange(''); setOpen(false) }}>{clearLabel}</CommandItem>}
            {filteredOptions.map((option) => <CommandItem key={option.value} value={option.value} disabled={option.disabled} aria-selected={option.value === value} onSelect={() => { onValueChange(option.value); setOpen(false) }}>
              <span className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingLeft: `${(option.depth ?? 0) * 12}px` }}><span className="min-w-0 truncate">{option.label}</span>{option.meta && <span className="shrink-0 text-xs text-[var(--color-muted)]">{option.meta}</span>}</span>
              {option.value === value && <span aria-hidden="true" className="ml-auto pl-2 text-[var(--color-primary)]">✓</span>}
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
