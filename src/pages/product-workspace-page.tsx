import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Button, ButtonLink, PageHeader, RefreshButton, SearchButton, SearchInput } from '../components/ui'
import { CatalogErrorNotice, CatalogReadinessNotice } from '../components/catalog-guidance'
import { ProductTable } from '../components/product-table'
import { ProductFilterSheet } from '../components/product-filter-sheet'
import { useFamilyExpansion } from '../components/use-family-expansion'
import { EmptyState, LoadingState } from '../components/ui/states'
import { useCatalogCacheRefresh } from '../components/use-managed-cache-refresh'
import { filterItems } from '../lib/item-cache'
import type { ItemCatalogCache } from '../lib/types'
import { queryKeys } from '../lib/query-keys'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { relativeAge } from '../lib/relative-time'
import type { createErpNextClient } from '../lib/erpnext'
import { readPosPreferences } from '../lib/pos-preferences'
import { countProductFilters, emptyProductFilters, filterProducts, groupProductFamilies, productFamilyIndex, readProductFilters, salePriceCodes, writeProductFilters, type ProductFilters } from '../lib/product-list'

type Client = ReturnType<typeof createErpNextClient>

const staleNoticeMs = 24 * 60 * 60 * 1000

export function ProductWorkspacePage({ client, profileId }: { client: Client; profileId: string }) {
  const { t, i18n } = useTranslation()
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

  const filters = useMemo(() => readProductFilters(searchParams), [searchParams])
  function updateListParams(next: { search?: string; page?: number; filters?: ProductFilters }) {
    const params = new URLSearchParams(searchParams)
    if (next.filters) writeProductFilters(params, next.filters)
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
  const variantItems = useMemo(() => variants.data?.items ?? [], [variants.data?.items])
  const familyIndex = useMemo(() => productFamilyIndex(variantItems), [variantItems])
  const priceList = useMemo(() => prices.data?.prices ?? [], [prices.data?.prices])
  const withSalePrice = useMemo(() => salePriceCodes(priceList), [priceList])
  const filtered = useMemo(() => filterProducts(filterItems(catalog.data?.items ?? [], search), filters, familyIndex, withSalePrice), [catalog.data?.items, search, filters, familyIndex, withSalePrice])
  // Pages hold whole families, so a template and its variants never split across pages.
  const families = useMemo(() => groupProductFamilies(catalog.data?.items ?? [], filtered, familyIndex), [catalog.data?.items, filtered, familyIndex])
  const rows = families.slice(page * pageLength, (page + 1) * pageLength)
  const filterCount = countProductFilters(filters)
  // Searching or filtering opens the families it found, page by page; a plain list starts collapsed.
  const listQuery = search || filterCount ? JSON.stringify([search, filters, page]) : ''
  const expansion = useFamilyExpansion(rows.filter((family) => family.children.length > 0).map((family) => String(family.item.name)), listQuery)
  const filterOptions = useMemo(() => {
    const distinct = (values: unknown[]) => [...new Set(values.filter((value): value is string => typeof value === 'string' && value !== ''))].sort((a, b) => a.localeCompare(b))
    const items = catalog.data?.items ?? []
    return { groups: distinct(items.map((item) => item.item_group)), brands: distinct(items.map((item) => item.brand)), salePrices: priceList.length > 0 }
  }, [catalog.data?.items, priceList.length])
  const kindLabels = { template: t('productsPage.filters.template'), variant: t('productsPage.filters.variant'), single: t('productsPage.filters.single') }
  const filterChips: { key: keyof ProductFilters; label: string }[] = [
    ...(filters.group ? [{ key: 'group' as const, label: `${t('common.itemGroup')}: ${filters.group}` }] : []),
    ...(filters.brand ? [{ key: 'brand' as const, label: `${t('common.brand')}: ${filters.brand}` }] : []),
    ...(filters.type ? [{ key: 'type' as const, label: `${t('common.type')}: ${kindLabels[filters.type]}` }] : []),
    ...(filters.status ? [{ key: 'status' as const, label: `${t('common.status')}: ${filters.status === 'active' ? t('common.active') : t('common.disabled')}` }] : []),
    ...(filters.noSalePrice ? [{ key: 'noSalePrice' as const, label: t('productsPage.filters.noSalePrice') }] : []),
  ]
  function applyFilters(next: ProductFilters) { updateListParams({ filters: next, page: 0 }) }
  function clearAll() { setSearchInput(''); updateListParams({ search: '', filters: emptyProductFilters, page: 0 }) }
  const hasCache = Boolean(catalog.data)
  const hasVariantDetails = variants.data?.items.some((item) => item.uoms !== undefined && item.attributes !== undefined) ?? false
  const variantDetailsMissing = hasCache && variants.isFetched && !variants.isError && !hasVariantDetails
  const updatedAt = catalog.data?.updatedAt
  const updatedAge = relativeAge(updatedAt, i18n.language)
  // A catalog downloaded a day ago or more may carry old prices; say so where it can't be missed.
  const catalogOld = updatedAt ? Date.now() - Date.parse(updatedAt) >= staleNoticeMs : false
  const totalPages = Math.max(1, Math.ceil(families.length / pageLength))
  const cardRef = useRef<HTMLDivElement>(null)
  // Paging from the bottom bar takes the user back to the top of the list, with focus on it for keyboard users.
  function goToPage(next: number) {
    updateListParams({ page: next })
    requestAnimationFrame(() => { cardRef.current?.scrollIntoView({ block: 'start' }); cardRef.current?.focus({ preventScroll: true }) })
  }
  function clearSearch() { setSearchInput(''); applySearch('') }

  // A page beyond the results (catalog shrank or a stale URL) falls back to the last page.
  useEffect(() => {
    if (!catalog.data || page === 0 || page * pageLength < families.length) return
    updateListParams({ page: Math.max(0, Math.ceil(families.length / pageLength) - 1) })
  })

  const newProduct = <ButtonLink to="/items/new" className="product-new-action">{t("productsPage.newProduct")}</ButtonLink>
  return <section className="product-workspace"><PageHeader title={t("productsPage.title")} description={t("productsPage.description")} mobileAction={newProduct} action={<div className="flex flex-wrap gap-2"><ButtonLink to={search ? `/variants?search=${encodeURIComponent(search)}` : '/variants'} variant="secondary">{t("productsPage.viewHierarchy")}</ButtonLink>{newProduct}<RefreshButton label={t("productsPage.refresh")} onClick={refreshCatalog} loading={refresh.isPending} /></div>} toolbar={<><form className="product-search" onSubmit={(event) => { event.preventDefault(); applySearch(searchInput) }}><SearchInput value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onClear={clearSearch} clearable={Boolean(search)} placeholder={t("productsPage.searchPlaceholder")} aria-label={t("productsPage.searchLabel")} /><SearchButton label={t("productsPage.searchLabel")} /></form><ProductFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} filters={filters} options={filterOptions} onChange={applyFilters} /></>} status={<div className="page-header-status-row"><div className="page-header-status-items"><span>{hasCache ? t("productsPage.cachedProducts", { count: catalog.data?.items.length ?? 0 }) : t("productsPage.notDownloaded")}</span>{search && <span>{t("productsPage.filterStatus", { value: search })}</span>}{filterChips.length > 0 && <span className="product-filter-chips">{filterChips.map((chip) => <button key={chip.key} type="button" className="product-filter-chip" aria-label={t('productsPage.filters.remove', { filter: chip.label })} onClick={() => applyFilters({ ...filters, [chip.key]: emptyProductFilters[chip.key] })}>{chip.label}<X aria-hidden="true" /></button>)}</span>}{updatedAt && updatedAge && <span title={new Date(updatedAt).toLocaleString(i18n.language === 'en' ? 'en-US' : 'es-MX')}>{t("productsPage.updatedAgo", { age: updatedAge })}</span>}{syncMessage && <span className="font-medium text-blue-700">{syncMessage}</span>}</div></div>} /><div ref={cardRef} tabIndex={-1} aria-label={t("productsPage.title")} className="card product-workspace-card overflow-hidden">
    {catalogOld && updatedAge && !refresh.isPending && <div className="p-4 pb-0"><CatalogReadinessNotice title={t("productsPage.oldCatalogTitle")} description={t("productsPage.oldCatalogDescription", { age: updatedAge })} action={t("productsPage.refresh")} onAction={refreshCatalog} /></div>}
    {variantDetailsMissing && <div className="mb-4"><CatalogReadinessNotice title={t("catalogGuidance.productDetailsTitle")} description={t("catalogGuidance.productDetailsDescription")} action={t("catalogGuidance.openVariants")} to="/variants" /></div>}
    {catalog.isError && <div className="p-4"><CatalogErrorNotice error={catalog.error} /></div>}{refresh.isError && <div className="p-4"><CatalogErrorNotice error={refresh.error} onRetry={refreshCatalog} /></div>}
    {catalog.isPending ? <LoadingState /> : !hasCache ? <EmptyState title={t("productsPage.emptyTitle")} description={t("productsPage.emptyDescription")} /> : rows.length === 0 ? <EmptyState title={t("productsPage.noResults")} description={search || filterCount ? t('productsPage.noResultsDescription') : undefined} action={search || filterCount ? <Button type="button" variant="secondary" onClick={clearAll}>{t('productsPage.clearSearchAndFilters')}</Button> : undefined} /> : <ProductTable families={rows} expansion={expansion} familyIndex={familyIndex} prices={priceList} variants={variantItems} profileId={profileId} client={client} showImages={showProductImages} onOpen={(name) => navigate(`/items/${encodeURIComponent(name)}`)} onUom={(name) => navigate(`/items/${encodeURIComponent(name)}/uoms`)} />}
    <div className="product-pagination"><span className="muted">{t("productsPage.pageOf", { page: page + 1, totalPages, count: filtered.length })}</span><div className="product-pagination-actions"><Button variant="secondary" disabled={page === 0} onClick={() => goToPage(page - 1)}>{t("productsPage.previous")}</Button><Button variant="secondary" disabled={(page + 1) * pageLength >= families.length} onClick={() => goToPage(page + 1)}>{t("productsPage.next")}</Button></div></div>
  </div></section>
}
