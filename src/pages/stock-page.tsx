import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ButtonLink, Field, Input, Notice, PageHeader, RefreshButton, SearchButton } from '../components/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { StockFilterSheet } from '../components/stock-filter-sheet'
import { createErpNextClient } from '../lib/erpnext'
import { activeWarehouses, loadStockData, paginateStock, stockErrorMessage, stockReturnQuery, stockSearch, visibleStockBins } from '../lib/stock'
import { readStockCache, writeStockCache } from '../lib/stock-cache'
import { queryKeys } from '../lib/query-keys'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import type { StockBin, VariantItem } from '../lib/types'

type Client = ReturnType<typeof createErpNextClient>


function money(value: number | undefined) { return Number(value ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) }

function StockCard({ bin, item, adjustPath }: { bin: StockBin; item?: VariantItem; adjustPath: string }) {
  const { t } = useTranslation()
  return <article className="stock-card"><div className="stock-card-heading"><div><span className="stock-card-warehouse">{bin.warehouse}</span><strong>{item?.item_name || bin.item_code}</strong><small>{bin.item_code} · {item?.stock_uom || t('stockPage.noUom')}</small></div><div className="stock-card-current"><span>{t('stockPage.stock')}</span><strong>{Number(bin.actual_qty ?? 0).toLocaleString('es-MX')}</strong></div></div><div className="stock-card-metrics"><span><small>{t('stockPage.reserved')}</small><strong>{Number(bin.reserved_qty ?? 0).toLocaleString('es-MX')}</strong></span><span><small>{t('stockPage.projected')}</small><strong>{Number(bin.projected_qty ?? 0).toLocaleString('es-MX')}</strong></span><span><small>{t('stockPage.cost')}</small><strong>{money(bin.valuation_rate)}</strong></span><span><small>{t('stockPage.value')}</small><strong>{money(bin.stock_value)}</strong></span></div><div className="stock-row-actions"><ButtonLink to={adjustPath} variant="secondary" size="compact">{t('stockPage.adjust')}</ButtonLink></div></article>
}

