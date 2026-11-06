import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ButtonLink, FilterButton, Input, Notice, PageHeader, RefreshButton, SearchButton, SegmentedControl, Spinner } from '../components/ui'
import { CatalogErrorNotice, CatalogReadinessNotice, CatalogSearchShortcutHint } from '../components/catalog-guidance'
import { ProductCard } from '../components/product-card'
import { ProductTable } from '../components/product-table'
import { VariantRoots, variantNodeIsVisible } from '../components/variant-tree'
import { FilterSheet } from '../components/filter-sheet'
import { EmptyState, LoadingState } from '../components/ui/states'
import { filterItems, writeItemCatalog } from '../lib/item-cache'
import { buildVariantTree, readVariantCatalog, writeVariantCatalog } from '../lib/variant-cache'
import { readItemSearchDetails } from '../lib/catalog-sync'
import { syncProductCardDetails } from '../lib/product-details-sync'
import type { CachedItem, ItemCatalogCache, VariantItem } from '../lib/types'
import { queryKeys } from '../lib/query-keys'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { cacheStatusLabel, getCacheStatus } from '../lib/cache-policy'
import type { createErpNextClient } from '../lib/erpnext'

type Client = ReturnType<typeof createErpNextClient>
type ProductView = 'table' | 'cards' | 'hierarchy'

