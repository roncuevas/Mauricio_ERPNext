import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageSearch, RefreshCw } from 'lucide-react'
import { Badge, Button, ButtonLink, Field, Input, Notice, PageHeader, RefreshButton, SearchButton } from '../components/ui'
import { StockDocumentNotice } from '../components/stock-document'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
import { ProductCellContent, ResponsiveCell, ResponsiveRow, ResponsiveTable, type ResponsiveColumn } from '../components/responsive-table'
import { StockFilterSheet } from '../components/stock-filter-sheet'
import { createErpNextClient } from '../lib/erpnext'
import { activeWarehouses, loadStockData, paginateStock, stockErrorMessage, stockReturnQuery, stockSearch, visibleStockBins } from '../lib/stock'
import { readStockCache, writeStockCache } from '../lib/stock-cache'
import { queryKeys } from '../lib/query-keys'
import { catalogQueryOptions } from '../lib/catalog-query-options'

type Client = ReturnType<typeof createErpNextClient>

const number = (value: number | undefined) => Number(value ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 3 })

export function StockPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient(); const [searchParams, setSearchParams] = useSearchParams()
  const stockQuery = useQuery({ queryKey: queryKeys.catalog.stock(profileId), queryFn: () => readStockCache(profileId), staleTime: Infinity })
  const variantsQuery = useQuery(catalogQueryOptions.variant(profileId))
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? ''); const [syncMessage, setSyncMessage] = useState(''); const [filtersOpen, setFiltersOpen] = useState(false)
  const refresh = useMutation({ mutationFn: async () => { const data = await loadStockData(client, setSyncMessage); return writeStockCache({ profileId, updatedAt: new Date().toISOString(), ...data }) }, onSuccess: async (next) => { queryClient.setQueryData(queryKeys.catalog.stock(profileId), next); await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.stock(profileId), refetchType: 'active' }); setSyncMessage('') }, onError: (error) => setSyncMessage(stockErrorMessage(error)) })
  const cache = stockQuery.data; const items = useMemo(() => cache?.items?.length ? cache.items : variantsQuery.data?.items ?? [], [cache?.items, variantsQuery.data?.items])
  const itemsByName = useMemo(() => new Map(items.map((item) => [item.name, item])), [items])
  const company = searchParams.get('company') ?? ''; const warehouse = searchParams.get('warehouse') ?? ''; const search = searchParams.get('search') ?? ''; const page = Number(searchParams.get('page') ?? '1') || 1
  const warehouses = useMemo(() => activeWarehouses(cache?.warehouses ?? [], company), [cache?.warehouses, company])
  // Each warehouse values its stock in its company's currency.
  const currencyByWarehouse = useMemo(() => {
    const currencies = new Map((cache?.companies ?? []).map((candidate) => [candidate.name, candidate.default_currency || 'MXN']))
    return new Map((cache?.warehouses ?? []).map((candidate) => [candidate.name, currencies.get(candidate.company ?? '') ?? 'MXN']))
  }, [cache?.companies, cache?.warehouses])
  const money = (value: number | undefined, warehouseName: string) => Number(value ?? 0).toLocaleString('es-MX', { style: 'currency', currency: currencyByWarehouse.get(warehouseName) ?? 'MXN' })
  const filtered = useMemo(() => stockSearch(visibleStockBins(cache?.bins ?? [], items, warehouses).filter((bin) => !warehouse || bin.warehouse === warehouse), items, search).sort((a, b) => a.warehouse.localeCompare(b.warehouse, 'es') || a.item_code.localeCompare(b.item_code, 'es')), [cache?.bins, items, search, warehouse, warehouses]); const paged = paginateStock(filtered, page)
  const update = (values: Record<string, string>) => setSearchParams({ ...(company ? { company } : {}), ...(warehouse ? { warehouse } : {}), ...(search ? { search } : {}), ...values })
  const returnQuery = stockReturnQuery(searchParams); const withQuery = (path: string) => `${path}${returnQuery ? `?${returnQuery}` : ''}`
  const adjustPath = (itemCode: string, binWarehouse: string) => { const query = new URLSearchParams(returnQuery); query.set('item', itemCode); query.set('itemWarehouse', binWarehouse); return `/stock/reconciliation?${query}` }
  const hasFilters = Boolean(company || warehouse || search)
  const receiveAction = <ButtonLink to={withQuery('/stock/receipt')} className="stock-receive-action">{t('stockPage.receive')}</ButtonLink>

  const columns: ResponsiveColumn[] = [
    { id: 'product', label: t('stockPage.product') },
    { id: 'warehouse', label: t('stockPage.warehouseColumn') },
    { id: 'stock', label: t('stockPage.stock'), align: 'end' },
    { id: 'reserved', label: t('stockPage.reserved'), align: 'end' },
    { id: 'projected', label: t('stockPage.projected'), align: 'end' },
    { id: 'cost', label: t('stockPage.cost'), align: 'end' },
    { id: 'value', label: t('stockPage.value'), align: 'end' },
    { id: 'actions', label: t('stockPage.actions'), hidden: true, className: 'stock-col-actions' },
  ]

  return <section className="stock-workspace">
    <PageHeader title={t('stockPage.title')} description={t('stockPage.description')} mobileAction={receiveAction} action={<>{receiveAction}<ButtonLink to={withQuery('/stock/reconciliation')} variant="secondary">{t('stockPage.reconcile')}</ButtonLink><RefreshButton label={t('stockPage.refresh')} onClick={() => refresh.mutate()} loading={refresh.isPending} /></>} />
    <StockDocumentNotice documentUrl={client.documentUrl} />
    {stockQuery.isLoading && <div className="stock-loading" aria-busy="true" aria-label={t('stockPage.loadingCatalog')}><Skeleton className="h-24 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
    {!stockQuery.isLoading && !cache && <Empty className="stock-empty">
      <PackageSearch aria-hidden="true" className="stock-lines-empty-icon" />
      <EmptyHeader><EmptyTitle>{t('stockPage.notDownloaded')}</EmptyTitle><EmptyDescription>{t('stockPage.downloadHint')}</EmptyDescription></EmptyHeader>
      <Button type="button" onClick={() => refresh.mutate()} loading={refresh.isPending}><RefreshCw aria-hidden="true" />{t('stockPage.download')}</Button>
      {refresh.isPending && syncMessage && <p className="muted text-sm" role="status">{syncMessage}</p>}
    </Empty>}
    {cache && <>
      <div className="stock-controls card"><div className="stock-filter-grid"><Field label={t('stockPage.company')}><Select value={company || '__all__'} onValueChange={(value) => update({ company: value === '__all__' ? '' : value, warehouse: '', page: '1' })}><SelectTrigger className="stock-select-trigger" aria-label={t('stockPage.company')}><SelectValue /></SelectTrigger><SelectContent align="start"><SelectItem value="__all__">{t('stockPage.allCompanies')}</SelectItem>{cache.companies.map((item) => <SelectItem key={item.name} value={item.name}>{item.company_name || item.name}</SelectItem>)}</SelectContent></Select></Field><Field label={t('stockPage.warehouse')}><Select value={warehouse || '__all__'} onValueChange={(value) => update({ warehouse: value === '__all__' ? '' : value, page: '1' })}><SelectTrigger className="stock-select-trigger" aria-label={t('stockPage.warehouse')}><SelectValue /></SelectTrigger><SelectContent align="start"><SelectItem value="__all__">{t('stockPage.allWarehouses')}</SelectItem>{warehouses.map((item) => <SelectItem key={item.name} value={item.name}>{item.warehouse_name || item.name}</SelectItem>)}</SelectContent></Select></Field><form className="stock-search" onSubmit={(event) => { event.preventDefault(); update({ search: searchInput.trim(), page: '1' }) }}><Field label={t('stockPage.product')}><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t('stockPage.searchPlaceholder')} /></Field><SearchButton label={t('stockPage.search')} /><StockFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} company={company} warehouse={warehouse} search={searchInput} companies={cache.companies} warehouses={warehouses} onCompany={(value) => update({ company: value, warehouse: '', page: '1' })} onWarehouse={(value) => update({ warehouse: value, page: '1' })} onSearch={setSearchInput} onApply={() => { update({ search: searchInput.trim(), page: '1' }); setFiltersOpen(false) }} /></form></div>
        <div className="stock-summary"><span>{t('stockPage.realStock', { count: filtered.length })}</span><span>{t('stockPage.warehouses', { count: warehouses.length })}</span><span role="status">{syncMessage || t('stockPage.updated', { date: new Date(cache.updatedAt).toLocaleString() })}</span></div>
      </div>
      {paged.rows.length ? <ResponsiveTable label={t('stockPage.title')} columns={columns} className="stock-table">
        {paged.rows.map((bin) => {
          const item = itemsByName.get(bin.item_code); const projected = Number(bin.projected_qty ?? 0)
          const label = item?.item_name || bin.item_code
          return <ResponsiveRow key={`${bin.warehouse}-${bin.item_code}`}>
            <ResponsiveCell role="primary"><ProductCellContent name={label} code={bin.item_code} detail={item?.stock_uom || t('stockPage.noUom')} /></ResponsiveCell>
            <ResponsiveCell label={t('stockPage.warehouseColumn')}>{bin.warehouse}</ResponsiveCell>
            <ResponsiveCell label={t('stockPage.stock')} align="end" role="emphasis">{number(bin.actual_qty)}</ResponsiveCell>
            <ResponsiveCell label={t('stockPage.reserved')} align="end">{number(bin.reserved_qty)}</ResponsiveCell>
            <ResponsiveCell label={t('stockPage.projected')} align="end">{projected < 0 ? <Badge tone="danger">{number(projected)}</Badge> : number(projected)}</ResponsiveCell>
            <ResponsiveCell label={t('stockPage.cost')} align="end">{money(bin.valuation_rate, bin.warehouse)}</ResponsiveCell>
            <ResponsiveCell label={t('stockPage.value')} align="end">{money(bin.stock_value, bin.warehouse)}</ResponsiveCell>
            <ResponsiveCell role="actions"><ButtonLink to={adjustPath(bin.item_code, bin.warehouse)} variant="secondary" size="compact" aria-label={t('stockPage.adjustProduct', { product: label })}>{t('stockPage.adjust')}</ButtonLink></ResponsiveCell>
          </ResponsiveRow>
        })}
      </ResponsiveTable> : <Empty className="stock-empty">
        <EmptyHeader><EmptyTitle>{t('stockPage.noResults')}</EmptyTitle><EmptyDescription>{t(hasFilters ? 'stockPage.noResultsFiltered' : 'stockPage.noResultsHint')}</EmptyDescription></EmptyHeader>
        {hasFilters && <Button type="button" variant="secondary" onClick={() => { setSearchInput(''); setSearchParams({}) }}>{t('stockPage.clearFilters')}</Button>}
      </Empty>}
      {paged.totalPages > 1 && <nav className="stock-pagination" aria-label={t('stockPage.pagination')}><Button variant="secondary" disabled={paged.page <= 1} onClick={() => update({ page: String(paged.page - 1) })}>{t('stockPage.previous')}</Button><span>{t('stockPage.page', { page: paged.page, totalPages: paged.totalPages, count: filtered.length })}</span><Button variant="secondary" disabled={paged.page >= paged.totalPages} onClick={() => update({ page: String(paged.page + 1) })}>{t('stockPage.next')}</Button></nav>}
    </>}
    {stockQuery.isError && <Notice>{stockErrorMessage(stockQuery.error)}</Notice>}{refresh.isError && <Notice>{stockErrorMessage(refresh.error)}</Notice>}
  </section>
}
