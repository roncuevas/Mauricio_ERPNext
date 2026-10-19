import { useEffect, useMemo, useState } from 'react'
import { Button, Spinner } from './ui'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import { formatMoney } from '../lib/pos'
import { defaultUom, uomOptionLabel } from '../lib/pos-catalog'
import type { CachedItem, ItemPrice, ItemUom } from '../lib/types'

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

export function PosVariantSheet({ template, variants, prices, priceList, currency, open, loading, error, onClose, onAdd, onMissingPrice, resolvePrice }: { template: CachedItem | null; variants: CachedItem[]; prices: ItemPrice[]; priceList?: string; currency: string; open: boolean; loading?: boolean; error?: string; onClose: () => void; onAdd: (item: CachedItem, uom: ItemUom, rate: number) => void; onMissingPrice?: (item: CachedItem, uom: ItemUom) => void; resolvePrice?: (item: CachedItem, uom: ItemUom) => Promise<number | null> }) {
  const [selectedName, setSelectedName] = useState('')
  const [selectedUom, setSelectedUom] = useState('')
  const [variantSearch, setVariantSearch] = useState('')
  const selected = variants.find((item) => item.name === selectedName) ?? variants[0]
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
      <SheetHeader className="pos-sheet-heading"><div><span className="pos-sheet-kicker">Configurar venta</span><SheetTitle>{template.item_name || template.name}</SheetTitle><SheetDescription>Elige una variante, presentación y precio antes de agregarla al carrito.</SheetDescription></div><SheetClose asChild><Button type="button" variant="secondary" size="icon" aria-label="Cerrar selección de variante" title="Cerrar selección de variante">×</Button></SheetClose></SheetHeader>
      {loading ? <div className="pos-sheet-loading" role="status"><Spinner /> Cargando variantes</div> : error ? <p className="notice notice-error" role="alert">{error}</p> : !variants.length ? <p className="muted">Esta plantilla no tiene variantes activas disponibles.</p> : <div className="pos-variant-sheet-body">
        <section className="pos-variant-picker" aria-labelledby="pos-variant-picker-title"><div className="pos-variant-section-heading"><div><h3 id="pos-variant-picker-title">Variantes disponibles</h3><span>{variants.length} opciones · usa búsqueda o teclado</span></div>{selected && <span className="pos-variant-current">Seleccionada</span>}</div><Command shouldFilter={false} className="pos-variant-command"><CommandInput value={variantSearch} onValueChange={setVariantSearch} placeholder="Buscar por nombre, SKU, atributo o marca..." aria-label="Buscar variante" /><CommandList><CommandEmpty>No hay variantes que coincidan.</CommandEmpty><CommandGroup heading="Resultados"><div className="pos-variant-list">{filteredVariants.map((item) => <CommandItem key={item.name} value={item.name} onSelect={() => setSelectedName(item.name)} aria-selected={item.name === selected?.name} className={item.name === selected?.name ? 'is-selected' : ''}><span className="pos-variant-option-main"><strong>{item.item_name || item.name}</strong><small>{variantDescription(item)}</small></span><span className="pos-variant-option-meta">{item.brand || 'Sin marca'}{Number(item.weight_per_unit ?? 0) > 0 ? ` · ${item.weight_per_unit} ${item.weight_uom || ''}` : ''}</span></CommandItem>)}</div></CommandGroup></CommandList></Command></section>
        {selected && <section className="pos-variant-config" aria-label="Configuración de variante"><div className="pos-variant-selected"><span>Variante elegida</span><strong>{selected.item_name || selected.name}</strong><small>{selected.name}</small></div><div className="pos-variant-selection"><label className="field"><span className="field-label">UOM de venta</span><Select value={selectedUomRow?.uom ?? ''} onValueChange={setSelectedUom}><SelectTrigger aria-label="UOM de venta"><SelectValue placeholder="Selecciona UOM" /></SelectTrigger><SelectContent>{uoms.map((uom) => <SelectItem key={uom.uom} value={uom.uom}>{uomOptionLabel(selected, uom)}</SelectItem>)}</SelectContent></Select></label><div className="pos-variant-price" aria-live="polite"><span>Precio de venta</span><strong className={effectivePrice === null ? 'pos-product-price-missing' : ''}>{effectivePrice === null ? (pricePending ? 'Consultando precio…' : 'Sin precio para esta UOM') : formatMoney(effectivePrice, currency)}</strong></div></div></section>}
        <div className="pos-variant-actions"><SheetClose asChild><Button type="button" variant="secondary" fullWidth>Cerrar</Button></SheetClose><Button type="button" fullWidth onClick={() => selected && selectedUomRow && (effectivePrice === null ? onMissingPrice?.(selected, selectedUomRow) : onAdd(selected, selectedUomRow, effectivePrice))} disabled={!selected || !selectedUomRow || pricePending}>{effectivePrice === null && !pricePending ? 'Agregar precio' : 'Agregar al carrito'}</Button></div>
      </div>}
    </SheetContent>
  </Sheet>
}