export function ProductWorkspacePage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [syncMessage, setSyncMessage] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [detailsPrompt, setDetailsPrompt] = useState(false)
  const [detailsPromptDismissed, setDetailsPromptDismissed] = useState(false)
  const [view, setView] = useState<ProductView>(() => localStorage.getItem(`mauricio-erpnext:products-view:${profileId}`) === 'cards' ? 'cards' : 'table')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const pageLength = 25
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const catalog = useQuery(catalogQueryOptions.item(profileId))
  const prices = useQuery(catalogQueryOptions.price(profileId))
  const variants = useQuery(catalogQueryOptions.variant(profileId))
  const detailsSync = useMutation({ mutationFn: () => syncProductCardDetails(client, profileId, setSyncMessage), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.price(profileId) }); await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.variant(profileId) }); setDetailsPrompt(false); setSyncMessage(t("productsPage.detailsSaved")) }, onError: () => setSyncMessage('') })

  useEffect(() => { localStorage.setItem(`mauricio-erpnext:products-view:${profileId}`, view) }, [profileId, view])

  useEffect(() => {
    const hasVariantDetails = variants.data?.items.some((item) => item.uoms !== undefined || item.attributes !== undefined)
    if (view === 'cards' && prices.isFetched && variants.isFetched && (!prices.data || !hasVariantDetails) && !detailsPromptDismissed) setDetailsPrompt(true)
  }, [detailsPromptDismissed, prices.data, prices.isFetched, variants.data, variants.isFetched, view])

  const refresh = useMutation({ mutationFn: async () => {
    const items: CachedItem[] = []
    let start = 0
    const batchSize = 500
    while (true) {
      setSyncMessage(t("productsPage.syncProgress", { count: items.length }))
      const batch = await client.listDocuments<CachedItem>('Item', { fields: ['name', 'item_code', 'item_name', 'brand', 'item_group', 'stock_uom', 'sales_uom', 'purchase_uom', 'weight_per_unit', 'weight_uom', 'variant_of', 'has_variants', 'disabled'], start, pageLength: batchSize, orderBy: 'modified desc' })
      items.push(...batch.data)
      if (batch.data.length < batchSize) break
      start += batch.data.length
    }
    const baseCache: ItemCatalogCache = { profileId, updatedAt: new Date().toISOString(), items: items.map((item) => ({ ...item, barcodes: [] })) }
    await writeItemCatalog(baseCache)
    queryClient.setQueryData(queryKeys.catalog.item(profileId), baseCache)
    const currentVariantCache = await readVariantCatalog(profileId)
    if (!currentVariantCache?.items.length) {
      const baseVariantCache = { profileId, updatedAt: baseCache.updatedAt, items: items as VariantItem[] }
      await writeVariantCatalog(baseVariantCache)
      queryClient.setQueryData(queryKeys.catalog.variant(profileId), baseVariantCache)
    }
    const searchDetails = await readItemSearchDetails(client, items, setSyncMessage)
    const next: ItemCatalogCache = { profileId, updatedAt: new Date().toISOString(), items: items.map((item) => ({ ...item, ...(searchDetails[item.name] ?? { barcodes: [] }) })) }
    return writeItemCatalog(next)
  }, onSuccess: (next) => { queryClient.setQueryData(queryKeys.catalog.item(profileId), next); setSyncMessage(t("productsPage.syncComplete", { count: next.items.length })) }, onError: () => setSyncMessage('') })

  const filtered = useMemo(() => filterItems(catalog.data?.items ?? [], search), [catalog.data?.items, search])
  const hierarchyItems = useMemo(() => (variants.data?.items ?? catalog.data?.items ?? []) as VariantItem[], [catalog.data?.items, variants.data?.items])
  const hierarchyTree = useMemo(() => buildVariantTree(hierarchyItems), [hierarchyItems])
  const hierarchyRoots = useMemo(() => hierarchyTree.roots.filter((item) => variantNodeIsVisible(item, hierarchyTree.children, false, search)), [hierarchyTree, search])
  const expandableNames = useMemo(() => hierarchyItems.filter((item) => (hierarchyTree.children.get(item.name) ?? []).length > 0).map((item) => item.name), [hierarchyItems, hierarchyTree.children])
  const allExpanded = expandableNames.length > 0 && expandableNames.every((name) => expanded.has(name))
  const rows = filtered.slice(page * pageLength, (page + 1) * pageLength)
  const hasCache = Boolean(catalog.data)
  const catalogStatus = cacheStatusLabel(getCacheStatus('catalog', catalog.data))
  const hasVariantDetails = variants.data?.items.some((item) => item.uoms !== undefined && item.attributes !== undefined) ?? false
  const variantDetailsMissing = hasCache && variants.isFetched && !variants.isError && !hasVariantDetails
  const updated = catalog.data ? `${new Date(catalog.data.updatedAt).toLocaleString()} · ${catalogStatus}` : ''

  function changeView(next: ProductView) {
    setView(next)
    setPage(0)
    if (next === 'table') setDetailsPromptDismissed(false)
    if (next === 'hierarchy') setExpanded(new Set())
  }

  return <section className="product-workspace"><PageHeader title={t("productsPage.title")} description={t("productsPage.description")} action={<div className="flex flex-wrap gap-2"><ButtonLink to="/items/new">{t("productsPage.newProduct")}</ButtonLink><RefreshButton label={t("productsPage.refresh")} onClick={() => refresh.mutate()} loading={refresh.isPending} /></div>} toolbar={<><form className="product-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(0) }}><Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("productsPage.searchPlaceholder")} aria-label={t("productsPage.searchLabel")} /><SearchButton label={t("productsPage.searchLabel")} /></form><CatalogSearchShortcutHint /><FilterSheet trigger={<FilterButton label={t("productsPage.filterButton")} expanded={filtersOpen} onClick={() => setFiltersOpen(true)} />} title={t("productsPage.filterTitle")} description={t("productsPage.filterDescription")} open={filtersOpen} onOpenChange={setFiltersOpen}><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t("productsPage.filterPlaceholder")} aria-label={t("productsPage.filterLabel")} /><Button type="button" onClick={() => { setSearch(searchInput.trim()); setPage(0); setFiltersOpen(false) }}>{t("productsPage.applyFilter")}</Button><Button type="button" variant="secondary" onClick={() => { setSearchInput(''); setSearch(''); setPage(0); setFiltersOpen(false) }}>{t("productsPage.clearFilter")}</Button></FilterSheet></>} status={<div className="page-header-status-row"><div className="page-header-status-items"><span>{hasCache ? t("productsPage.cachedProducts", { count: catalog.data?.items.length ?? 0 }) : t("productsPage.notDownloaded")}</span>{search && <span>{t("productsPage.filterStatus", { value: search })}</span>}{updated && <span>{t("productsPage.updated", { value: updated })}</span>}{syncMessage && <span className="font-medium text-blue-700">{syncMessage}</span>}</div><SegmentedControl label={t("productsPage.view")} value={view} options={[{ value: 'table', label: t("productsPage.table") }, { value: 'cards', label: t("productsPage.cards") }, { value: 'hierarchy', label: t("productsPage.hierarchy") }]} onChange={changeView} /></div>} /><div className="card product-workspace-card overflow-hidden">
    {detailsPrompt ? <div className="mb-4"><CatalogReadinessNotice title={t("productsPage.detailsTitle")} description={t("productsPage.detailsDescription")} action={detailsSync.isPending ? t("productsPage.loadingData") : t("productsPage.loadAndCache")} onAction={() => detailsSync.mutate()} disabled={detailsSync.isPending} dismiss={{ label: t("productsPage.notNow"), onClick: () => { setDetailsPrompt(false); setDetailsPromptDismissed(true) } }} /></div> : variantDetailsMissing && <div className="mb-4"><CatalogReadinessNotice title={t("catalogGuidance.productDetailsTitle")} description={t("catalogGuidance.productDetailsDescription")} action={t("catalogGuidance.openVariants")} to="/variants" /></div>}
    {catalog.isError && <div className="p-4"><CatalogErrorNotice error={catalog.error} /></div>}{refresh.isError && <div className="p-4"><CatalogErrorNotice error={refresh.error} onRetry={() => refresh.mutate()} /></div>}{detailsSync.isError && <div className="p-4"><CatalogErrorNotice error={detailsSync.error} onRetry={() => detailsSync.mutate()} /></div>}
    {catalog.isPending ? <LoadingState /> : !hasCache ? <EmptyState title={t("productsPage.emptyTitle")} description={t("productsPage.emptyDescription")} /> : rows.length === 0 ? <EmptyState title={t("productsPage.noResults")} /> : view === 'hierarchy' ? <div className="variants-tree divide-y divide-slate-100 overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 p-4"><span className="text-sm font-medium">{t("productsPage.hierarchyTitle")}</span><Button type="button" variant="secondary" size="compact" onClick={() => setExpanded(allExpanded ? new Set() : new Set(expandableNames))} disabled={!expandableNames.length}>{allExpanded ? t("productsPage.collapseAll") : t("productsPage.expandAll")}</Button></div><VariantRoots items={hierarchyRoots} childrenByParent={hierarchyTree.children} uomOnly={false} search={search} expanded={expanded} onToggle={(name) => setExpanded((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next })} /></div> : view === 'cards' ? <div className="product-card-list">{rows.map((row) => <ProductCard key={String(row.name)} item={row} prices={prices.data?.prices ?? []} variant={variants.data?.items.find((item) => item.name === row.name)} onOpen={() => navigate(`/items/${encodeURIComponent(String(row.name))}`)} />)}</div> : <ProductTable items={rows} prices={prices.data?.prices ?? []} variants={variants.data?.items ?? []} profileId={profileId} onOpen={(name) => navigate(`/items/${encodeURIComponent(name)}`)} onUom={(name) => navigate(`/items/${encodeURIComponent(name)}/uoms`)} />}
    <div className="product-pagination"><span className="muted">{t("productsPage.page", { page: page + 1, count: filtered.length })}</span><div className="product-pagination-actions"><Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t("productsPage.previous")}</Button><Button variant="secondary" disabled={(page + 1) * pageLength >= filtered.length} onClick={() => setPage((p) => p + 1)}>{t("productsPage.next")}</Button></div></div>
  </div></section>
}
