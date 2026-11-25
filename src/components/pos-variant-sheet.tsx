import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Check, Search } from 'lucide-react'
import { Button, SearchInput, Spinner } from './ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { formatMoney } from '../lib/pos'
import { isAvailableForSale, posPriceForUom, stockLevel, uomOptionLabel, variantDisplay } from '../lib/pos-catalog'
import { rankProductSearch } from '../lib/search'
import type { CachedItem, ItemPrice, ItemUom, PosCartLine } from '../lib/types'

/** Search only pays for itself once the list no longer fits at a glance. */
const SEARCH_THRESHOLD = 6
/** Up to this many UOMs read better as a segmented control than as a dropdown. */
const SEGMENTED_UOM_LIMIT = 4

function itemUoms(item: CachedItem): ItemUom[] {
  const values = [{ uom: item.stock_uom || '', conversion_factor: 1 }, ...(item.uoms ?? [])]
  return values.filter((uom, index, all) => uom.uom && all.findIndex((candidate) => candidate.uom === uom.uom) === index)
}

export function PosVariantSheet({ template, variants: allVariants, hideUnavailable = false, prices, priceList, currency, cartLines, open, loading, error, onClose, onAdd, onMissingPrice, resolvePrice }: { template: CachedItem | null; variants: CachedItem[]; hideUnavailable?: boolean; prices: ItemPrice[]; priceList?: string; currency: string; cartLines: PosCartLine[]; open: boolean; loading?: boolean; error?: string; onClose: () => void; onAdd: (item: CachedItem, uom: ItemUom, rate: number) => void; onMissingPrice?: (item: CachedItem, uom: ItemUom) => void; resolvePrice?: (item: CachedItem, uom: ItemUom) => Promise<number | null> }) {
  const { t } = useTranslation()
  const variants = useMemo(() => allVariants.filter((item) => isAvailableForSale(item, hideUnavailable)), [allVariants, hideUnavailable])
  const [selectedName, setSelectedName] = useState('')
  const [selectedUom, setSelectedUom] = useState('')
  const [variantSearch, setVariantSearch] = useState('')
  const sortedVariants = useMemo(() => {
    if (!template) return variants
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    return [...variants].sort((left, right) => collator.compare(variantDisplay(template, left).label, variantDisplay(template, right).label))
  }, [template, variants])
  const filteredVariants = useMemo(() => variantSearch.trim() ? rankProductSearch(variants, variantSearch) : sortedVariants, [sortedVariants, variantSearch, variants])
  const selected = variants.find((item) => item.name === selectedName) ?? sortedVariants[0]
  const cartItemCodes = useMemo(() => new Set(cartLines.filter((line) => line.qty > 0).map((line) => line.itemCode)), [cartLines])
  const uoms = useMemo(() => selected ? itemUoms(selected) : [], [selected])
  const selectedUomRow = uoms.find((uom) => uom.uom === selectedUom) ?? uoms[0]
  const price = selected && selectedUomRow ? posPriceForUom(selected, selectedUomRow, prices, priceList) : null
  const [resolvedPrice, setResolvedPrice] = useState<number | null | undefined>(undefined)
  const effectivePrice = price ?? resolvedPrice ?? null

  useEffect(() => {
    if (!open) return
    setSelectedName(sortedVariants[0]?.name ?? '')
    setVariantSearch('')
  }, [open, sortedVariants])

  useEffect(() => { setSelectedUom(uoms.find((uom) => uom.uom === selected?.sales_uom)?.uom ?? uoms[0]?.uom ?? '') }, [selectedName, selected?.sales_uom, uoms])

  useEffect(() => {
    let active = true
    setResolvedPrice(undefined)
    if (price !== null || !selected || !selectedUomRow || !resolvePrice) return () => { active = false }
    resolvePrice(selected, selectedUomRow).then((next) => { if (active) setResolvedPrice(next) }).catch(() => { if (active) setResolvedPrice(null) })
    return () => { active = false }
  }, [price, resolvePrice, selected, selectedUomRow])

  if (!template) return null
  const pricePending = price === null && Boolean(resolvePrice) && resolvedPrice === undefined

  const conversionLabel = (uom: ItemUom) => uom.uom === selected?.stock_uom ? '' : `${uom.conversion_factor} ${selected?.stock_uom ?? ''}`.trim()

  return <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }}>
    <SheetContent side="bottom" className="pos-variant-sheet mx-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl">
      <SheetHeader className="pos-sheet-heading"><SheetTitle>{template.item_name || template.name}</SheetTitle><SheetDescription className="sr-only">{t('pos.variant.description')}</SheetDescription></SheetHeader>
      {loading ? <div className="pos-sheet-loading" role="status"><Spinner /> {t('pos.variant.loading')}</div> : error ? <p className="notice notice-error" role="alert">{error}</p> : !variants.length ? <p className="muted">{t('pos.variant.empty')}</p> : <div className="pos-variant-sheet-body">
        <section className="pos-variant-picker" aria-labelledby="pos-variant-picker-title">
          <h3 id="pos-variant-picker-title" className="pos-variant-heading">{t('pos.variant.heading', { count: variants.length })}</h3>
          {variants.length > SEARCH_THRESHOLD && <label className="pos-variant-search"><Search aria-hidden="true" /><SearchInput type="search" value={variantSearch} onChange={(event) => setVariantSearch(event.target.value)} onClear={() => setVariantSearch('')} placeholder={t('pos.variant.searchPlaceholder')} aria-label={t('pos.variant.searchLabel')} /></label>}
          {filteredVariants.length ? <RadioGroupPrimitive.Root value={selected?.name ?? ''} onValueChange={setSelectedName} aria-labelledby="pos-variant-picker-title" className="pos-variant-list">{filteredVariants.map((item) => {
            const { label, details } = variantDisplay(template, item)
            const rowUoms = itemUoms(item)
            const rowUom = rowUoms.find((uom) => uom.uom === item.sales_uom) ?? rowUoms[0]
            const rowPrice = rowUom ? posPriceForUom(item, rowUom, prices, priceList) : null
            const level = stockLevel(item)
            return <RadioGroupPrimitive.Item key={item.name} value={item.name} className="pos-variant-option" title={item.item_name || item.name}>
              <span className="pos-variant-check" aria-hidden="true"><RadioGroupPrimitive.Indicator><Check /></RadioGroupPrimitive.Indicator></span>
              <span className="pos-variant-option-main"><strong>{label}</strong>{details.length > 0 && <small>{details.join(' · ')}</small>}{level !== 'unknown' && <small className="pos-product-stock" data-level={level}>{level === 'out' ? t('pos.product.outOfStock', { qty: Number(item.available_qty ?? 0) }) : t('pos.product.inStock', { qty: Number(item.available_qty ?? 0) })}</small>}</span>
              {cartItemCodes.has(item.name) && <span className="pos-variant-in-cart">{t('pos.variant.inCart')}</span>}
              <span className="pos-variant-option-price">{rowPrice === null ? '—' : formatMoney(rowPrice, currency)}{rowPrice !== null && rowUoms.length > 1 && <small> / {rowUom?.uom}</small>}</span>
            </RadioGroupPrimitive.Item>
          })}</RadioGroupPrimitive.Root> : <p className="muted">{t('pos.variant.noMatches')}</p>}
        </section>
        {selected && <section className="pos-variant-config" aria-label={t('pos.variant.configuration')}>
          {uoms.length > 1 && <div className="pos-variant-uom"><span id="pos-variant-uom-label" className="field-label">{t('pos.variant.saleUom')}</span>{uoms.length <= SEGMENTED_UOM_LIMIT ? <ToggleGroup type="single" value={selectedUomRow?.uom ?? ''} onValueChange={(value) => { if (value) setSelectedUom(value) }} aria-labelledby="pos-variant-uom-label" className="pos-variant-uom-options">{uoms.map((uom) => <ToggleGroupItem key={uom.uom} value={uom.uom} className="pos-variant-uom-option">{uom.uom}{conversionLabel(uom) && <small>{conversionLabel(uom)}</small>}</ToggleGroupItem>)}</ToggleGroup> : <Select value={selectedUomRow?.uom ?? ''} onValueChange={setSelectedUom}><SelectTrigger aria-labelledby="pos-variant-uom-label"><SelectValue placeholder={t('pos.variant.selectUom')} /></SelectTrigger><SelectContent>{uoms.map((uom) => <SelectItem key={uom.uom} value={uom.uom}>{uomOptionLabel(selected, uom)}</SelectItem>)}</SelectContent></Select>}</div>}
          <div className="pos-variant-price" aria-live="polite"><span>{t('pos.customPrice.salePrice')}{selectedUomRow ? ` · ${selectedUomRow.uom}` : ''}</span><strong className={effectivePrice === null ? 'pos-product-price-missing' : ''}>{effectivePrice === null ? (pricePending ? t('pos.variant.checkingPrice') : t('pos.variant.noPriceForUom')) : formatMoney(effectivePrice, currency)}</strong></div>
        </section>}
        <div className="pos-variant-actions"><SheetClose asChild><Button type="button" variant="secondary" fullWidth>{t('common.close')}</Button></SheetClose><Button type="button" fullWidth onClick={() => selected && selectedUomRow && (effectivePrice === null ? onMissingPrice?.(selected, selectedUomRow) : onAdd(selected, selectedUomRow, effectivePrice))} disabled={!selected || !selectedUomRow || pricePending}>{effectivePrice === null && !pricePending ? t('pos.variant.addPrice') : t('pos.variant.addToCart')}</Button></div>
      </div>}
    </SheetContent>
  </Sheet>
}
