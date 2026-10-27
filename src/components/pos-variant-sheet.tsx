import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Spinner } from './ui'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import { formatMoney } from '../lib/pos'
import { uomOptionLabel } from '../lib/pos-catalog'
import type { CachedItem, ItemPrice, ItemUom, PosCartLine } from '../lib/types'

function itemUoms(item: CachedItem): ItemUom[] {
  const values = [{ uom: item.stock_uom || '', conversion_factor: 1 }, ...(item.uoms ?? [])]
  return values.filter((uom, index, all) => uom.uom && all.findIndex((candidate) => candidate.uom === uom.uom) === index)
}

function priceFor(item: CachedItem, uom: string, prices: ItemPrice[], priceList?: string) {
  const matches = prices.filter((price) => [item.name, item.item_code].includes(price.item_code) && price.selling && (!priceList || price.price_list === priceList))
  const exact = matches.find((price) => (price.uom || item.stock_uom) === uom)
  if (exact) { const rate = Number(exact.price_list_rate ?? 0); return rate > 0 ? rate : null }
  if (uom === item.stock_uom) { const rate = Number(matches.find((price) => !price.uom)?.price_list_rate ?? matches[0]?.price_list_rate ?? 0); return rate > 0 ? rate : null }
  return null
}

function variantDescription(item: CachedItem) {
  return item.attributes?.map((attribute) => `${attribute.attribute}: ${attribute.attribute_value}`).join(' · ') || item.name
}

