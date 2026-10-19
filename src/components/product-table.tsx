import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from './ui'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { calculateGrossMargin } from '../lib/pricing'
import { VirtualizedCollection } from './virtualized-collection'
import { clampProductTableWidth, defaultProductTableConfig, PRODUCT_TABLE_COLUMN_IDS, PRODUCT_TABLE_INITIAL_WIDTHS, PRODUCT_TABLE_WIDTH_LIMITS, readProductTableConfig, writeProductTableConfig, type ProductTableColumnId, type ProductTableConfig } from '../lib/product-table-config'
import type { CachedItem, ItemPrice, VariantItem } from '../lib/types'

type RowContext = { item: CachedItem; prices: ItemPrice[]; variant?: VariantItem; onOpen: () => void; onUom: () => void }
type Column = { id: ProductTableColumnId; label: string; mobilePriority: number; render: (context: RowContext) => ReactNode; available?: (context: RowContext) => boolean }

function itemPrices(prices: ItemPrice[], item: CachedItem) {
  const codes = new Set([String(item.name), String(item.item_code ?? '')])
  const matching = prices.filter((price) => codes.has(String(price.item_code ?? '')))
  const purchases = matching.filter((price) => Boolean(price.buying)).sort((a, b) => Number(a.price_list_rate ?? 0) - Number(b.price_list_rate ?? 0))
  const sales = matching.filter((price) => Boolean(price.selling)).sort((a, b) => Number(b.price_list_rate ?? 0) - Number(a.price_list_rate ?? 0))
  return { purchase: purchases[0] ?? null, sale: sales[0] ?? null }
}

function money(price: ItemPrice | null, locale: string, noCache: string) {
  if (!price) return noCache
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: price.currency || 'MXN', maximumFractionDigits: 2 }).format(Number(price.price_list_rate ?? 0))
}

function text(value: unknown) { return value === undefined || value === null || value === '' ? '—' : String(value) }

function compactValue(value: ReactNode) { return <span className="product-table-compact-value">{value}</span> }

