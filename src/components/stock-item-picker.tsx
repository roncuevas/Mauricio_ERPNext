import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ScanBarcode } from 'lucide-react'
import { Input } from './ui'
import { Field, FieldDescription, FieldLabel } from './ui/field'
import { findExactItem, searchReconciliationItems } from '../lib/stock'
import type { VariantItem } from '../lib/types'

const MAX_MATCHES = 6

/** Search-or-scan product picker: Enter adds the exact code/barcode match, otherwise the best ranked result. */
export function StockItemPicker({ id, items, disabled, hint, action, describe, onAdd }: { id: string; items: VariantItem[]; disabled?: boolean; hint: string; action?: ReactNode; describe: (item: VariantItem) => ReactNode; onAdd: (itemCode: string) => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const matches = useMemo(() => search.trim() ? searchReconciliationItems(items, search).slice(0, MAX_MATCHES) : [], [items, search])
  const add = (itemCode: string) => { setSearch(''); onAdd(itemCode) }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const item = findExactItem(items, search) ?? matches[0]
    if (item) add(item.name)
  }

  return <>
    <Field>
      <FieldLabel htmlFor={id}>{t('stockPage.searchProduct')}</FieldLabel>
      <div className="reconciliation-search">
        <ScanBarcode aria-hidden="true" />
        <Input id={id} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={onKeyDown} placeholder={t('stockPage.scanPlaceholder')} disabled={disabled} autoComplete="off" />
        {action}
      </div>
      <FieldDescription>{hint}</FieldDescription>
    </Field>
    {matches.length > 0 && <ul className="reconciliation-matches" aria-label={t('stockPage.matches')}>
      {matches.map((item) => <li key={item.name}><button type="button" onClick={() => add(item.name)}><span><strong>{item.item_name || item.name}</strong><small>{item.name} · {item.stock_uom || t('stockPage.noUom')}</small></span><span className="reconciliation-match-qty">{describe(item)}</span></button></li>)}
    </ul>}
  </>
}
