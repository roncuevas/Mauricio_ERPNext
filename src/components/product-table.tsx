import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { Button, IconButton } from './ui'
import { TooltipProvider, WithTooltip } from './ui/tooltip'
import type { FamilyExpansion } from './use-family-expansion'
import type { ProductFamily, ProductFamilyIndex } from '../lib/product-list'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { calculateGrossMargin } from '../lib/pricing'
import { VirtualizedCollection } from './virtualized-collection'
import { clampProductTableWidth, defaultProductTableConfig, PRODUCT_TABLE_COLUMN_IDS, PRODUCT_TABLE_INITIAL_WIDTHS, PRODUCT_TABLE_WIDTH_LIMITS, readProductTableConfig, writeProductTableConfig, type ProductTableColumnId, type ProductTableConfig } from '../lib/product-table-config'
import type { CachedItem, ItemPrice, VariantItem } from '../lib/types'
import { ProductImage } from './product-image'
import type { createErpNextClient } from '../lib/erpnext'

type ItemPriceSummary = { purchase: ItemPrice | null; sale: ItemPrice | null }
/** One rendered row: a family's head (template or standalone product) or one of its variants. */
type ProductRow = { item: CachedItem; family?: ProductFamily }
type RowContext = { item: CachedItem; family?: ProductFamily; prices: ItemPriceSummary; variant?: VariantItem; onOpen: () => void; onUom: () => void }
// Columns that read a separate cache declare it so the picker can explain why they are unavailable.
type ColumnSource = 'prices' | 'uoms'
// `isEmpty` lets phone cards skip a field that would only show "—".
type Column = { id: ProductTableColumnId; label: string; mobilePriority: number; render: (context: RowContext) => ReactNode; source?: ColumnSource; isEmpty?: (context: RowContext) => boolean }

// Index prices once per render instead of filtering every price for each cell.
function summarizePrices(prices: ItemPrice[]) {
  const byCode = new Map<string, ItemPrice[]>()
  for (const price of prices) {
    const code = String(price.item_code ?? '')
    if (!code) continue
    const list = byCode.get(code)
    if (list) list.push(price); else byCode.set(code, [price])
  }
  return (item: CachedItem): ItemPriceSummary => {
    const codes = Array.from(new Set([String(item.name), String(item.item_code ?? '')]))
    const matching = codes.flatMap((code) => byCode.get(code) ?? [])
    let purchase: ItemPrice | null = null
    let sale: ItemPrice | null = null
    for (const price of matching) {
      const rate = Number(price.price_list_rate ?? 0)
      if (price.buying && (!purchase || rate < Number(purchase.price_list_rate ?? 0))) purchase = price
      if (price.selling && (!sale || rate > Number(sale.price_list_rate ?? 0))) sale = price
    }
    return { purchase, sale }
  }
}

function formatFactor(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 4 }).format(value)
}

function money(price: ItemPrice | null, locale: string, noCache: string) {
  if (!price) return noCache
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: price.currency || 'MXN', maximumFractionDigits: 2 }).format(Number(price.price_list_rate ?? 0))
}

function conversionsOf(item: CachedItem, variant?: VariantItem) {
  const uoms = variant?.uoms?.length ? variant.uoms : item.uoms ?? []
  const stockUom = String(item.stock_uom ?? variant?.stock_uom ?? uoms[0]?.uom ?? '')
  return { stockUom, conversions: uoms.filter((uom) => uom.uom && uom.uom !== stockUom) }
}

function comparableMargin({ purchase, sale }: ItemPriceSummary) {
  return purchase && sale && (purchase.uom || '') === (sale.uom || '') ? calculateGrossMargin(sale, purchase) : null
}

const blank = (value: unknown) => value === undefined || value === null || value === ''

function text(value: unknown) { return value === undefined || value === null || value === '' ? '—' : String(value) }

function compactValue(value: ReactNode) { return <span className="product-table-compact-value">{value}</span> }

function PriceCell({ price, detail, locale, empty }: { price: ItemPrice | null; detail?: string; locale: string; empty: string }) {
  if (!price) return <span className="product-table-empty">{empty}</span>
  return <span className="product-table-stack"><strong className="product-table-amount">{money(price, locale, empty)}</strong>{detail && <small title={detail}>{detail}</small>}</span>
}

