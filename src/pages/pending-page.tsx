import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, CircleAlert, ExternalLink, ImageOff, ImagePlus, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, Badge, Button, ButtonLink, Input, PageHeader, SearchButton, Spinner } from '../components/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { StockDocumentNotice } from '../components/stock-document'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu'
import { PendingImageEditor } from '../components/pending-image-editor'
import { CatalogErrorNotice } from '../components/catalog-guidance'
import { createErpNextClient } from '../lib/erpnext'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { queryKeys } from '../lib/query-keys'
import { findIncompleteCatalogItems, findLowMarginPrices, findMissingImages, findPendingItems, findStockShortages, type IncompleteCatalogItem, type PendingItem, type PendingPriceKind } from '../lib/pending-items'
import { readPendingPreferences } from '../lib/pending-preferences'
import { runManagedCacheRefresh } from '../lib/cache-manager'
import { VirtualizedCollection } from '../components/virtualized-collection'
import { rankProductSearch } from '../lib/search'
import { patchItemCatalog } from '../lib/item-cache'
import { patchVariantCatalog } from '../lib/variant-cache'
import { readStockCache } from '../lib/stock-cache'
import type { ItemCatalogCache, ItemPrice, StockCache, VariantCatalogCache, VariantItem } from '../lib/types'

type Client = ReturnType<typeof createErpNextClient>
type PendingTab = 'prices' | 'templates' | 'margin' | 'images' | 'stock' | 'data'
const PENDING_TABS: PendingTab[] = ['prices', 'templates', 'margin', 'images', 'stock', 'data']
const ALL_WAREHOUSES = '__all__'

function priceManagementUrl(itemCode: string, price: ItemPrice | undefined, kind: PendingPriceKind, priceList: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo, kind, priceList })
  if (price) params.set('price', price.name)
  if (price?.uom) params.set('uom', price.uom)
  return `/prices/manage/${encodeURIComponent(itemCode)}?${params.toString()}`
}