export function StockPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient(); const [searchParams, setSearchParams] = useSearchParams()
  const stockQuery = useQuery({ queryKey: queryKeys.catalog.stock(profileId), queryFn: () => readStockCache(profileId), staleTime: Infinity })
  const variantsQuery = useQuery(catalogQueryOptions.variant(profileId))
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? ''); const [syncMessage, setSyncMessage] = useState(''); const [filtersOpen, setFiltersOpen] = useState(false)
  const refresh = useMutation({ mutationFn: async () => { const data = await loadStockData(client, setSyncMessage); return writeStockCache({ profileId, updatedAt: new Date().toISOString(), ...data }) }, onSuccess: async (next) => { queryClient.setQueryData(queryKeys.catalog.stock(profileId), next); await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.stock(profileId), refetchType: 'active' }); setSyncMessage(t("stockPage.realStock", { count: next.bins.length })) }, onError: (error) => setSyncMessage(stockErrorMessage(error)) })
  const cache = stockQuery.data; const items = useMemo(() => cache?.items?.length ? cache.items : variantsQuery.data?.items ?? [], [cache?.items, variantsQuery.data?.items])
  const company = searchParams.get('company') ?? ''; const warehouse = searchParams.get('warehouse') ?? ''; const search = searchParams.get('search') ?? ''; const page = Number(searchParams.get('page') ?? '1') || 1
  const warehouses = useMemo(() => activeWarehouses(cache?.warehouses ?? [], company), [cache?.warehouses, company])
  const filtered = useMemo(() => stockSearch(visibleStockBins(cache?.bins ?? [], items, warehouses).filter((bin) => !warehouse || bin.warehouse === warehouse), items, search).sort((a, b) => a.warehouse.localeCompare(b.warehouse, 'es') || a.item_code.localeCompare(b.item_code, 'es')), [cache?.bins, items, search, warehouse, warehouses]); const paged = paginateStock(filtered, page)
  const update = (values: Record<string, string>) => setSearchParams({ ...(company ? { company } : {}), ...(warehouse ? { warehouse } : {}), ...(search ? { search } : {}), ...values })
  const returnQuery = stockReturnQuery(searchParams); const reconciliationPath = `/stock/reconciliation${returnQuery ? `?${returnQuery}` : ''}`
  const adjustPath = (bin: StockBin) => { const query = new URLSearchParams(returnQuery); query.set('item', bin.item_code); query.set('itemWarehouse', bin.warehouse); return `/stock/reconciliation?${query}` }
  const location = useLocation(); const reconciledNotice = (location.state as { stockNotice?: string } | null)?.stockNotice
  return <section className="stock-workspace"><PageHeader title={t("stockPage.title")} description={t("stockPage.description")} action={<><ButtonLink to={`/stock/receipt${returnQuery ? `?${returnQuery}` : ''}`}>{t('receiptPage.title')}</ButtonLink><ButtonLink to={reconciliationPath} variant="secondary">{t("stockPage.reconcile")}</ButtonLink><RefreshButton label={t("stockPage.refresh")} onClick={() => refresh.mutate()} loading={refresh.isPending} /></>} />
    {reconciledNotice && <div className="mb-4"><Notice tone="info">{reconciledNotice}</Notice></div>}
    {!cache && <div className="card mb-5 p-5"><p className="font-medium">{t("stockPage.notDownloaded")}</p><p className="muted">{t("stockPage.downloadHint")}</p></div>}
    {cache && <><div className="stock-controls card"><div className="stock-filter-grid"><Field label={t("stockPage.company")}><Select value={company || '__all__'} onValueChange={(value) => update({ company: value === '__all__' ? '' : value, warehouse: '', page: '1' })}><SelectTrigger className="stock-select-trigger" aria-label={t("stockPage.company")}><SelectValue /></SelectTrigger><SelectContent align="start"><SelectItem value="__all__">{t("stockPage.allCompanies")}</SelectItem>{cache.companies.map((item) => <SelectItem key={item.name} value={item.name}>{item.company_name || item.name}</SelectItem>)}</SelectContent></Select></Field><Field label={t("stockPage.warehouse")}><Select value={warehouse || '__all__'} onValueChange={(value) => update({ warehouse: value === '__all__' ? '' : value, page: '1' })}><SelectTrigger className="stock-select-trigger" aria-label={t("stockPage.warehouse")}><SelectValue /></SelectTrigger><SelectContent align="start"><SelectItem value="__all__">{t("stockPage.allWarehouses")}</SelectItem>{warehouses.map((item) => <SelectItem key={item.name} value={item.name}>{item.warehouse_name || item.name}</SelectItem>)}</SelectContent></Select></Field><form className="stock-search" onSubmit={(event) => { event.preventDefault(); update({ search: searchInput.trim(), page: '1' }) }}><Field label={t("stockPage.product")}><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t("stockPage.searchPlaceholder")} /></Field><SearchButton label={t("stockPage.search")} /><StockFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} company={company} warehouse={warehouse} search={searchInput} companies={cache.companies} warehouses={warehouses} onCompany={(value) => update({ company: value, warehouse: "", page: "1" })} onWarehouse={(value) => update({ warehouse: value, page: "1" })} onSearch={setSearchInput} onApply={() => { update({ search: searchInput.trim(), page: "1" }); setFiltersOpen(false) }} /></form></div><div className="stock-summary"><span>{t("stockPage.realStock", { count: filtered.length })}</span><span>{t("stockPage.warehouses", { count: warehouses.length })}</span><span>{syncMessage || t("stockPage.updated", { date: new Date(cache.updatedAt).toLocaleString() })}</span></div></div><div className="stock-cards">{paged.rows.map((bin) => <StockCard key={`${bin.warehouse}-${bin.item_code}`} bin={bin} item={items.find((candidate) => candidate.name === bin.item_code)} adjustPath={adjustPath(bin)} />)}{!paged.rows.length && <div className="card p-10 text-center muted">{t("stockPage.noResults")}</div>}<div className="stock-pagination"><Button variant="secondary" disabled={paged.page <= 1} onClick={() => update({ page: String(paged.page - 1) })}>{t("stockPage.previous")}</Button><span>{t("stockPage.page", { page: paged.page, totalPages: paged.totalPages, count: filtered.length })}</span><Button variant="secondary" disabled={paged.page >= paged.totalPages} onClick={() => update({ page: String(paged.page + 1) })}>{t("stockPage.next")}</Button></div></div></>}
    {stockQuery.isError && <Notice>{stockErrorMessage(stockQuery.error)}</Notice>}{refresh.isError && <Notice>{stockErrorMessage(refresh.error)}</Notice>}
  </section>
}
