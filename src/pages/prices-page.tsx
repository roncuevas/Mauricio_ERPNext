import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, ButtonLink, Card, CardContent, Field, Input, Label, Notice, PageHeader, RefreshButton, SearchButton, Spinner } from '../components/ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog'
import { createErpNextClient } from '../lib/erpnext'
import { listAllDocuments } from '../lib/pagination'
import { patchItemPriceCatalog, writeItemPriceCatalog } from '../lib/price-cache'
import { buildVariantTree } from '../lib/variant-cache'
import { variantSearchScore } from '../components/variant-tree'
import { averageComparableOppositeTypePrice, calculateGrossMargin, findComparablePurchases, findDuplicateItemPrice, suggestComparableItemPrice } from '../lib/pricing'
import { CatalogErrorNotice, CatalogReadinessNotice, CatalogSearchShortcutHint, catalogErrorMessage } from '../components/catalog-guidance'
import { PriceFilterSheet } from '../components/price-filter-sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import type { ItemPrice, ItemPriceCatalogCache, PriceList, VariantItem } from '../lib/types'
import { queryKeys } from '../lib/query-keys'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { PriceBulkToolbar } from '../components/price-bulk-toolbar'

type Client = ReturnType<typeof createErpNextClient>
const defaultStockUomOption = '__default_stock_uom__'

async function loadPriceLists(client: Client) {
  return listAllDocuments<PriceList>(client, 'Price List', { fields: ['name', 'selling', 'buying', 'enabled'], filters: [['enabled', '=', 1]], orderBy: 'name asc' })
}

function priceListSupports(priceList: PriceList, kind: 'buying' | 'selling') {
  return Boolean(priceList[kind])
}

function money(price: ItemPrice, locale = 'es', fallback = 'Sin precio') {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: price.currency || 'MXN' }).format(Number(price.price_list_rate ?? 0)) || fallback
}

function priceUomLabel(price: Pick<ItemPrice, 'uom'>, defaultLabel: string) {
  return price.uom || defaultLabel
}

function PriceValidity({ price }: { price: ItemPrice }) {
  const { t } = useTranslation()
  if (!price.valid_from && !price.valid_upto) return null
  const dates = [price.valid_from && t('pricesPage.validFrom', { date: price.valid_from }), price.valid_upto && t('pricesPage.validUntil', { date: price.valid_upto })].filter(Boolean)
  return <span className="text-xs text-[var(--color-muted)]">{dates.join(' · ')}</span>
}

function sortPricesByPriceList(prices: ItemPrice[]) {
  return [...prices].sort((left, right) => {
    const listOrder = (left.price_list || 'Sin lista').localeCompare(right.price_list || 'Sin lista', 'es', { sensitivity: 'base' })
    return listOrder || (left.name || '').localeCompare(right.name || '', 'es', { sensitivity: 'base' })
  })
}

function MarginSummary({ selling, purchases }: { selling: ItemPrice; purchases: ItemPrice[] }) {
  const { t, i18n } = useTranslation()
  if (!purchases.length) return <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">{t('pricesPage.noComparablePurchase')}</span>
  return <div className="price-margin-list" title={t('pricesPage.marginHelp')}>{purchases.map((purchase) => { const margin = calculateGrossMargin(selling, purchase); const positive = margin.amount >= 0; return <span className={`price-margin-row ${positive ? 'price-margin-positive' : 'price-margin-negative'}`} key={`${selling.name}-${purchase.name}`}><strong>{purchase.supplier || t('pricesPage.generalSupplier')}</strong><span>{t('pricesPage.gain')}: {money({ ...selling, price_list_rate: margin.amount }, i18n.language)}</span><span>{margin.percentage.toFixed(2)}%</span><span className="price-margin-cost">{t('pricesPage.cost')} {money(purchase, i18n.language)}</span></span> })}</div>
}

export type PriceFilters = {
  minPrice: string
  maxPrice: string
  brand: string
  itemGroup: string
  supplier: string
  priceList: string
  uom: string
  priceType: '' | 'buying' | 'selling'
  status: '' | 'active' | 'disabled'
}

const emptyPriceFilters: PriceFilters = { minPrice: '', maxPrice: '', brand: '', itemGroup: '', supplier: '', priceList: '', uom: '', priceType: '', status: '' }

function hasPriceCriteria(filters: PriceFilters) {
  return Object.values(filters).some(Boolean)
}

function priceMatchesFilters(price: ItemPrice, filters: PriceFilters) {
  const amount = Number(price.price_list_rate ?? 0)
  const min = filters.minPrice === '' ? null : Number(filters.minPrice)
  const max = filters.maxPrice === '' ? null : Number(filters.maxPrice)
  return (!min || amount >= min) && (!max || amount <= max) && (!filters.supplier || (price.supplier || 'General') === filters.supplier) && (!filters.priceList || (price.price_list || 'Sin lista') === filters.priceList) && (!filters.uom || (price.uom || '—') === filters.uom) && (!filters.priceType || (filters.priceType === 'buying' ? Boolean(price.buying) : Boolean(price.selling)))
}