export function PendingPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') as PendingTab | null
  const activeTab: PendingTab = requestedTab && PENDING_TABS.includes(requestedTab) ? requestedTab : 'prices'
  const search = searchParams.get('q') ?? ''
  const warehouse = searchParams.get('warehouse') ?? ''
  const returnTo = `${location.pathname}${location.search}`
  const [imageItem, setImageItem] = useState<VariantItem | null>(null)
  const [refreshMessage, setRefreshMessage] = useState('')
  const [imageSaveMessage, setImageSaveMessage] = useState('')
  const [templateImageItem, setTemplateImageItem] = useState<string | null>(null)
  const [stockRefreshMessage, setStockRefreshMessage] = useState('')
  const preferences = readPendingPreferences(profileId)
  const variants = useQuery(catalogQueryOptions.variant(profileId))
  const prices = useQuery(catalogQueryOptions.price(profileId))
  const itemCatalog = useQuery(catalogQueryOptions.item(profileId))
  const stock = useQuery({ queryKey: queryKeys.catalog.stock(profileId), queryFn: () => readStockCache(profileId), staleTime: Infinity })

  function updateParams(changes: Record<string, string>) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key) })
      return next
    }, { replace: true })
  }

  const refresh = useMutation({
    mutationFn: async () => {
      const context = { client, profileId, date: new Date().toISOString().slice(0, 10) }
      for (const [index, id] of (['variants', 'prices', 'priceLists'] as const).entries()) {
        setRefreshMessage(t('pendingPage.refreshProgress', { current: index + 1, total: 3 }))
        await runManagedCacheRefresh(id, context)
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog.variant(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog.price(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.prices.lists(profileId) }),
      ])
      setRefreshMessage(t('pendingPage.refreshComplete'))
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog.variant(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog.price(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.prices.lists(profileId) }),
      ])
      setRefreshMessage('')
    },
  })
  const stockRefresh = useMutation({
    mutationFn: async () => {
      await runManagedCacheRefresh('stock', { client, profileId, date: new Date().toISOString().slice(0, 10) }, setStockRefreshMessage)
      const cache = await readStockCache(profileId)
      if (!cache) throw new Error(t('pendingPage.stockRefreshError'))
      return cache
    },
    onSuccess: (cache) => {
      queryClient.setQueryData<StockCache>(queryKeys.catalog.stock(profileId), cache)
      setStockRefreshMessage(t('pendingPage.stockRefreshComplete'))
    },
    onError: (error) => setStockRefreshMessage(error instanceof Error ? error.message : t('pendingPage.stockRefreshError')),
  })
  const items = variants.data?.items
  const pending = useMemo(() => findPendingItems(items ?? [], prices.data?.prices ?? [], { buying: preferences.buyingPriceList, selling: preferences.sellingPriceList }), [preferences.buyingPriceList, preferences.sellingPriceList, prices.data?.prices, items])
  const lowMargins = useMemo(() => findLowMarginPrices(items ?? [], prices.data?.prices ?? [], { threshold: preferences.lowMarginThreshold, buyingPriceList: preferences.buyingPriceList }), [preferences.buyingPriceList, preferences.lowMarginThreshold, prices.data?.prices, items])
  const itemTagsByName = useMemo(() => new Map((itemCatalog.data?.items ?? []).map((item) => [item.name, item.tags ?? []])), [itemCatalog.data?.items])
  const searchableItem = (item: VariantItem) => ({ ...item, tags: item.tags ?? itemTagsByName.get(item.name) })
  const priceRows = pending.filter(({ kind }) => kind !== 'template')
  const templateRows = pending.filter(({ kind }) => kind === 'template')
  const priceFilterParam = searchParams.get('price')
  const priceFilter: PendingPriceKind | '' = priceFilterParam === 'buying' || priceFilterParam === 'selling' ? priceFilterParam : ''
  // Filtering by one price keeps only that price on each row, so tags, actions and urgency follow the filter.
  const shownPriceRows = priceFilter ? priceRows
    .map((row) => ({ ...row, missingPrices: row.missingPrices.filter((kind) => kind === priceFilter), inheritedPrices: row.inheritedPrices.filter((kind) => kind === priceFilter) }))
    .filter((row) => row.missingPrices.length || row.inheritedPrices.length)
    .sort((left, right) => Number(!left.missingPrices.length) - Number(!right.missingPrices.length)) : priceRows
  const missingPriceCounts = { buying: priceRows.filter((row) => row.missingPrices.includes('buying')).length, selling: priceRows.filter((row) => row.missingPrices.includes('selling')).length }
  const filteredPrices = rankProductSearch(shownPriceRows, search, ({ item }) => searchableItem(item))
  const filteredTemplates = rankProductSearch(templateRows, search, ({ item }) => searchableItem(item))
  const filteredMargins = rankProductSearch(lowMargins, search, ({ item }) => searchableItem(item))
  const leafWarehouses = useMemo(() => (stock.data?.warehouses ?? []).filter((candidate) => !candidate.disabled && !candidate.is_group), [stock.data?.warehouses])
  const stockWarehouse = leafWarehouses.some((candidate) => candidate.name === warehouse) ? warehouse : ''
  // For a shortage in one warehouse, the active warehouse holding the most stock of that item is the transfer source.
  const transferSources = useMemo(() => {
    const sources = new Map<string, { warehouse: string; qty: number }>()
    if (!stockWarehouse) return sources
    const active = new Set(leafWarehouses.map((candidate) => candidate.name))
    for (const bin of stock.data?.bins ?? []) {
      const qty = Number(bin.actual_qty ?? 0)
      if (bin.warehouse === stockWarehouse || !active.has(bin.warehouse) || qty <= 0) continue
      if (qty > (sources.get(bin.item_code)?.qty ?? 0)) sources.set(bin.item_code, { warehouse: bin.warehouse, qty })
    }
    return sources
  }, [leafWarehouses, stock.data?.bins, stockWarehouse])
  const warehouseLabel = (name: string) => leafWarehouses.find((candidate) => candidate.name === name)?.warehouse_name || name
  const stockShortages = useMemo(() => findStockShortages(items ?? [], stock.data?.bins ?? [], stock.data?.warehouses ?? [], stockWarehouse || undefined), [stock.data?.bins, stock.data?.warehouses, stockWarehouse, items])
  const filteredStockShortages = rankProductSearch(stockShortages, search, ({ item }) => searchableItem(item))
  const incompleteItems = useMemo(() => findIncompleteCatalogItems(items ?? []), [items])
  const filteredIncompleteItems = rankProductSearch(incompleteItems, search, ({ item }) => searchableItem(item))
  const missingImageItems = useMemo(() => findMissingImages(items ?? []), [items])
  const filteredMissingImages = rankProductSearch(missingImageItems, search, ({ item }) => searchableItem(item))
  const itemsByName = useMemo(() => new Map((items ?? []).map((item) => [item.name, item])), [items])
  const imagesReady = variants.data?.imageFieldLoaded === true
  const notReady = variants.isPending || prices.isPending
  const dateLabel = (date?: string) => date ? new Date(date).toLocaleString(i18n.language) : t('pendingPage.notUpdated')
  const formatPrice = (price: ItemPrice, rate = Number(price.price_list_rate ?? 0)) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: price.currency || 'MXN', maximumFractionDigits: 2 }).format(rate)
  const formatQuantity = (quantity: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(quantity)
  const isUrgentPrice = (row: PendingItem) => row.missingPrices.length > 0
  const isUrgentData = (row: IncompleteCatalogItem) => row.missingFields.length > 0
  // Inherited prices and a missing brand are listed but do not count as pending.
  const tabCounts: Record<PendingTab, number | null> = {
    prices: priceRows.filter(isUrgentPrice).length,
    templates: templateRows.length,
    margin: lowMargins.length,
    images: imagesReady ? missingImageItems.length : null,
    stock: stock.data ? stockShortages.length : null,
    data: incompleteItems.filter(isUrgentData).length,
  }
  const visible = { prices: filteredPrices, templates: filteredTemplates, margin: filteredMargins, images: imagesReady ? filteredMissingImages : [], stock: filteredStockShortages, data: filteredIncompleteItems }[activeTab]
  const activeCount = activeTab === 'prices' ? filteredPrices.filter(isUrgentPrice).length : activeTab === 'data' ? filteredIncompleteItems.filter(isUrgentData).length : visible.length
  const lowPriorityCount = visible.length - activeCount

  async function updateImageCache(item: VariantItem, imageUrl: string) {
    const updatedItem = { ...item, image: imageUrl }
    const writes = await Promise.allSettled([patchItemCatalog(profileId, updatedItem), patchVariantCatalog(profileId, updatedItem)])
    queryClient.setQueryData<ItemCatalogCache | null>(queryKeys.catalog.item(profileId), (cache) => cache ? { ...cache, locallyModified: true, items: cache.items.map((candidate) => candidate.name === item.name ? { ...candidate, image: imageUrl } : candidate) } : cache)
    queryClient.setQueryData<VariantCatalogCache | null>(queryKeys.catalog.variant(profileId), (cache) => cache ? { ...cache, locallyModified: true, items: cache.items.map((candidate) => candidate.name === item.name ? { ...candidate, image: imageUrl } : candidate) } : cache)
    return writes.some((result) => result.status === 'rejected')
  }

  async function saveItemImage(imageUrl: string) {
    if (!imageItem) return
    const cacheFailed = await updateImageCache(imageItem, imageUrl)
    setImageSaveMessage(cacheFailed ? t('pendingPage.imageSavedCacheWarning') : t('pendingPage.imageSaved'))
  }

  async function assignTemplateImage(item: VariantItem, template: VariantItem) {
    if (!template.image || templateImageItem) return
    setTemplateImageItem(item.name)
    setImageSaveMessage('')
    try {
      const savedImage = await client.setItemImage(item.name, template.image)
      const cacheFailed = await updateImageCache(item, savedImage)
      setImageSaveMessage(cacheFailed ? t('pendingPage.imageSavedCacheWarning') : t('pendingPage.imageSaved'))
    } catch (error) {
      setImageSaveMessage(error instanceof Error ? error.message : t('pendingPage.imageSaveError'))
    } finally {
      setTemplateImageItem(null)
    }
  }

  const priceListFor = (kind: PendingPriceKind) => kind === 'buying' ? preferences.buyingPriceList : preferences.sellingPriceList
  const empty = (key: 'prices' | 'templates' | 'margin' | 'images' | 'stock' | 'data', linkLabel?: string) => <PendingEmpty search={search} title={search ? t('pendingPage.noSearchResults') : t(`pendingPage.${key}Clear`)} description={search ? t('pendingPage.noSearchDescription') : t(`pendingPage.${key}ClearDescription`)} linkLabel={linkLabel} />
  const list = <T,>(rows: T[], getKey: (row: T) => string, render: (row: T) => ReactNode) => <div role="list"><VirtualizedCollection className="pending-list" items={rows} getKey={getKey} estimateSize={72} renderItem={render} /></div>

  return <section className="pending-workspace">
    <PageHeader title={t('pendingPage.title')} description={t('pendingPage.description')} action={<Button type="button" variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}><RefreshCw className={`mr-2 size-4${refresh.isPending ? ' animate-spin' : ''}`} aria-hidden="true" />{refresh.isPending ? t('pendingPage.refreshing') : t('pendingPage.refresh')}</Button>} />
    <StockDocumentNotice documentUrl={client.documentUrl} />
    <div className="pending-status-bar">
      <div><strong>{t('pendingPage.priceLists')}</strong><span>{t('pendingPage.priceListsSummary', { buyingLabel: t('pendingPage.buyingList'), buying: preferences.buyingPriceList, sellingLabel: t('pendingPage.sellingList'), selling: preferences.sellingPriceList })}</span></div>
      <span>{t('pendingPage.updated', { variants: dateLabel(variants.data?.updatedAt), prices: dateLabel(prices.data?.updatedAt) })}</span>
    </div>
    {refreshMessage && <p className="pending-refresh-message" role="status">{refreshMessage}</p>}
    {imageSaveMessage && <Alert className="notice-info" role="status"><AlertDescription>{imageSaveMessage}</AlertDescription></Alert>}
    {variants.isError && <CatalogErrorNotice error={variants.error} />}
    {prices.isError && <CatalogErrorNotice error={prices.error} />}
    {!notReady && (!variants.data || !prices.data) && <div className="pending-empty-state"><CircleAlert aria-hidden="true" /><div><h2>{t('pendingPage.cacheMissing')}</h2><p>{t('pendingPage.cacheMissingDescription')}</p></div><Button type="button" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{t('pendingPage.refresh')}</Button></div>}
    {refresh.isError && <CatalogErrorNotice error={refresh.error} onRetry={() => refresh.mutate()} />}
    {notReady && <div className="flex justify-center p-12"><Spinner /></div>}
    {!notReady && variants.data && prices.data && <>
      <Tabs value={activeTab} onValueChange={(value) => updateParams({ tab: value === 'prices' ? '' : value, q: '', price: '' })}>
        <TabsList aria-label={t('pendingPage.tabs.label')} className="pending-tabs">
          {PENDING_TABS.map((tab) => <TabsTrigger key={tab} value={tab}>{t(`pendingPage.tabs.${tab}`)} <span>{tabCounts[tab] ?? '—'}</span></TabsTrigger>)}
        </TabsList>
        <div className="pending-toolbar">
          <div>
            <strong>{activeTab === 'images' && !imagesReady ? t('pendingPage.imagesNeedRefresh') : activeTab === 'stock' && !stock.data ? t('pendingPage.stockCacheMissing') : t('pendingPage.count', { count: activeCount })}{lowPriorityCount > 0 && <small> · {t('pendingPage.lowPriority', { count: lowPriorityCount })}</small>}</strong>
            <span>{activeTab === 'stock' && stock.data ? t('pendingPage.stockUpdated', { date: new Date(stock.data.updatedAt).toLocaleString(i18n.language) }) : t(`pendingPage.tabs.${activeTab}Description`, { list: preferences.buyingPriceList })}</span>
          </div>
          <div className="pending-toolbar-actions">
            {activeTab === 'stock' && stock.data && leafWarehouses.length > 1 && <Select value={stockWarehouse || ALL_WAREHOUSES} onValueChange={(value) => updateParams({ warehouse: value === ALL_WAREHOUSES ? '' : value })}><SelectTrigger className="pending-select" aria-label={t('pendingPage.warehouse')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL_WAREHOUSES}>{t('pendingPage.allWarehouses')}</SelectItem>{leafWarehouses.map((candidate) => <SelectItem key={candidate.name} value={candidate.name}>{candidate.warehouse_name || candidate.name}</SelectItem>)}</SelectContent></Select>}
            {activeTab === 'stock' && <Button type="button" variant="secondary" onClick={() => stockRefresh.mutate()} disabled={stockRefresh.isPending}><RefreshCw className={`mr-2 size-4${stockRefresh.isPending ? ' animate-spin' : ''}`} aria-hidden="true" />{stockRefresh.isPending ? t('pendingPage.stockRefreshing') : t('pendingPage.stockRefresh')}</Button>}
            {activeTab === 'prices' && <Select value={priceFilter || 'all'} onValueChange={(value) => updateParams({ price: value === 'all' ? '' : value })}><SelectTrigger className="pending-select" aria-label={t('pendingPage.priceFilter.label')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('pendingPage.priceFilter.all')}</SelectItem><SelectItem value="buying">{t('pendingPage.priceFilter.buying', { count: missingPriceCounts.buying })}</SelectItem><SelectItem value="selling">{t('pendingPage.priceFilter.selling', { count: missingPriceCounts.selling })}</SelectItem></SelectContent></Select>}
            <PendingSearchForm key={activeTab} initialValue={search} onSearch={(value) => updateParams({ q: value })} />
          </div>
        </div>
        <TabsContent value="prices">{filteredPrices.length ? list(filteredPrices, (row) => row.item.name, ({ item, missingPrices, inheritedPrices }) => {
          const name = item.item_name || item.name
          return <PendingRow item={item} tags={<>{missingPrices.map((kind) => <Badge key={kind} tone="warning">{t(kind === 'buying' ? 'pendingPage.buying' : 'pendingPage.selling')}</Badge>)}{inheritedPrices.map((kind) => <Badge key={kind} tone="neutral">{t(kind === 'buying' ? 'pendingPage.inheritedBuying' : 'pendingPage.inheritedSelling')}</Badge>)}</>}>
            {[...missingPrices, ...inheritedPrices].map((kind) => <ButtonLink key={kind} variant="secondary" size="compact" to={priceManagementUrl(item.name, undefined, kind, priceListFor(kind), returnTo)} aria-label={t(kind === 'buying' ? 'pendingPage.addBuyingPriceFor' : 'pendingPage.addSellingPriceFor', { name })}>{t(kind === 'buying' ? 'pendingPage.addBuyingPrice' : 'pendingPage.addSellingPrice')}</ButtonLink>)}
          </PendingRow>
        }) : empty('prices', t('pendingPage.viewCatalog'))}</TabsContent>
        <TabsContent value="templates">{filteredTemplates.length ? list(filteredTemplates, (row) => row.item.name, ({ item }) => <PendingRow item={item} tags={<Badge tone="warning">{t('pendingPage.noVariants')}</Badge>}><ButtonLink variant="secondary" size="compact" to={`/variants/new?template=${encodeURIComponent(item.name)}`}>{t('pendingPage.addVariant')}</ButtonLink></PendingRow>) : empty('templates')}</TabsContent>
        <TabsContent value="margin">{filteredMargins.length ? list(filteredMargins, (row) => row.selling.name, ({ item, selling, purchase, purchaseCost, marginPercentage }) => <PendingRow item={item} meta={`${selling.price_list || t('pendingPage.unknownPriceList')} · ${selling.uom || item.stock_uom || '—'}`} tags={<><Badge tone={marginPercentage < 0 ? 'danger' : 'warning'}>{t('pendingPage.marginValue', { value: marginPercentage.toFixed(1) })}</Badge><span className="pending-figure">{t('pendingPage.sellingPrice')} {formatPrice(selling)}</span><span className="pending-figure">{t('pendingPage.cost')} {formatPrice(purchase, purchaseCost)}</span></>}><ButtonLink variant="secondary" size="compact" to={priceManagementUrl(item.name, selling, 'selling', selling.price_list || preferences.sellingPriceList, returnTo)}>{t('pendingPage.editSalePrice')}</ButtonLink></PendingRow>) : empty('margin')}</TabsContent>
        <TabsContent value="images">{!imagesReady ? <div className="pending-empty-state"><ImageOff aria-hidden="true" /><div><h2>{t('pendingPage.imagesNeedRefresh')}</h2><p>{t('pendingPage.imagesNeedRefreshDescription')}</p></div><Button type="button" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? t('pendingPage.refreshing') : t('pendingPage.refresh')}</Button></div> : filteredMissingImages.length ? list(filteredMissingImages, (row) => row.item.name, ({ item, kind }) => {
          const template = item.variant_of ? itemsByName.get(item.variant_of) : undefined
          return <PendingRow item={item} tags={kind === 'template' ? <Badge tone="neutral">{t('pendingPage.kind.template')}</Badge> : null}>
            {template?.image?.trim() && <Button type="button" variant="secondary" size="compact" onClick={() => { void assignTemplateImage(item, template) }} loading={templateImageItem === item.name} disabled={templateImageItem !== null}>{t('pendingPage.assignTemplateImage')}</Button>}
            <Button type="button" variant="secondary" size="compact" onClick={() => { setImageSaveMessage(''); setImageItem(item) }}><ImagePlus className="size-4" aria-hidden="true" />{t('pendingPage.assignImage')}</Button>
          </PendingRow>
        }) : empty('images')}</TabsContent>
        <TabsContent value="stock">{stockRefreshMessage && <p className="pending-refresh-message" role="status">{stockRefreshMessage}</p>}{stockRefresh.error && <CatalogErrorNotice error={stockRefresh.error} />}{!stock.data ? <div className="pending-empty-state"><CircleAlert aria-hidden="true" /><div><h2>{t('pendingPage.stockCacheMissing')}</h2><p>{t('pendingPage.stockCacheMissingDescription')}</p></div><Button type="button" onClick={() => stockRefresh.mutate()} disabled={stockRefresh.isPending}>{stockRefresh.isPending ? t('pendingPage.stockRefreshing') : t('pendingPage.stockRefresh')}</Button></div> : filteredStockShortages.length ? list(filteredStockShortages, (row) => row.item.name, ({ item, actualQty, projectedQty, safetyStock, status }) => <PendingRow item={item} meta={item.stock_uom} tags={<><Badge tone={status === 'out' ? 'danger' : 'warning'}>{t(`pendingPage.stockStatus.${status}`)}</Badge><span className="pending-figure">{t('pendingPage.actualStock')} {formatQuantity(actualQty)}</span><span className="pending-figure">{t('pendingPage.projectedStock')} {formatQuantity(projectedQty)}</span>{status === 'low' && <span className="pending-figure">{t('pendingPage.safetyStock')} {formatQuantity(safetyStock)}</span>}</>}><StockResolveMenu name={item.item_name || item.name} links={{
          reconcile: `/stock/reconciliation?${new URLSearchParams({ item: item.name, ...(stockWarehouse ? { itemWarehouse: stockWarehouse } : {}), returnTo })}`,
          receive: `/stock/receipt?${new URLSearchParams({ item: item.name, ...(stockWarehouse ? { warehouse: stockWarehouse } : {}), returnTo })}`,
          stock: `/stock?search=${encodeURIComponent(item.name)}`,
          transfer: transferSources.get(item.name) ? { url: client.newDocumentUrl('Stock Entry', { stock_entry_type: 'Material Transfer', from_warehouse: transferSources.get(item.name)!.warehouse, to_warehouse: stockWarehouse }), from: warehouseLabel(transferSources.get(item.name)!.warehouse), qty: formatQuantity(transferSources.get(item.name)!.qty) } : undefined,
          request: client.newDocumentUrl('Material Request', { material_request_type: 'Purchase', set_warehouse: stockWarehouse }),
        }} /></PendingRow>) : empty('stock')}</TabsContent>
        <TabsContent value="data">{filteredIncompleteItems.length ? list(filteredIncompleteItems, (row) => row.item.name, ({ item, missingFields, optionalFields }) => <PendingRow item={item} tags={<>{missingFields.map((field) => <Badge key={field} tone="warning">{t(`pendingPage.fields.${field}`)}</Badge>)}{optionalFields.map((field) => <Badge key={field} tone="neutral">{t(`pendingPage.fields.${field}`)}</Badge>)}</>}><ButtonLink variant="secondary" size="compact" to={`/items/${encodeURIComponent(item.name)}`}>{t('pendingPage.completeItem')}</ButtonLink></PendingRow>) : empty('data')}</TabsContent>
      </Tabs>
      <div className="sr-only" aria-live="polite">{t('pendingPage.count', { count: activeCount })}</div>
    </>}
    <PendingImageEditor key={imageItem?.name ?? 'closed'} client={client} item={imageItem} onClose={() => setImageItem(null)} onSaved={saveItemImage} />
  </section>
}