/** Phones get a full-width toggle under the card instead of the arrow beside the name, which crowded the image. */
function MobileFamilyToggle({ row, expansion }: { row: ProductRow; expansion: FamilyExpansion }) {
  const { t } = useTranslation()
  const id = String(row.item.name)
  const open = expansion.expanded.has(id)
  const name = text(row.item.item_name ?? row.item.name)
  return <Button type="button" variant="secondary" className="product-table-mobile-family" aria-expanded={open} aria-label={t(open ? 'catalog.table.hideVariants' : 'catalog.table.showVariants', { name })} onClick={(event) => { event.stopPropagation(); expansion.toggle(id) }}>{open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}{open ? t('catalog.table.hideVariantsShort') : t('catalog.table.showVariantsCount', { count: row.family?.children.length ?? 0 })}</Button>
}

export function ProductTable({ families, expansion, familyIndex, prices, variants, profileId, onOpen, onUom, client, showImages }: { families: ProductFamily[]; expansion: FamilyExpansion; familyIndex: ProductFamilyIndex; prices: ItemPrice[]; variants: VariantItem[]; profileId: string; onOpen: (name: string) => void; onUom: (name: string) => void; client: ReturnType<typeof createErpNextClient>; showImages: boolean }) {
  const { t, i18n } = useTranslation()
  const [config, setConfig] = useState<ProductTableConfig>(() => readProductTableConfig(profileId))
  const [resizing, setResizing] = useState<ProductTableColumnId | null>(null)
  const variantByName = useMemo(() => new Map(variants.map((item) => [item.name, item])), [variants])
  const priceCacheAvailable = prices.length > 0
  const uomCacheAvailable = useMemo(() => variants.some((item) => item.uoms !== undefined), [variants])
  const priceSummary = useMemo(() => summarizePrices(prices), [prices])
  const statusVisible = config.visibleIds.includes('status')
  const sourceAvailable = (source?: ColumnSource) => source === 'prices' ? priceCacheAvailable : source === 'uoms' ? uomCacheAvailable : true

  useEffect(() => { setConfig(readProductTableConfig(profileId)) }, [profileId])
  useEffect(() => { writeProductTableConfig(profileId, config) }, [config, profileId])

  const columns = useMemo<Column[]>(() => [
    { id: 'product', label: t('catalog.table.product'), mobilePriority: 0, render: ({ item, family }) => {
      const id = String(item.name)
      const sku = text(item.item_code ?? item.name)
      const name = text(item.item_name ?? item.name)
      const kind = familyIndex.kindOf(item)
      const toggleable = Boolean(family?.children.length)
      const open = expansion.expanded.has(id)
      // Only family heads carry the marker; variant rows sit indented under their template instead.
      const marker = !family ? null : kind === 'template' ? t('catalog.table.templateVariants', { count: family.variantCount }) : kind === 'variant' ? t('catalog.table.variantOf', { name: familyIndex.parentOf(item) }) : null
      return <div className="product-table-product">
        {family && <span className="product-table-family-slot">{toggleable ? <button type="button" className="product-table-family-toggle" aria-expanded={open} aria-label={t(open ? 'catalog.table.hideVariants' : 'catalog.table.showVariants', { name })} onClick={(event) => { event.stopPropagation(); expansion.toggle(id) }}>{open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</button> : null}</span>}
        {showImages && <ProductImage client={client} profileId={profileId} item={item} className="product-table-image" previewable />}
        <div className="min-w-0"><Link to={`/items/${encodeURIComponent(id)}`} onClick={(event) => event.stopPropagation()} className="product-table-title">{name}</Link><span className="product-table-ids">{marker && <span className="product-table-family">{marker}</span>}{item.disabled && !statusVisible ? <span className="product-table-inline-status">{t('common.disabled')}</span> : null}<code title={`${t('catalog.table.sku')}: ${sku}`}>{sku}</code>{sku !== id && <code title={`${t('catalog.table.itemId')}: ${id}`}>{t('catalog.table.idValue', { id })}</code>}</span></div>
      </div>
    } },
    { id: 'group', label: t('catalog.table.group'), mobilePriority: 2, render: ({ item }) => text(item.item_group), isEmpty: ({ item }) => blank(item.item_group) },
    { id: 'brand', label: t('common.brand'), mobilePriority: 4, render: ({ item }) => text(item.brand), isEmpty: ({ item }) => blank(item.brand) },
    { id: 'stockUom', label: t('catalog.product.stockUom'), mobilePriority: 1, render: ({ item, variant }) => <span className="variant-stock-badge">{text(item.stock_uom ?? variant?.stock_uom)}</span> },
    { id: 'salesUom', label: t('catalog.product.defaultSalesUom'), mobilePriority: 5, render: ({ item }) => text(item.sales_uom), isEmpty: ({ item }) => blank(item.sales_uom) },
    { id: 'purchaseUom', label: t('catalog.product.defaultPurchaseUom'), mobilePriority: 5, render: ({ item }) => text(item.purchase_uom), isEmpty: ({ item }) => blank(item.purchase_uom) },
    { id: 'weight', label: t('catalog.table.weight'), mobilePriority: 6, render: ({ item }) => item.weight_per_unit === undefined ? '—' : `${text(item.weight_per_unit)} ${text(item.weight_uom)}`, isEmpty: ({ item }) => item.weight_per_unit === undefined },
    { id: 'conversions', label: t('catalog.product.uomConversions'), mobilePriority: 2, source: 'uoms', render: ({ item, variant }) => {
      const { stockUom, conversions } = conversionsOf(item, variant)
      if (!conversions.length) return <span className="product-table-empty">—</span>
      const labels = conversions.map((uom) => t('catalog.table.conversionValue', { uom: uom.uom, factor: formatFactor(Number(uom.conversion_factor), i18n.language), stock: stockUom }))
      return <span className="product-table-conversions" title={labels.join('\n')}><span className="product-table-chip">{labels[0]}</span>{labels.length > 1 && <span className="product-table-chip product-table-chip-more" aria-label={t('catalog.table.moreConversions', { count: labels.length - 1 })}>+{labels.length - 1}</span>}</span>
    }, isEmpty: ({ item, variant }) => conversionsOf(item, variant).conversions.length === 0 },
    { id: 'variants', label: t('navigation.variants'), mobilePriority: 3, render: ({ item, variant }) => item.has_variants ? t('catalog.table.template') : variant?.variant_of || item.variant_of ? t('catalog.table.variant') : '—', isEmpty: ({ item }) => familyIndex.kindOf(item) === 'single' },
    { id: 'barcode', label: t('catalog.table.barcode'), mobilePriority: 6, render: ({ item }) => Array.isArray(item.barcodes) && item.barcodes.length ? text(item.barcodes[0]) : '—', isEmpty: ({ item }) => !Array.isArray(item.barcodes) || !item.barcodes.length },
    { id: 'purchasePrice', label: t('catalog.table.purchasePrice'), mobilePriority: 7, source: 'prices', render: ({ prices: { purchase } }) => <PriceCell price={purchase} detail={[purchase?.supplier || purchase?.price_list, purchase?.uom].filter(Boolean).join(' · ')} locale={i18n.language} empty={t('catalog.product.noPrice')} /> },
    { id: 'salePrice', label: t('catalog.table.salePrice'), mobilePriority: 7, source: 'prices', render: ({ prices: { sale } }) => <PriceCell price={sale} detail={[sale?.price_list, sale?.uom].filter(Boolean).join(' · ')} locale={i18n.language} empty={t('catalog.product.noPrice')} /> },
    { id: 'margin', label: t('catalog.table.margin'), mobilePriority: 7, source: 'prices', render: ({ prices }) => { const { sale } = prices; const margin = comparableMargin(prices); if (!margin || !sale) return <span className="product-table-empty" title={t('catalog.product.notComparable')}><span aria-hidden="true">—</span><span className="sr-only">{t('catalog.product.notComparable')}</span></span>; return <span className="product-table-stack"><strong className={`product-table-amount ${margin.amount < 0 ? 'product-table-loss' : ''}`}>{t('catalog.table.marginPercent', { value: margin.percentage.toFixed(1) })}</strong><small>{money({ ...sale, price_list_rate: margin.amount }, i18n.language, '')}</small></span> }, isEmpty: ({ prices }) => !comparableMargin(prices) || !prices.sale },
    { id: 'status', label: t('common.status'), mobilePriority: 0, render: ({ item }) => <span className={`product-status ${item.disabled ? 'product-status-disabled' : 'product-status-active'}`}>{item.disabled ? t('common.disabled') : t('common.active')}</span> },
    { id: 'actions', label: t('catalog.table.actions'), mobilePriority: 0, render: ({ item, onOpen, onUom }) => { const name = text(item.item_name ?? item.name); return <div className="product-table-actions"><Button type="button" variant="action" size="compact" aria-label={t('catalog.table.editItem', { name })} onClick={(event) => { event.stopPropagation(); onOpen() }}>{t('catalog.table.edit')}</Button><Button type="button" variant="action" size="compact" aria-label={t('catalog.table.uomItem', { name })} onClick={(event) => { event.stopPropagation(); onUom() }}>UOM</Button></div> } },
  ], [client, expansion, familyIndex, i18n.language, profileId, showImages, statusVisible, t])

  const activeColumns = columns.filter((column) => config.visibleIds.includes(column.id) && sourceAvailable(column.source))
  const mobileDetailColumns = activeColumns.filter((column) => column.id !== 'product' && column.id !== 'status' && column.id !== 'actions').sort((a, b) => a.mobilePriority - b.mobilePriority)

  function updateConfig(next: Partial<ProductTableConfig>) { setConfig((current) => ({ ...current, ...next })) }
  function toggleColumn(id: ProductTableColumnId, checked: boolean) {
    if (id === 'product' || id === 'actions') return
    const visibleIds = checked ? [...config.visibleIds, id] : config.visibleIds.filter((current) => current !== id)
    updateConfig({ visibleIds: Array.from(new Set(visibleIds)).filter((current) => PRODUCT_TABLE_COLUMN_IDS.includes(current)) })
  }
  function reset() { setConfig(defaultProductTableConfig()) }
  function startResize(event: React.PointerEvent<HTMLDivElement>, id: ProductTableColumnId) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = config.widths[id] ?? PRODUCT_TABLE_INITIAL_WIDTHS[id]
    setResizing(id)
    const move = (moveEvent: PointerEvent) => updateConfig({ widths: { ...config.widths, [id]: clampProductTableWidth(id, startWidth + moveEvent.clientX - startX) } })
    const stop = () => { setResizing(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }
  function nudgeResize(event: React.KeyboardEvent<HTMLDivElement>, id: ProductTableColumnId) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 10 : -10
    updateConfig({ widths: { ...config.widths, [id]: clampProductTableWidth(id, (config.widths[id] ?? PRODUCT_TABLE_INITIAL_WIDTHS[id]) + delta) } })
  }

  function contextFor({ item, family }: ProductRow): RowContext { return { item, family, prices: priceSummary(item), variant: variantByName.get(item.name), onOpen: () => onOpen(String(item.name)), onUom: () => onUom(String(item.name)) } }
  const rows = families.flatMap((family): ProductRow[] => [{ item: family.item, family }, ...(expansion.expanded.has(String(family.item.name)) ? family.children.map((item) => ({ item })) : [])])
  const rowClass = (row: ProductRow) => row.family ? (row.family.matched ? '' : 'is-context') : 'is-child'
  const expandLabel = expansion.allExpanded ? t('catalog.table.collapseFamilies') : t('catalog.table.expandFamilies')

  return <>
    {/* Phones show cards, so the same choice is worded as the data each card shows. */}
    <div className="product-table-toolbar"><div className="product-table-label-desktop"><strong>{t('catalog.table.visibleColumns')}</strong><span className="muted">{t('catalog.table.optionalColumns', { count: activeColumns.length - 2 })}</span></div><div className="product-table-label-mobile"><strong>{t('catalog.table.cardFields')}</strong><span className="muted">{t('catalog.table.cardFieldsSummary', { count: mobileDetailColumns.length })}</span></div>{expansion.hasFamilies && <TooltipProvider delayDuration={200}><WithTooltip label={expandLabel}><IconButton type="button" title="" size="compact" label={expandLabel} aria-expanded={expansion.allExpanded} icon={expansion.allExpanded ? <ChevronsDownUp aria-hidden="true" /> : <ChevronsUpDown aria-hidden="true" />} onClick={expansion.toggleAll} /></WithTooltip></TooltipProvider>}<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="secondary" size="compact"><span className="product-table-label-desktop">{t('catalog.table.columns')}</span><span className="product-table-label-mobile">{t('catalog.table.cardFieldsButton')}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" collisionPadding={8} className="product-table-column-menu"><DropdownMenuLabel><span className="product-table-label-desktop">{t('catalog.table.showColumns')}</span><span className="product-table-label-mobile">{t('catalog.table.showCardFields')}</span></DropdownMenuLabel><DropdownMenuSeparator />{columns.filter((column) => column.id !== 'product' && column.id !== 'actions').map((column) => <DropdownMenuCheckboxItem key={column.id} checked={config.visibleIds.includes(column.id)} disabled={!sourceAvailable(column.source)} onCheckedChange={(checked) => toggleColumn(column.id, checked === true)}>{column.label}{!sourceAvailable(column.source) ? ` · ${t('catalog.table.noCache')}` : ''}</DropdownMenuCheckboxItem>)}<DropdownMenuSeparator /><DropdownMenuCheckboxItem checked disabled>{t('catalog.table.requiredProduct')}</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked disabled>{t('catalog.table.requiredActions')}</DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu><Button type="button" variant="secondary" size="compact" onClick={reset}><span className="product-table-label-desktop">{t('catalog.table.resetColumns')}</span><span className="product-table-label-mobile">{t('catalog.table.resetCardFields')}</span></Button></div>
    <VirtualizedCollection className="product-table-mobile" items={rows} getKey={(row) => String(row.item.name)} estimateSize={240} renderItem={(row) => { const context = contextFor(row); return <article className={`product-table-mobile-card ${rowClass(row)}`} onClick={context.onOpen}><div className="product-table-mobile-heading"><div>{columns.find((column) => column.id === 'product')?.render(context)}</div>{columns.find((column) => column.id === 'status')?.render(context)}</div>{(() => { const fields = mobileDetailColumns.filter((column) => !column.isEmpty?.(context)); return fields.length > 0 && <dl>{fields.map((column) => <div key={column.id}><dt>{column.label}</dt><dd>{compactValue(column.render(context))}</dd></div>)}</dl> })()}<div className="product-table-mobile-actions">{columns.find((column) => column.id === 'actions')?.render(context)}</div>{row.family && row.family.children.length > 0 && <MobileFamilyToggle row={row} expansion={expansion} />}</article> }} />
    <div className="product-table-desktop"><Table className="product-table"><colgroup>{activeColumns.map((column) => <col key={column.id} style={{ width: `${config.widths[column.id] ?? PRODUCT_TABLE_INITIAL_WIDTHS[column.id]}px` }} />)}</colgroup><TableHeader><TableRow>{activeColumns.map((column, index) => <TableHead key={column.id} className={column.id === 'actions' ? 'product-table-actions-head' : ''}><div className="product-table-head-content"><span>{column.label}</span>{index < activeColumns.length - 1 && <div className={`product-table-resize-handle ${resizing === column.id ? 'is-resizing' : ''}`} role="separator" tabIndex={0} aria-label={t('catalog.table.resize', { label: column.label })} aria-valuenow={config.widths[column.id] ?? PRODUCT_TABLE_INITIAL_WIDTHS[column.id]} aria-valuemin={PRODUCT_TABLE_WIDTH_LIMITS[column.id].min} aria-valuemax={PRODUCT_TABLE_WIDTH_LIMITS[column.id].max} onPointerDown={(event) => startResize(event, column.id)} onKeyDown={(event) => nudgeResize(event, column.id)} />}</div></TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row) => { const context = contextFor(row); return <TableRow key={String(row.item.name)} className={`product-table-row ${rowClass(row)}`} onClick={context.onOpen}>{activeColumns.map((column) => <TableCell key={column.id} className={column.id === 'actions' ? 'product-table-actions-cell' : ''}>{column.render(context)}</TableCell>)}</TableRow> })}</TableBody></Table></div>
  </>
}