export function PosVariantSheet({ template, variants, prices, priceList, currency, cartLines, open, loading, error, onClose, onAdd, onMissingPrice, resolvePrice }: { template: CachedItem | null; variants: CachedItem[]; prices: ItemPrice[]; priceList?: string; currency: string; cartLines: PosCartLine[]; open: boolean; loading?: boolean; error?: string; onClose: () => void; onAdd: (item: CachedItem, uom: ItemUom, rate: number) => void; onMissingPrice?: (item: CachedItem, uom: ItemUom) => void; resolvePrice?: (item: CachedItem, uom: ItemUom) => Promise<number | null> }) {
  const { t } = useTranslation()
  const [selectedName, setSelectedName] = useState('')
  const [selectedUom, setSelectedUom] = useState('')
  const [variantSearch, setVariantSearch] = useState('')
  const selected = variants.find((item) => item.name === selectedName) ?? variants[0]
  const cartItemCodes = useMemo(() => new Set(cartLines.filter((line) => line.qty > 0).map((line) => line.itemCode)), [cartLines])
  const uoms = useMemo(() => selected ? itemUoms(selected) : [], [selected])
  const selectedUomRow = uoms.find((uom) => uom.uom === selectedUom) ?? uoms[0]
  const price = selected && selectedUomRow ? priceFor(selected, selectedUomRow.uom, prices, priceList) : null
  const [resolvedPrice, setResolvedPrice] = useState<number | null | undefined>(undefined)
  const effectivePrice = price ?? resolvedPrice ?? null
  const filteredVariants = useMemo(() => {
    const term = variantSearch.trim().toLocaleLowerCase()
    if (!term) return variants
    return variants.filter((item) => `${item.item_name} ${item.name} ${variantDescription(item)} ${item.brand ?? ''}`.toLocaleLowerCase().includes(term))
  }, [variantSearch, variants])

  useEffect(() => {
    if (!open) return
    setSelectedName(variants[0]?.name ?? '')
    setVariantSearch('')
  }, [open, variants])

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

  return <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }}>
    <SheetContent side="bottom" className="pos-variant-sheet mx-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl">
      <SheetHeader className="pos-sheet-heading"><div><span className="pos-sheet-kicker">{t('pos.variant.configure')}</span><SheetTitle>{template.item_name || template.name}</SheetTitle><SheetDescription>{t('pos.variant.description')}</SheetDescription></div><SheetClose asChild><Button type="button" variant="secondary" size="icon" aria-label={t('pos.variant.close')} title={t('pos.variant.close')}>×</Button></SheetClose></SheetHeader>
      {loading ? <div className="pos-sheet-loading" role="status"><Spinner /> {t('pos.variant.loading')}</div> : error ? <p className="notice notice-error" role="alert">{error}</p> : !variants.length ? <p className="muted">{t('pos.variant.empty')}</p> : <div className="pos-variant-sheet-body">
        <section className="pos-variant-picker" aria-labelledby="pos-variant-picker-title"><div className="pos-variant-section-heading"><div><h3 id="pos-variant-picker-title">{t('pos.variant.available')}</h3><span>{t('pos.variant.optionsHint', { count: variants.length })}</span></div>{selected && <span className="pos-variant-current">{t('pos.variant.selected')}</span>}</div><Command shouldFilter={false} className="pos-variant-command"><CommandInput value={variantSearch} onValueChange={setVariantSearch} placeholder={t('pos.variant.searchPlaceholder')} aria-label={t('pos.variant.searchLabel')} /><CommandList><CommandEmpty>{t('pos.variant.noMatches')}</CommandEmpty><CommandGroup heading={t('pos.variant.results')}><div className="pos-variant-list">{filteredVariants.map((item) => { const isSelected = item.name === selected?.name; const isInCart = cartItemCodes.has(item.name); return <CommandItem key={item.name} value={item.name} onSelect={() => setSelectedName(item.name)} aria-selected={isSelected} className={`pos-variant-option${isSelected ? ' is-selected' : ''}${isInCart ? ' is-in-cart' : ''}`}><span className="pos-variant-option-main"><strong>{item.item_name || item.name}</strong><small>{variantDescription(item)}</small></span><span className="pos-variant-option-meta">{item.brand || t('pos.product.noBrand')}{Number(item.weight_per_unit ?? 0) > 0 ? ` · ${item.weight_per_unit} ${item.weight_uom || ''}` : ''}</span></CommandItem> })}</div></CommandGroup></CommandList></Command></section>
        {selected && <section className="pos-variant-config" aria-label={t('pos.variant.configuration')}><div className="pos-variant-selected"><span>{t('pos.variant.chosen')}</span><strong>{selected.item_name || selected.name}</strong><small>{selected.name}</small></div><div className="pos-variant-selection"><label className="field"><span className="field-label">{t('pos.variant.saleUom')}</span><Select value={selectedUomRow?.uom ?? ''} onValueChange={setSelectedUom}><SelectTrigger aria-label={t('pos.variant.saleUom')}><SelectValue placeholder={t('pos.variant.selectUom')} /></SelectTrigger><SelectContent>{uoms.map((uom) => <SelectItem key={uom.uom} value={uom.uom}>{uomOptionLabel(selected, uom)}</SelectItem>)}</SelectContent></Select></label><div className="pos-variant-price" aria-live="polite"><span>{t('pos.customPrice.salePrice')}</span><strong className={effectivePrice === null ? 'pos-product-price-missing' : ''}>{effectivePrice === null ? (pricePending ? t('pos.variant.checkingPrice') : t('pos.variant.noPriceForUom')) : formatMoney(effectivePrice, currency)}</strong></div></div></section>}
        <div className="pos-variant-actions"><SheetClose asChild><Button type="button" variant="secondary" fullWidth>{t('common.close')}</Button></SheetClose><Button type="button" fullWidth onClick={() => selected && selectedUomRow && (effectivePrice === null ? onMissingPrice?.(selected, selectedUomRow) : onAdd(selected, selectedUomRow, effectivePrice))} disabled={!selected || !selectedUomRow || pricePending}>{effectivePrice === null && !pricePending ? t('pos.variant.addPrice') : t('pos.variant.addToCart')}</Button></div>
      </div>}
    </SheetContent>
  </Sheet>
}
