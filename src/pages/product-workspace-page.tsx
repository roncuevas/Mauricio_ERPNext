import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ButtonLink, FilterButton, Input, PageHeader, RefreshButton, SearchButton } from '../components/ui'
import { CatalogErrorNotice, CatalogReadinessNotice } from '../components/catalog-guidance'
import { ProductTable } from '../components/product-table'
import { FilterSheet } from '../components/filter-sheet'
import { EmptyState, LoadingState } from '../components/ui/states'
import { useCatalogCacheRefresh } from '../components/use-managed-cache-refresh'
import { filterItems } from '../lib/item-cache'
import type { ItemCatalogCache } from '../lib/types'
import { queryKeys } from '../lib/query-keys'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { cacheStatusLabel, getCacheStatus } from '../lib/cache-policy'
import type { createErpNextClient } from '../lib/erpnext'
import { readPosPreferences } from '../lib/pos-preferences'

type Client = ReturnType<typeof createErpNextClient>

export function ProductWorkspacePage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  // Search and page live in the URL so returning from an item keeps the list where it was.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const page = Math.max(0, (Number(searchParams.get('page')) || 1) - 1)
  const [searchInput, setSearchInput] = useState(search)
  const [syncMessage, setSyncMessage] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const showProductImages = readPosPreferences(profileId).showProductImages
  const pageLength = 25
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const catalog = useQuery(catalogQueryOptions.item(profileId))
  const prices = useQuery(catalogQueryOptions.price(profileId))
  const variants = useQuery(catalogQueryOptions.variant(profileId))
  const refresh = useCatalogCacheRefresh({ client, profileId, onProgress: setSyncMessage })

  useEffect(() => { setSearchInput(search) }, [search])

  function updateListParams(next: { search?: string; page?: number }) {
    const params = new URLSearchParams(searchParams)
    const nextSearch = next.search ?? search
    const nextPage = next.page ?? page
    if (nextSearch) params.set('search', nextSearch); else params.delete('search')
    if (nextPage > 0) params.set('page', String(nextPage + 1)); else params.delete('page')
    setSearchParams(params, { replace: true })
  }
  function applySearch(value: string) { updateListParams({ search: value.trim(), page: 0 }) }
  function refreshCatalog() {
    refresh.mutate(['products'], {
      onSuccess: () => setSyncMessage(t('productsPage.syncComplete', { count: queryClient.getQueryData<ItemCatalogCache>(queryKeys.catalog.item(profileId))?.items.length ?? 0 })),
      onError: () => setSyncMessage(''),
    })
  }
  const filtered = useMemo(() => filterItems(catalog.data?.items ?? [], search), [catalog.data?.items, search])
  const variantItems = useMemo(() => variants.data?.items ?? [], [variants.data?.items])
  const rows = filtered.slice(page * pageLength, (page + 1) * pageLength)
  const hasCache = Boolean(catalog.data)
  const catalogStatus = cacheStatusLabel(getCacheStatus('catalog', catalog.data))
  const hasVariantDetails = variants.data?.items.some((item) => item.uoms !== undefined && item.attributes !== undefined) ?? false
  const variantDetailsMissing = hasCache && variants.isFetched && !variants.isError && !hasVariantDetails
  const updated = catalog.data ? `${new Date(catalog.data.updatedAt).toLocaleString()} · ${catalogStatus}` : ''

  // A page beyond the results (catalog shrank or a stale URL) falls back to the last page.
  useEffect(() => {
    if (!catalog.data || page === 0 || page * pageLength < filtered.length) return
    updateListParams({ page: Math.max(0, Math.ceil(filtered.length / pageLength) - 1) })
  })

  return <section className="product-workspace"><PageHeader title={t("productsPage.title")} description={t("productsPage.description")} action={<div className="flex flex-wrap gap-2"><ButtonLink to={search ? `/variants?search=${encodeURIComponent(search)}` : '/variants'} variant="secondary">{t("productsPage.viewHierarchy")}</ButtonLink><ButtonLink to="/items/new">{t("productsPage.newProduct")}</ButtonLink><RefreshButton label={t("productsPage.refresh")} onClick={refreshCatalog} loading={refresh.isPending} /></div>} toolbar={<><form className="product-search" onSubmit={(event) => { event.preventDefault(); applySearch(searchInput) }}><Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("productsPage.searchPlaceholder")} aria-label={t("productsPage.searchLabel")} /><SearchButton label={t("productsPage.searchLabel")} /></form><FilterSheet trigger={<FilterButton label={t("productsPage.filterButton")} expanded={filtersOpen} onClick={() => setFiltersOpen(true)} />} title={t("productsPage.filterTitle")} description={t("productsPage.filterDescription")} open={filtersOpen} onOpenChange={setFiltersOpen}><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t("productsPage.filterPlaceholder")} aria-label={t("productsPage.filterLabel")} /><Button type="button" onClick={() => { applySearch(searchInput); setFiltersOpen(false) }}>{t("productsPage.applyFilter")}</Button><Button type="button" variant="secondary" onClick={() => { setSearchInput(''); applySearch(''); setFiltersOpen(false) }}>{t("productsPage.clearFilter")}</Button></FilterSheet></>} status={<div className="page-header-status-row"><div className="page-header-status-items"><span>{hasCache ? t("productsPage.cachedProducts", { count: catalog.data?.items.length ?? 0 }) : t("productsPage.notDownloaded")}</span>{search && <span>{t("productsPage.filterStatus", { value: search })}</span>}{updated && <span>{t("productsPage.updated", { value: updated })}</span>}{syncMessage && <span className="font-medium text-blue-700">{syncMessage}</span>}</div></div>} /><div className="card product-workspace-card overflow-hidden">
    {variantDetailsMissing && <div className="mb-4"><CatalogReadinessNotice title={t("catalogGuidance.productDetailsTitle")} description={t("catalogGuidance.productDetailsDescription")} action={t("catalogGuidance.openVariants")} to="/variants" /></div>}
    {catalog.isError && <div className="p-4"><CatalogErrorNotice error={catalog.error} /></div>}{refresh.isError && <div className="p-4"><CatalogErrorNotice error={refresh.error} onRetry={refreshCatalog} /></div>}
    {catalog.isPending ? <LoadingState /> : !hasCache ? <EmptyState title={t("productsPage.emptyTitle")} description={t("productsPage.emptyDescription")} /> : rows.length === 0 ? <EmptyState title={t("productsPage.noResults")} /> : <ProductTable items={rows} prices={prices.data?.prices ?? []} variants={variantItems} profileId={profileId} client={client} showImages={showProductImages} onOpen={(name) => navigate(`/items/${encodeURIComponent(name)}`)} onUom={(name) => navigate(`/items/${encodeURIComponent(name)}/uoms`)} />}
    <div className="product-pagination"><span className="muted">{t("productsPage.page", { page: page + 1, count: filtered.length })}</span><div className="product-pagination-actions"><Button variant="secondary" disabled={page === 0} onClick={() => updateListParams({ page: page - 1 })}>{t("productsPage.previous")}</Button><Button variant="secondary" disabled={(page + 1) * pageLength >= filtered.length} onClick={() => updateListParams({ page: page + 1 })}>{t("productsPage.next")}</Button></div></div>
  </div></section>
}