function StockResolveMenu({ name, links }: { name: string; links: { reconcile: string; receive: string; stock: string; transfer?: { url: string; from: string; qty: string }; request: string } }) {
  const { t } = useTranslation()
  const option = (title: string, hint: string, external = false) => <span className="pending-menu-option"><span>{title}{external && <ExternalLink aria-hidden="true" />}</span><small>{hint}</small></span>
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" variant="secondary" size="compact" aria-label={t('pendingPage.resolveFor', { name })}>{t('pendingPage.resolve')}<ChevronDown className="size-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="pending-menu">
      <DropdownMenuItem asChild><Link to={links.reconcile}>{option(t('pendingPage.resolveActions.reconcile'), t('pendingPage.resolveActions.reconcileHint'))}</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link to={links.receive}>{option(t('pendingPage.resolveActions.receive'), t('pendingPage.resolveActions.receiveHint'))}</Link></DropdownMenuItem>
      {links.transfer && <DropdownMenuItem asChild><a href={links.transfer.url} target="_blank" rel="noreferrer">{option(t('pendingPage.resolveActions.transfer', { warehouse: links.transfer.from }), t('pendingPage.resolveActions.transferHint', { qty: links.transfer.qty }), true)}</a></DropdownMenuItem>}
      <DropdownMenuItem asChild><a href={links.request} target="_blank" rel="noreferrer">{option(t('pendingPage.resolveActions.request'), t('pendingPage.resolveActions.requestHint'), true)}</a></DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild><Link to={links.stock}>{t('pendingPage.viewStock')}</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}