function itemMatchesFilters(item: VariantItem, prices: ItemPrice[], filters: PriceFilters) {
  const itemMatches = (!filters.brand || (item.brand || 'Sin marca') === filters.brand) && (!filters.itemGroup || (item.item_group || 'Sin grupo') === filters.itemGroup) && (!filters.status || (filters.status === 'disabled' ? Boolean(item.disabled) : !item.disabled))
  const priceMatches = !hasPriceCriteria({ ...filters, brand: '', itemGroup: '', status: '' }) || prices.some((price) => priceMatchesFilters(price, filters))
  return itemMatches && priceMatches
}

type HierarchySearchResult = { visibleNames: Set<string>; directNames: Set<string>; contextNames: Set<string>; expandedNames: Set<string>; scores: Map<string, number> }

// eslint-disable-next-line react-refresh/only-export-components
export function collectVisibleNames(items: VariantItem[], childrenByParent: Map<string, VariantItem[]>, pricesByItem: Map<string, ItemPrice[]>, search: string, filters: PriceFilters): HierarchySearchResult {
  const visibleNames = new Set<string>()
  const directNames = new Set<string>()
  const contextNames = new Set<string>()
  const expandedNames = new Set<string>()
  const scores = new Map<string, number>()
  function revealMatchingDescendants(item: VariantItem) {
    const children = childrenByParent.get(item.name) ?? []
    for (const child of children) {
      if (!itemMatchesFilters(child, pricesByItem.get(child.name) ?? [], filters)) continue
      visibleNames.add(child.name)
      if ((childrenByParent.get(child.name) ?? []).length > 0) expandedNames.add(child.name)
      revealMatchingDescendants(child)
    }
  }
  function visit(item: VariantItem): boolean {
    const children = childrenByParent.get(item.name) ?? []
    const descendantMatches = children.map(visit).some(Boolean)
    const match = search ? variantSearchScore(item, search) : { score: 0 }
    const searchMatches = !search || match !== null
    const matches = searchMatches && itemMatchesFilters(item, pricesByItem.get(item.name) ?? [], filters)
    if (matches) { directNames.add(item.name); scores.set(item.name, match?.score ?? 0) }
    if (matches && children.length > 0) {
      expandedNames.add(item.name)
      revealMatchingDescendants(item)
    }
    if (descendantMatches && !matches) contextNames.add(item.name)
    if (descendantMatches) expandedNames.add(item.name)
    if (matches || descendantMatches) visibleNames.add(item.name)
    return matches || descendantMatches
  }
  items.forEach(visit)
  return { visibleNames, directNames, contextNames, expandedNames, scores }
}

type PriceEditorProps = { client: Client; item: VariantItem; price?: ItemPrice; prices: ItemPrice[]; priceLists: PriceList[]; defaultPriceList?: string; defaultUom?: string; returnTo: string; onSaved: (price: ItemPrice) => Promise<void>; onClose: () => void }

