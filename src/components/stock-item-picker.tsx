import { useMemo, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { ScanBarcode } from 'lucide-react'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { Field, FieldDescription, FieldLabel } from './ui/field'
import { InputGroup, InputGroupAddon } from './ui/input-group'
import { Kbd } from './ui/kbd'
import { SearchClearButton } from './ui/search-input'
import { findExactItem, searchReconciliationItems } from '../lib/stock'
import type { VariantItem } from '../lib/types'

const MAX_MATCHES = 6

function rankedMatches(items: VariantItem[], search: string) {
  if (!search.trim()) return []
  const exact = findExactItem(items, search)
  const ranked = searchReconciliationItems(items, search).filter((item) => item !== exact)
  return (exact ? [exact, ...ranked] : ranked).slice(0, MAX_MATCHES)
}

/**
 * Search-or-scan product picker on shadcn Command: arrows move through matches, Enter adds the highlighted one
 * (an exact code or barcode match is always first, so a scanner followed by Enter adds the right product).
 */
export function StockItemPicker({ id, items, disabled, hint, action, describe, onAdd, inputRef }: { id: string; items: VariantItem[]; disabled?: boolean; hint: string; action?: ReactNode; describe: (item: VariantItem) => ReactNode; onAdd: (itemCode: string) => void; inputRef?: RefObject<HTMLInputElement | null> }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState(''); const [active, setActive] = useState('')
  const matches = useMemo(() => rankedMatches(items, search), [items, search])
  const add = (itemCode: string) => { setSearch(''); setActive(''); onAdd(itemCode) }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && search) { event.preventDefault(); setSearch(''); return }
    if (event.key !== 'Enter') return
    // Handled here (not by cmdk) so a fast scanner never selects a stale highlighted row.
    event.preventDefault()
    const item = matches.find((match) => match.name === active) ?? matches[0]
    if (item) add(item.name)
  }

  return <Field>
    <FieldLabel htmlFor={id}>{t('stockPage.searchProduct')}</FieldLabel>
    <Command shouldFilter={false} value={active} onValueChange={setActive} className="stock-picker" label={t('stockPage.searchProduct')}>
      <div className="stock-picker-row">
        <InputGroup data-disabled={disabled || undefined}>
          <InputGroupAddon><ScanBarcode aria-hidden="true" /></InputGroupAddon>
          <CommandInput ref={inputRef} id={id} data-slot="input-group-control" className="mb-0 h-full min-h-0 flex-1 rounded-none border-0 bg-transparent px-0 shadow-none focus:shadow-none" value={search} onValueChange={(value) => { setSearch(value); setActive('') }} onKeyDown={onKeyDown} placeholder={t('stockPage.scanPlaceholder')} disabled={disabled} autoComplete="off" />
          {search && !disabled && <InputGroupAddon align="inline-end"><Kbd>Enter</Kbd><SearchClearButton onClear={() => { setSearch(''); setActive('') }} /></InputGroupAddon>}
        </InputGroup>
        {action}
      </div>
      {matches.length > 0 && <CommandList className="stock-picker-list">
        <CommandGroup heading={t('stockPage.matches')}>
          {matches.map((item) => <CommandItem key={item.name} value={item.name} onSelect={() => add(item.name)} className="stock-picker-item">
            <span className="product-cell"><strong>{item.item_name || item.name}</strong><small>{item.name} · {item.stock_uom || t('stockPage.noUom')}</small></span>
            <span className="stock-picker-meta">{describe(item)}</span>
          </CommandItem>)}
        </CommandGroup>
      </CommandList>}
    </Command>
    <FieldDescription>{hint}</FieldDescription>
  </Field>
}