export function ProductTable({ items, prices, variants, profileId, onOpen, onUom }: { items: CachedItem[]; prices: ItemPrice[]; variants: VariantItem[]; profileId: string; onOpen: (name: string) => void; onUom: (name: string) => void }) {
  const { t, i18n } = useTranslation()
  const [config, setConfig] = useState<ProductTableConfig>(() => readProductTableConfig(profileId))
  const [resizing, setResizing] = useState<ProductTableColumnId | null>(null)
  const variantByName = useMemo(() => new Map(variants.map((item) => [item.name, item])), [variants])
  const priceCacheAvailable = prices.length > 0

  useEffect(() => { setConfig(readProductTableConfig(profileId)) }, [profileId])
  useEffect(() => { writeProductTableConfig(profileId, config) }, [config, profileId])

  const columns = useMemo<Column[]>(() => [
    { id: 'product', label: t('catalog.table.product'), mobilePriority: 0, render: ({ item }) => <div className="product-table-product"><Link to={`/items/${encodeURIComponent(String(item.name))}`} onClick={(event) => event.stopPropagation()} className="product-table-title">{text(item.item_name ?? item.name)}</Link><code>{text(item.item_code ?? item.name)}</code></div> },
    { id: 'group', label: t('catalog.table.group'), mobilePriority: 2, render: ({ item }) => text(item.item_group) },
    { id: 'brand', label: t('common.brand'), mobilePriority: 4, render: ({ item }) => text(item.brand) },
    { id: 'stockUom', label: t('catalog.product.stockUom'), mobilePriority: 1, render: ({ item, variant }) => <span className="variant-stock-badge">{text(item.stock_uom ?? variant?.stock_uom)}</span> },
    { id: 'salesUom', label: t('catalog.product.defaultSalesUom'), mobilePriority: 5, render: ({ item }) => text(item.sales_uom) },
    { id: 'purchaseUom', label: t('catalog.product.defaultPurchaseUom'), mobilePriority: 5, render: ({ item }) => text(item.purchase_uom) },
    { id: 'weight', label: t('catalog.table.weight'), mobilePriority: 6, render: ({ item }) => item.weight_per_unit === undefined ? '—' : `${text(item.weight_per_unit)} ${text(item.weight_uom)}` },
    { id: 'variants', label: t('navigation.variants'), mobilePriority: 3, render: ({ item, variant }) => item.has_variants ? t('catalog.table.template') : variant?.variant_of || item.variant_of ? t('catalog.table.variant') : '—' },
    { id: 'barcode', label: 'Barcode', mobilePriority: 6, render: ({ item }) => Array.isArray(item.barcodes) && item.barcodes.length ? text(item.barcodes[0]) : '—' },
    { id: 'purchasePrice', label: t('catalog.table.purchasePrice'), mobilePriority: 7, available: () => priceCacheAvailable, render: ({ item, prices }) => money(itemPrices(prices, item).purchase, i18n.language, t('catalog.table.noCache')) },
    { id: 'salePrice', label: t('catalog.table.salePrice'), mobilePriority: 7, available: () => priceCacheAvailable, render: ({ item, prices }) => money(itemPrices(prices, item).sale, i18n.language, t('catalog.table.noCache')) },
    { id: 'margin', label: t('catalog.table.margin'), mobilePriority: 7, available: () => priceCacheAvailable, render: ({ item, prices }) => { const found = itemPrices(prices, item); const margin = found.purchase && found.sale && (found.purchase.uom || '') === (found.sale.uom || '') ? calculateGrossMargin(found.sale, found.purchase) : null; return margin ? t('catalog.table.marginValue', { value: margin.percentage.toFixed(1), price: money({ ...found.sale, price_list_rate: margin.amount }, i18n.language, t('catalog.table.noCache')) }) : t('catalog.product.notComparable') } },
    { id: 'status', label: t('common.status'), mobilePriority: 0, render: ({ item }) => <span className={`product-status ${item.disabled ? 'product-status-disabled' : 'product-status-active'}`}>{item.disabled ? t('common.disabled') : t('common.active')}</span> },
    { id: 'actions', label: t('catalog.table.actions'), mobilePriority: 0, render: ({ onOpen, onUom }) => <div className="product-table-actions"><Button type="button" variant="action" size="compact" onClick={(event) => { event.stopPropagation(); onOpen() }}>{t('catalog.product.edit')}</Button><Button type="button" variant="action" size="compact" onClick={(event) => { event.stopPropagation(); onUom() }}>{t('catalog.product.configureUom')}</Button></div> },
  ], [i18n.language, priceCacheAvailable, t])

  const activeColumns = columns.filter((column) => config.visibleIds.includes(column.id) && (!column.available || items.some((item) => column.available?.({ item, prices, variant: variantByName.get(item.name), onOpen: () => undefined, onUom: () => undefined }))))
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

  function contextFor(item: CachedItem): RowContext { return { item, prices, variant: variantByName.get(item.name), onOpen: () => onOpen(String(item.name)), onUom: () => onUom(String(item.name)) } }

  return <>
    <div className="product-table-toolbar"><div><strong>{t('catalog.table.visibleColumns')}</strong><span className="muted">{t('catalog.table.optionalColumns', { count: activeColumns.length - 2 })}</span></div><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="secondary" size="compact">{t('catalog.table.columns')}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="product-table-column-menu"><DropdownMenuLabel>{t('catalog.table.showColumns')}</DropdownMenuLabel><DropdownMenuSeparator />{columns.filter((column) => column.id !== 'product' && column.id !== 'actions').map((column) => <DropdownMenuCheckboxItem key={column.id} checked={config.visibleIds.includes(column.id)} disabled={column.available && !priceCacheAvailable} onCheckedChange={(checked) => toggleColumn(column.id, checked === true)}>{column.label}{column.available && !priceCacheAvailable ? ` · ${t('catalog.table.noCache')}` : ''}</DropdownMenuCheckboxItem>)}<DropdownMenuSeparator /><DropdownMenuCheckboxItem checked disabled>{t('catalog.table.requiredProduct')}</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked disabled>{t('catalog.table.requiredActions')}</DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu><Button type="button" variant="secondary" size="compact" onClick={reset}>{t('catalog.table.resetColumns')}</Button></div>
    <VirtualizedCollection className="product-table-mobile" items={items} getKey={(item) => String(item.name)} estimateSize={240} renderItem={(item) => { const context = contextFor(item); return <article className="product-table-mobile-card" onClick={context.onOpen}><div className="product-table-mobile-heading"><div>{columns.find((column) => column.id === 'product')?.render(context)}</div>{columns.find((column) => column.id === 'status')?.render(context)}</div>{mobileDetailColumns.length > 0 && <dl>{mobileDetailColumns.map((column) => <div key={column.id}><dt>{column.label}</dt><dd>{compactValue(column.render(context))}</dd></div>)}</dl>}<div className="product-table-mobile-actions">{columns.find((column) => column.id === 'actions')?.render(context)}</div></article> }} />
    <div className="product-table-desktop"><Table className="product-table"><colgroup>{activeColumns.map((column) => <col key={column.id} style={{ width: `${config.widths[column.id] ?? PRODUCT_TABLE_INITIAL_WIDTHS[column.id]}px` }} />)}</colgroup><TableHeader><TableRow>{activeColumns.map((column, index) => <TableHead key={column.id} className={column.id === 'actions' ? 'product-table-actions-head' : ''}><div className="product-table-head-content"><span>{column.label}</span>{index < activeColumns.length - 1 && <div className={`product-table-resize-handle ${resizing === column.id ? 'is-resizing' : ''}`} role="separator" tabIndex={0} aria-label={t('catalog.table.resize', { label: column.label })} aria-valuenow={config.widths[column.id] ?? PRODUCT_TABLE_INITIAL_WIDTHS[column.id]} aria-valuemin={PRODUCT_TABLE_WIDTH_LIMITS[column.id].min} aria-valuemax={PRODUCT_TABLE_WIDTH_LIMITS[column.id].max} onPointerDown={(event) => startResize(event, column.id)} onKeyDown={(event) => nudgeResize(event, column.id)} />}</div></TableHead>)}</TableRow></TableHeader><TableBody>{items.map((item) => { const context = contextFor(item); return <TableRow key={String(item.name)} className="product-table-row" onClick={context.onOpen}>{activeColumns.map((column) => <TableCell key={column.id} className={column.id === 'actions' ? 'product-table-actions-cell' : ''}>{column.render(context)}</TableCell>)}</TableRow> })}</TableBody></Table></div>
  </>
}