function PriceEditor({ client, item, price, prices, priceLists, defaultPriceList, defaultUom, returnTo, onSaved, onClose }: PriceEditorProps) {
  const { t, i18n } = useTranslation()
  const uomInputId = useId()
  const availableUoms = Array.from(new Set([item.stock_uom, ...(item.uoms ?? []).map((option) => option.uom), price?.uom].filter((option): option is string => Boolean(option))))
  const [kind, setKind] = useState<'buying' | 'selling'>(price?.buying ? 'buying' : 'selling')
  const [priceList, setPriceList] = useState(price?.price_list ?? defaultPriceList ?? (price?.buying ? 'Standard Buying' : 'Standard Selling'))
  const [rate, setRate] = useState(String(price?.price_list_rate ?? ''))
  const [uom, setUom] = useState(price ? price.uom ?? '' : (availableUoms.includes(defaultUom ?? '') ? defaultUom : undefined) ?? item.stock_uom ?? '')
  const [currency, setCurrency] = useState(price?.currency ?? 'MXN')
  const [customer, setCustomer] = useState(price?.customer ?? '')
  const [supplier, setSupplier] = useState(price?.supplier ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const saveInProgress = useRef(false)
  const availablePriceLists = priceLists.filter((candidate) => priceListSupports(candidate, kind))
  const selectedPriceListIsAvailable = availablePriceLists.some((candidate) => candidate.name === priceList)
  const candidate = { name: price?.name ?? '', item_code: item.name, price_list: priceList.trim(), buying: kind === 'buying' ? 1 : 0, selling: kind === 'selling' ? 1 : 0, uom: uom.trim() || undefined, currency: currency.trim() || 'MXN', customer: kind === 'selling' ? customer.trim() || undefined : undefined, supplier: kind === 'buying' ? supplier.trim() || undefined : undefined, batch_no: price?.batch_no, packing_unit: price?.packing_unit ?? 0, valid_from: price?.valid_from }
  const duplicate = findDuplicateItemPrice(prices, candidate, price?.name, item.stock_uom)
  const suggestion = !price ? suggestComparableItemPrice(prices, candidate, item.stock_uom) : null
  const oppositeAverage = averageComparableOppositeTypePrice(prices, candidate, item.stock_uom)
  const rateValue = Number(rate)
  const priceDeviation = rate && oppositeAverage && (kind === 'selling' ? rateValue < oppositeAverage.average : rateValue > oppositeAverage.average)
    ? kind === 'selling'
      ? t('pricesPage.saleBelowPurchaseAverage', { price: money({ ...candidate, price_list_rate: rateValue }, i18n.language), average: money({ ...candidate, price_list_rate: oppositeAverage.average }, i18n.language), count: oppositeAverage.count })
      : t('pricesPage.purchaseAboveSalesAverage', { price: money({ ...candidate, price_list_rate: rateValue }, i18n.language), average: money({ ...candidate, price_list_rate: oppositeAverage.average }, i18n.language), count: oppositeAverage.count })
    : ''
  const duplicateMessage = (duplicatePrice: Pick<ItemPrice, 'price_list' | 'uom'>) => t('pricesPage.duplicatePrice', { list: duplicatePrice.price_list || t('pricesPage.noList'), uom: priceUomLabel(duplicatePrice, t('pricesPage.defaultStockUom', { uom: item.stock_uom || '—' })) })

  async function savePrice() {
    if (saveInProgress.current) return
    saveInProgress.current = true
    setBusy(true)
    setError('')
    if (!priceList.trim() || !rate || Number(rate) < 0) { setError(t('pricesPage.requiredPrice')); setBusy(false); saveInProgress.current = false; return }
    if (duplicate) { setError(duplicateMessage(duplicate)); setBusy(false); saveInProgress.current = false; return }
    const data = { item_code: item.name, price_list: priceList.trim(), price_list_rate: Number(rate), buying: kind === 'buying' ? 1 : 0, selling: kind === 'selling' ? 1 : 0, uom: uom.trim() || null, currency: currency.trim() || 'MXN', customer: kind === 'selling' ? customer.trim() || null : null, supplier: kind === 'buying' ? supplier.trim() || null : null }
    try {
      const currentPrices = await listAllDocuments<ItemPrice>(client, 'Item Price', { fields: ['name', 'item_code', 'price_list', 'price_list_rate', 'buying', 'selling', 'uom', 'currency', 'customer', 'supplier', 'batch_no', 'packing_unit', 'valid_from', 'valid_upto'], filters: [['item_code', '=', item.name]], orderBy: 'name asc' })
      const currentDuplicate = findDuplicateItemPrice(currentPrices, candidate, price?.name, item.stock_uom)
      if (currentDuplicate) { setError(duplicateMessage(currentDuplicate)); return }
      const saved = price ? await client.updateDocument<Record<string, unknown>>('Item Price', price.name, data) : await client.createDocument<Record<string, unknown>>('Item Price', data)
      await onSaved({ ...data, ...saved, name: String(saved.name ?? price?.name ?? '') } as ItemPrice)
    } catch (reason) {
      const message = catalogErrorMessage(reason, t) || t('pricesPage.saveError')
      setError(/Item Price appears multiple times|ItemPriceDuplicateItem/i.test(message) ? duplicateMessage({ price_list: priceList, uom }) : message)
    } finally { setBusy(false); saveInProgress.current = false }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (priceDeviation) { setConfirmationOpen(true); return }
    void savePrice()
  }

  return <div id="price-editor" className="card mb-5 border-blue-200 p-5">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{price ? t('pricesPage.editPrice') : t('pricesPage.addPrice')}</h2><p className="muted">{item.item_name || item.name} · {item.name}</p></div><Button type="button" variant="secondary" onClick={onClose}>{t('common.close')}</Button></div>
    {error && <div className="mb-4"><Notice>{error}</Notice></div>}
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
      <section className="grid gap-3 sm:col-span-2" aria-labelledby="price-details-title">
        <h3 id="price-details-title" className="text-sm font-semibold">{t('catalogGuidance.priceDetails')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.type')}><Select value={kind} onValueChange={(value) => setKind(value as 'buying' | 'selling')}><SelectTrigger aria-label={t('common.type')}><SelectValue /></SelectTrigger><SelectContent align="start"><SelectItem value="buying">{t('pricesPage.buying')}</SelectItem><SelectItem value="selling">{t('pricesPage.selling')}</SelectItem></SelectContent></Select></Field>
          <Field label={t('pricesPage.priceListRequired')}><Select value={priceList || undefined} onValueChange={setPriceList} required><SelectTrigger aria-label={t('common.priceList')}><SelectValue placeholder={t('pricesPage.selectPriceList')} /></SelectTrigger><SelectContent align="start">{!selectedPriceListIsAvailable && priceList && <SelectItem value={priceList}>{priceList} ({t('pricesPage.current')})</SelectItem>}{availablePriceLists.map((candidate) => <SelectItem key={candidate.name} value={candidate.name}>{candidate.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label={t('pricesPage.priceRequired')}><Input type="number" min="0" step="any" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="0.00" required /></Field>
          <Field label={t('pricesPage.currency')}><Input value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="MXN" /></Field>
        </div>
      </section>
      {duplicate && <div className="sm:col-span-2"><Notice>{duplicateMessage(duplicate)}</Notice></div>}
      {priceDeviation && <div className="sm:col-span-2"><Notice tone="warning">{priceDeviation}</Notice></div>}
      {suggestion && <Card className="sm:col-span-2 border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-heading)] shadow-none"><CardContent className="grid gap-3 p-3"><p className="text-sm leading-relaxed text-[var(--color-heading)]">{t('pricesPage.priceSuggestion', { amount: money({ ...candidate, price_list_rate: suggestion.average }, 'es'), count: suggestion.count })}</p><Button className="w-fit" type="button" variant="secondary" onClick={() => setRate(String(Number(suggestion.average.toFixed(6))))}>{t('pricesPage.useSuggestion')}</Button></CardContent></Card>}
      <details className="price-editor-advanced sm:col-span-2" open={Boolean(price && (price.uom || price.customer || price.supplier))}>
        <summary>{t('catalogGuidance.applicability')}{uom && <span className="ml-2 font-normal text-[var(--color-muted)]">· {uom}</span>}</summary>
        <p className="muted mt-2">{t('catalogGuidance.applicabilityHint')}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><div className="flex items-center justify-between gap-2"><Label htmlFor={uomInputId}>{t('common.uom')}</Label><div className="flex items-center gap-2"><TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" className="rounded-full px-1 text-sm font-semibold text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]" aria-label={t('pricesPage.uomHelp')} title={t('pricesPage.uomHelp')}>ⓘ</button></TooltipTrigger><TooltipContent>{t('pricesPage.uomHelp')}</TooltipContent></Tooltip></TooltipProvider><ButtonLink variant="secondary" size="compact" to={`/items/${encodeURIComponent(item.name)}/uoms?returnTo=${encodeURIComponent(returnTo)}`}>{t('pricesPage.configureUom')}</ButtonLink></div></div><Select value={price && !price.uom ? defaultStockUomOption : uom || undefined} onValueChange={(value) => setUom(value === defaultStockUomOption ? '' : value)}><SelectTrigger id={uomInputId} aria-label={t('common.uom')}><SelectValue placeholder={item.stock_uom || t('pricesPage.stockUom')} /></SelectTrigger><SelectContent align="start">{price && !price.uom && <SelectItem value={defaultStockUomOption}>{priceUomLabel(price, t('pricesPage.defaultStockUom', { uom: item.stock_uom || '—' }))}</SelectItem>}{availableUoms.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
          {kind === 'selling' ? <Field label={t('common.customer')}><Input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder={t('pricesPage.customerPlaceholder')} /></Field> : <Field label={t('common.supplier')}><Input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder={t('pricesPage.supplierPlaceholder')} /></Field>}
        </div>
      </details>
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" disabled={busy || Boolean(duplicate)}>{busy ? <><Spinner /> <span className="ml-2">{t('common.save')}</span></> : t('pricesPage.savePrice')}</Button></div>
    </form>
    <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('pricesPage.priceDeviationTitle')}</AlertDialogTitle><AlertDialogDescription>{t('pricesPage.priceDeviationDescription', { warning: priceDeviation })}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel asChild><Button type="button" variant="secondary">{t('common.cancel')}</Button></AlertDialogCancel><AlertDialogAction asChild><Button type="button" onClick={() => void savePrice()}>{t('pricesPage.confirmPriceAnyway')}</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}

function PriceNode({ item, depth, childrenByParent, pricesByItem, visibleNames, expanded, selectedNames, onSelectionToggle, onToggle, onAdd, onEdit }: { item: VariantItem; depth: number; childrenByParent: Map<string, VariantItem[]>; pricesByItem: Map<string, ItemPrice[]>; visibleNames: Set<string>; expanded: Set<string>; selectedNames: Set<string>; onSelectionToggle: (name: string) => void; onToggle: (name: string) => void; onAdd: (item: VariantItem) => void; onEdit: (item: VariantItem, price: ItemPrice) => void }) {
  const { t, i18n } = useTranslation()
  const children = childrenByParent.get(item.name) ?? []
  const prices = sortPricesByPriceList(pricesByItem.get(item.name) ?? [])
  const expandedNode = expanded.has(item.name)
  const isTemplate = Boolean(item.has_variants) || children.length > 0
  return <div className="price-node">
    <div className="price-node-row" style={{ paddingLeft: `${16 + depth * 28}px` }}>
      <div className="price-node-main">
        <div className="price-node-heading">
          <div className={`price-node-toggle${children.length ? '' : ' price-node-toggle-empty'}`}>{children.length > 0 && <button className="price-expand-button" aria-label={expandedNode ? t('pricesPage.hideItem', { name: item.name }) : t('pricesPage.showItem', { name: item.name })} aria-expanded={expandedNode} onClick={() => onToggle(item.name)}>{expandedNode ? '▾' : '▸'}</button>}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><strong className="price-node-title">{item.item_name || item.name}</strong>{isTemplate ? <span className="price-template-badge">{t('pricesPage.template')}</span> : item.variant_of ? <span className="price-variant-badge">{t('pricesPage.variant')}</span> : null}</div>
            <div className="price-node-meta"><span className="font-mono">{item.name}</span>{item.brand && <span>{t('common.brand')}: {item.brand}</span>}{item.stock_uom && <span className="variant-stock-badge">{item.stock_uom}</span>}{!isTemplate && <span>{t('pricesPage.priceCount', { count: prices.length })}</span>}</div>
          </div>
        </div>
        {prices.length > 0 && <div className="price-entry-list">{prices.map((price) => <div className="price-entry" key={price.name}>
          <label className="price-bulk-select"><input type="checkbox" checked={selectedNames.has(price.name)} onChange={() => onSelectionToggle(price.name)} aria-label={t('bulkPricing.selectPrice', { item: item.item_name || item.name, list: price.price_list || t('pricesPage.noList') })} /><span className="sr-only">{t('bulkPricing.select')}</span></label>
          <div className="price-entry-top"><span className={`price-kind ${price.buying ? 'price-kind-buying' : 'price-kind-selling'}`}>{price.buying ? t('pricesPage.buying') : t('pricesPage.selling')}</span><span className="price-amount">{money(price, i18n.language)}</span></div>
          <div className="price-entry-meta"><span>{price.price_list || t('pricesPage.noList')}</span><Badge tone={price.buying ? 'warning' : 'success'}>{t('pricesPage.uomLabel')} {priceUomLabel(price, t('pricesPage.defaultStockUom', { uom: item.stock_uom || '—' }))}</Badge>{price.buying ? <span>{t('common.supplier')}: {price.supplier || t('pricesPage.general')}</span> : price.customer ? <span>{t('common.customer')}: {price.customer}</span> : null}</div>
          <PriceValidity price={price} />
          {price.selling ? <div className="price-entry-margin"><MarginSummary selling={price} purchases={findComparablePurchases(price, prices)} /></div> : null}
          <Button className="price-edit-button" type="button" variant="secondary" onClick={() => onEdit(item, price)}>{t('common.edit')}</Button>
        </div>)}</div>}
      </div>
    {!isTemplate && <Button className="price-add-button" type="button" variant="secondary" onClick={() => onAdd(item)}>{t('pricesPage.addPrice')}</Button>}
    </div>
    {expandedNode && children.filter((child) => visibleNames.has(child.name)).map((child) => <PriceNode key={child.name} item={child} depth={depth + 1} childrenByParent={childrenByParent} pricesByItem={pricesByItem} visibleNames={visibleNames} expanded={expanded} selectedNames={selectedNames} onSelectionToggle={onSelectionToggle} onToggle={onToggle} onAdd={onAdd} onEdit={onEdit} />)}
  </div>
}

export function PricesPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const pricesQuery = useQuery(catalogQueryOptions.price(profileId))
  const variantsQuery = useQuery(catalogQueryOptions.variant(profileId))
  const priceListsQuery = useQuery({ queryKey: queryKeys.prices.lists(profileId), queryFn: () => loadPriceLists(client), staleTime: 5 * 60 * 1000 })
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') ?? '')
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [filters, setFilters] = useState<PriceFilters>(emptyPriceFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [collapsedDuringSearch, setCollapsedDuringSearch] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [selectedPriceNames, setSelectedPriceNames] = useState<Set<string>>(new Set())
  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  useEffect(() => {
    if (!isMobile) return
    setExpanded(new Set())
    setCollapsedDuringSearch(new Set())
  }, [isMobile])
  useEffect(() => {
    if (!pricesQuery.data || !variantsQuery.data) return
    const scrollTop = Number(searchParams.get('scroll'))
    if (!Number.isFinite(scrollTop) || scrollTop < 0) return
    requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'auto' }))
  }, [pricesQuery.data, searchParams, variantsQuery.data])
  const tree = useMemo(() => buildVariantTree(variantsQuery.data?.items ?? []), [variantsQuery.data?.items])
  const pricesByItem = useMemo(() => { const result = new Map<string, ItemPrice[]>(); for (const price of pricesQuery.data?.prices ?? []) { const item = price.item_code ?? ''; result.set(item, [...(result.get(item) ?? []), price]) } return result }, [pricesQuery.data?.prices])
  const allPrices = pricesQuery.data?.prices ?? []
  const selectedPrices = allPrices.filter((price) => selectedPriceNames.has(price.name))
  function togglePriceSelection(name: string) { setSelectedPriceNames((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next }) }
  const filterOptions = useMemo(() => {
    const items = variantsQuery.data?.items ?? []
    const prices = pricesQuery.data?.prices ?? []
    return {
      brands: Array.from(new Set(items.map((item) => item.brand || 'Sin marca'))).sort(),
      itemGroups: Array.from(new Set(items.map((item) => item.item_group || 'Sin grupo'))).sort(),
      suppliers: Array.from(new Set(prices.map((price) => price.supplier || 'General'))).sort(),
      priceLists: Array.from(new Set([...prices.map((price) => price.price_list || 'Sin lista'), ...(priceListsQuery.data ?? []).map((priceList) => priceList.name)])).sort(),
      uoms: Array.from(new Set(prices.map((price) => price.uom || '—'))).sort(),
    }
  }, [priceListsQuery.data, pricesQuery.data?.prices, variantsQuery.data?.items])
  const refresh = useMutation({ mutationFn: async () => { const prices = await listAllDocuments<ItemPrice>(client, 'Item Price', { fields: ['name', 'item_code', 'price_list', 'price_list_rate', 'buying', 'selling', 'uom', 'currency', 'customer', 'supplier', 'batch_no', 'packing_unit', 'valid_from', 'valid_upto'], orderBy: 'item_code asc, price_list asc' }, (count) => setSyncMessage(t('pricesPage.downloading', { count }))); const next: ItemPriceCatalogCache = { profileId, updatedAt: new Date().toISOString(), prices }; return writeItemPriceCatalog(next) }, onSuccess: (next) => { queryClient.setQueryData(queryKeys.catalog.price(profileId), next); setSyncMessage(t('pricesPage.updatedCount', { count: next.prices.length })) }, onError: () => setSyncMessage('') })
  const searchResult = useMemo(() => collectVisibleNames(tree.roots, tree.children, pricesByItem, search, filters), [tree.children, tree.roots, pricesByItem, search, filters])
  const visibleNames = searchResult.visibleNames
  const effectiveExpanded = useMemo(() => {
    if (!search) return expanded
    const next = new Set(expanded)
    searchResult.expandedNames.forEach((name) => { if (!collapsedDuringSearch.has(name)) next.add(name) })
    collapsedDuringSearch.forEach((name) => next.delete(name))
    return next
  }, [collapsedDuringSearch, expanded, search, searchResult.expandedNames])
  const sortItems = useCallback((items: VariantItem[]) => [...items].filter((item) => visibleNames.has(item.name)).sort((left, right) => {
    const leftDirect = searchResult.directNames.has(left.name) ? 1 : 0
    const rightDirect = searchResult.directNames.has(right.name) ? 1 : 0
    return rightDirect - leftDirect || (searchResult.scores.get(right.name) ?? 0) - (searchResult.scores.get(left.name) ?? 0)
  }), [searchResult, visibleNames])
  const orderedChildren = useMemo(() => new Map(Array.from(tree.children.entries()).map(([parent, children]) => [parent, sortItems(children)])), [sortItems, tree.children])
  const roots = sortItems(tree.roots)
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const updated = pricesQuery.data ? new Date(pricesQuery.data.updatedAt).toLocaleString(i18n.language === 'en' ? 'en-US' : 'es-MX') : ''
  function openPriceManagement(itemName: string, priceName?: string) {
    const returnParams = new URLSearchParams()
    if (search) returnParams.set('search', search)
    returnParams.set('scroll', String(Math.round(window.scrollY)))
    const managementParams = new URLSearchParams()
    if (priceName) managementParams.set('price', priceName)
    managementParams.set('returnTo', `/prices?${returnParams.toString()}`)
    navigate(`/prices/manage/${encodeURIComponent(itemName)}?${managementParams.toString()}`)
  }
  function toggleExpanded(name: string) {
    const willExpand = !effectiveExpanded.has(name)
    setExpanded((current) => { const next = new Set(current); if (willExpand) next.add(name); else next.delete(name); return next })
    if (search) setCollapsedDuringSearch((current) => { const next = new Set(current); if (willExpand) next.delete(name); else next.add(name); return next })
  }
  return <section className="prices-workspace"><PageHeader title={t('pricesPage.title')} description={t('pricesPage.description')} action={<div className="flex flex-wrap gap-2"><Link className="button button-secondary" to="/suppliers">{t('common.suppliers')}</Link><RefreshButton label={t('pricesPage.refresh')} onClick={() => refresh.mutate()} loading={refresh.isPending} /></div>} />{!variantsQuery.isPending && !variantsQuery.isError && !variantsQuery.data && <div className="mb-5"><CatalogReadinessNotice title={t('catalogGuidance.pricesVariantsMissingTitle')} description={t('pricesPage.refreshVariantsHint')} action={t('pricesPage.goToVariants')} to="/variants" /></div>}{variantsQuery.isError && <CatalogErrorNotice error={variantsQuery.error} />}{pricesQuery.isError && <CatalogErrorNotice error={pricesQuery.error} />}{refresh.isError && <CatalogErrorNotice error={refresh.error} onRetry={() => refresh.mutate()} />}{variantsQuery.data && !pricesQuery.data && !pricesQuery.isPending && !pricesQuery.isError && <div className="mb-5"><CatalogReadinessNotice title={t('catalogGuidance.pricesMissingTitle')} description={t('pricesPage.downloadHint')} action={t('pricesPage.refresh')} onAction={() => refresh.mutate()} disabled={refresh.isPending} /></div>}{pricesQuery.isPending || variantsQuery.isPending ? <div className="flex justify-center p-12"><Spinner /></div> : !variantsQuery.data ? <div className="card p-12 text-center"><p className="font-medium text-slate-700">{t('catalogGuidance.pricesCatalogUnavailable')}</p></div> : !pricesQuery.data ? <div className="card p-12 text-center"><p className="font-medium text-slate-700">{t('pricesPage.notDownloaded')}</p></div> : <><div className="prices-toolbar"><div className="prices-toolbar-main"><form className="prices-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setCollapsedDuringSearch(new Set()); setFiltersOpen(false) }}><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t('pricesPage.searchPlaceholder')} aria-label={t('pricesPage.searchLabel')} /><SearchButton label={t('pricesPage.searchLabel')} /></form><CatalogSearchShortcutHint /><div className="prices-filter-menu"><PriceFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} filters={filters} options={filterOptions} activeCount={activeFilterCount} onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onClear={() => setFilters(emptyPriceFilters)} /></div></div><span className="prices-summary">{t('pricesPage.priceCount', { count: pricesQuery.data.prices.length })} · {updated ? t('pricesPage.updatedAt', { date: updated }) : t('pricesPage.noDate')}{syncMessage ? ` · ${syncMessage}` : ''}</span></div><PriceBulkToolbar client={client} profileId={profileId} prices={allPrices} selectedPrices={selectedPrices} onSelectAll={() => setSelectedPriceNames(new Set(allPrices.map((price) => price.name)))} onClearSelection={() => setSelectedPriceNames(new Set())} onSelectionFinished={(names) => setSelectedPriceNames(new Set(names))} onRefresh={() => refresh.mutate()} /><div className="card prices-tree overflow-hidden">{roots.length ? roots.map((item) => <PriceNode key={item.name} item={item} depth={0} childrenByParent={orderedChildren} pricesByItem={pricesByItem} visibleNames={visibleNames} expanded={effectiveExpanded} selectedNames={selectedPriceNames} onSelectionToggle={togglePriceSelection} onToggle={toggleExpanded} onAdd={(selectedItem) => openPriceManagement(selectedItem.name)} onEdit={(selectedItem, price) => openPriceManagement(selectedItem.name, price.name)} />) : <div className="p-10 text-center muted">{t('pricesPage.noSearchResults')}</div>}</div></>}</section>
}

export function PriceManagementPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t, i18n } = useTranslation()
  const { itemName } = useParams<{ itemName: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const pricesQuery = useQuery(catalogQueryOptions.price(profileId))
  const variantsQuery = useQuery(catalogQueryOptions.variant(profileId))
  const cachedItem = variantsQuery.data?.items.find((candidate) => candidate.name === itemName)
  const itemQuery = useQuery({ queryKey: queryKeys.item.detail(profileId, itemName ?? ''), queryFn: () => client.getDocument<VariantItem>('Item', itemName!), enabled: Boolean(itemName) && !variantsQuery.isPending && !cachedItem })
  const priceListsQuery = useQuery({ queryKey: queryKeys.prices.lists(profileId), queryFn: () => loadPriceLists(client), staleTime: 5 * 60 * 1000 })
  const [editingPriceName, setEditingPriceName] = useState(searchParams.get('price') ?? '')
  const [message, setMessage] = useState('')
  const [sessionPrices, setSessionPrices] = useState<ItemPrice[]>([])
  const returnToPrices = searchParams.get('returnTo') || '/prices'
  const returnLabel = returnToPrices === '/items' ? t('pricesPage.backToProducts') : t('pricesPage.backToPrices')
  const item = cachedItem ?? itemQuery.data
  const existingPrices = useMemo(() => sortPricesByPriceList([...(pricesQuery.data?.prices ?? []).filter((price) => price.item_code === itemName), ...sessionPrices.filter((price) => price.item_code === itemName && !(pricesQuery.data?.prices ?? []).some((cached) => cached.name === price.name))]), [itemName, pricesQuery.data?.prices, sessionPrices])
  const editingPrice = existingPrices.find((price) => price.name === editingPriceName)

  async function savePrice(price: ItemPrice) {
    const next = await patchItemPriceCatalog(profileId, price)
    if (next) queryClient.setQueryData(queryKeys.catalog.price(profileId), next)
    else setSessionPrices((current) => [...current.filter((candidate) => candidate.name !== price.name), price])
    setEditingPriceName(price.name)
    setMessage(t('pricesPage.savedFor', { item: price.item_code ?? '' }))
    if (returnToPrices.startsWith('/pos')) navigate(returnToPrices)
  }

  if (pricesQuery.isPending || variantsQuery.isPending || itemQuery.isPending) return <section><Spinner /></section>
  if (!item && itemQuery.isError) return <section><CatalogErrorNotice error={itemQuery.error} /><Button className="mt-3" type="button" variant="secondary" onClick={() => navigate(returnToPrices)}>{returnLabel}</Button></section>
  if (!item) return <section><Notice>{t('pricesPage.productNotFound')}</Notice><Button className="mt-3" type="button" variant="secondary" onClick={() => navigate(returnToPrices)}>{returnLabel}</Button></section>
  return <section className="price-management-workspace"><PageHeader title={editingPrice ? t('pricesPage.editPrice') : t('pricesPage.addPrice')} description={t('pricesPage.managementDescription', { item: item.item_name || item.name })} action={<Button type="button" variant="secondary" onClick={() => navigate(returnToPrices)}>{returnLabel}</Button>} /><div className="price-management-summary"><div><span className="price-management-label">{t('common.product')}</span><strong>{item.item_name || item.name}</strong><code>{item.name}</code></div><div><span className="price-management-label">{t('pricesPage.existingPrices')}</span><strong>{existingPrices.length}</strong></div><Button type="button" variant="secondary" onClick={() => setEditingPriceName('')}>{t('pricesPage.addAnother')}</Button></div><div className="price-management-existing"><div className="price-management-section-heading"><h2>{t('pricesPage.currentPrices')}</h2><span>{existingPrices.length}</span></div>{existingPrices.length ? existingPrices.map((price) => <div className={`price-management-entry${price.name === editingPriceName ? ' price-management-entry-active' : ''}`} key={price.name}><div><span className={`price-kind ${price.buying ? 'price-kind-buying' : 'price-kind-selling'}`}>{price.buying ? t('pricesPage.buying') : t('pricesPage.selling')}</span><strong>{money(price, i18n.language)}</strong></div><div><span>{price.price_list || t('pricesPage.noList')}</span><span>{t('pricesPage.uomLabel')} {priceUomLabel(price, t('pricesPage.defaultStockUom', { uom: item.stock_uom || '—' }))}</span><PriceValidity price={price} />{price.buying ? <span>{t('common.supplier')}: {price.supplier || t('pricesPage.general')}</span> : price.customer ? <span>{t('common.customer')}: {price.customer}</span> : null}</div><Button type="button" variant="secondary" onClick={() => setEditingPriceName(price.name)}>{t('common.edit')}</Button></div>) : <p className="muted">{t('pricesPage.noSavedPrices')}</p>}</div>{message && <Notice tone="info">{message}</Notice>}{priceListsQuery.isError && <CatalogErrorNotice error={priceListsQuery.error} onRetry={() => { void priceListsQuery.refetch() }} />}<PriceEditor key={`${item.name}-${editingPrice?.name ?? 'new'}`} client={client} item={item} price={editingPrice} prices={existingPrices} priceLists={priceListsQuery.data ?? []} defaultPriceList={searchParams.get('priceList') ?? undefined} defaultUom={searchParams.get('uom') ?? undefined} returnTo={`${location.pathname}${location.search}`} onSaved={savePrice} onClose={() => navigate(returnToPrices)} /></section>
}