function PendingRow({ item, meta, tags, children }: { item: VariantItem; meta?: string; tags?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation()
  const name = item.item_name || item.name
  const details = [item.name, item.variant_of ? t('pendingPage.variantOf', { name: item.variant_of }) : '', meta ?? ''].filter(Boolean).join(' · ')
  return <article className="pending-row" role="listitem">
    <div className="pending-item-main"><h2 title={name}>{name}</h2><p>{details}</p></div>
    {tags && <div className="pending-item-tags">{tags}</div>}
    <div className="pending-item-actions">{children}</div>
  </article>
}

function PendingEmpty({ search, title, description, linkLabel }: { search: string; title: string; description: string; linkLabel?: string }) {
  return <div className="pending-empty-state"><div><h2>{title}</h2><p>{description}</p>{!search && linkLabel && <Link className="text-sm font-semibold text-[var(--color-primary)] underline underline-offset-4" to="/items">{linkLabel}</Link>}</div></div>
}

function PendingSearchForm({ initialValue, onSearch }: { initialValue: string; onSearch: (value: string) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialValue)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(value.trim())
  }

  return <form className="flex w-full max-w-[24rem] items-center gap-2" role="search" onSubmit={submit}>
    <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={t('pendingPage.search')} aria-label={t('pendingPage.search')} />
    <SearchButton label={t('common.search')} />
  </form>
}
