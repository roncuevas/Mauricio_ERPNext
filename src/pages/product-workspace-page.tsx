import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, FilterButton, Input, Notice, PageHeader, RefreshButton, SearchButton, SegmentedControl, Spinner } from '../components/ui'
import { ProductCard } from '../components/product-card'
import { ProductTable } from '../components/product-table'
import { FilterSheet } from '../components/filter-sheet'
import { readItemPriceCatalog } from '../lib/price-cache'
import { filterItems, readItemCatalog, writeItemCatalog } from '../lib/item-cache'
import { readVariantCatalog } from '../lib/variant-cache'
import { readItemSearchDetails } from '../lib/catalog-sync'
import { syncProductCardDetails } from '../lib/product-details-sync'
import type { CachedItem, ItemCatalogCache } from '../lib/types'
import type { createErpNextClient } from '../lib/erpnext'

type Client = ReturnType<typeof createErpNextClient>
type ProductView = 'table' | 'cards'

export function ProductWorkspacePage({ client, profileId }: { client: Client; profileId: string }) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [syncMessage, setSyncMessage] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [detailsPrompt, setDetailsPrompt] = useState(false)
  const [detailsPromptDismissed, setDetailsPromptDismissed] = useState(false)
  const [view, setView] = useState<ProductView>(() => localStorage.getItem(`mauricio-erpnext:products-view:${profileId}`) === 'cards' ? 'cards' : 'table')
  const pageLength = 25
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const catalog = useQuery({ queryKey: ['item-catalog', profileId], queryFn: () => readItemCatalog(profileId), staleTime: Infinity })
  const prices = useQuery({ queryKey: ['item-price-catalog', profileId], queryFn: () => readItemPriceCatalog(profileId), staleTime: Infinity })
  const variants = useQuery({ queryKey: ['variant-catalog', profileId], queryFn: () => readVariantCatalog(profileId), staleTime: Infinity })
  const detailsSync = useMutation({ mutationFn: () => syncProductCardDetails(client, profileId, setSyncMessage), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['item-price-catalog', profileId] }); await queryClient.invalidateQueries({ queryKey: ['variant-catalog', profileId] }); setDetailsPrompt(false); setSyncMessage('Precios, UOM y conversiones guardados en caché') }, onError: (error) => setSyncMessage(error.message) })

  useEffect(() => { localStorage.setItem(`mauricio-erpnext:products-view:${profileId}`, view) }, [profileId, view])

  useEffect(() => {
    if (view === 'cards' && prices.isFetched && variants.isFetched && (!prices.data || !variants.data) && !detailsPromptDismissed) setDetailsPrompt(true)
  }, [detailsPromptDismissed, prices.data, prices.isFetched, variants.data, variants.isFetched, view])

  const refresh = useMutation({ mutationFn: async () => {
    const items: CachedItem[] = []
    let start = 0
    const batchSize = 500
    while (true) {
      setSyncMessage(`Descargando productos: ${items.length}`)
      const batch = await client.listDocuments<CachedItem>('Item', { fields: ['name', 'item_code', 'item_name', 'brand', 'item_group', 'stock_uom', 'sales_uom', 'purchase_uom', 'weight_per_unit', 'weight_uom', 'variant_of', 'has_variants', 'disabled'], start, pageLength: batchSize, orderBy: 'modified desc' })
      items.push(...batch.data)
      if (batch.data.length < batchSize) break
      start += batch.data.length
    }
    const searchDetails = await readItemSearchDetails(client, items, setSyncMessage)
    const next: ItemCatalogCache = { profileId, updatedAt: new Date().toISOString(), items: items.map((item) => ({ ...item, ...(searchDetails[item.name] ?? { barcodes: [] }) })) }
    return writeItemCatalog(next)
  }, onSuccess: (next) => { queryClient.setQueryData(['item-catalog', profileId], next); setSyncMessage(`Catálogo actualizado: ${next.items.length} productos`) }, onError: (error) => setSyncMessage(error.message) })

  const filtered = useMemo(() => filterItems(catalog.data?.items ?? [], search), [catalog.data?.items, search])
  const rows = filtered.slice(page * pageLength, (page + 1) * pageLength)
  const hasCache = Boolean(catalog.data)
  const updated = catalog.data ? new Date(catalog.data.updatedAt).toLocaleString() : ''

  function changeView(next: ProductView) {
    setView(next)
    setPage(0)
    if (next === 'table') setDetailsPromptDismissed(false)
  }

  return <section className="product-workspace"><PageHeader title="Productos" description="Busca por nombre, código, SKU, barcode o cualquier dato disponible en la caché local." action={<Button onClick={() => navigate('/items/new')}>Nuevo producto</Button>} toolbar={<><form className="product-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(0) }}><Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar producto, SKU o barcode" aria-label="Buscar productos" /><SearchButton label="Buscar productos" /></form><FilterSheet trigger={<FilterButton label="Filtros de productos" expanded={filtersOpen} onClick={() => setFiltersOpen(true)} />} title="Filtros de Productos" description="Busca productos sin abandonar la pantalla." open={filtersOpen} onOpenChange={setFiltersOpen}><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Nombre, SKU o barcode" aria-label="Filtro de productos" /><Button type="button" onClick={() => { setSearch(searchInput.trim()); setPage(0); setFiltersOpen(false) }}>Aplicar filtro</Button><Button type="button" variant="secondary" onClick={() => { setSearchInput(''); setSearch(''); setPage(0); setFiltersOpen(false) }}>Limpiar filtro</Button></FilterSheet><RefreshButton className="product-refresh" label="Refrescar catálogo" onClick={() => refresh.mutate()} loading={refresh.isPending} /><SegmentedControl label="Vista" value={view} options={[{ value: 'table', label: 'Tabla' }, { value: 'cards', label: 'Cards' }]} onChange={changeView} /></>} status={<><span>{hasCache ? `${catalog.data?.items.length ?? 0} productos en caché` : 'Catálogo sin descargar'}</span>{search && <span>Filtro: “{search}”</span>}{updated && <span>Actualizado: {updated}</span>}{syncMessage && <span className="font-medium text-blue-700">{syncMessage}</span>}</>} /><div className="card product-workspace-card overflow-hidden">
    {detailsPrompt && <div className="product-details-confirmation" role="alert"><div><strong>La vista Cards carga información enriquecida</strong><p>Para mostrar precios de compra/venta, ganancia, variantes, UOM y conversiones se descargará el catálogo de precios y los Items con sus conversiones. Se guardará en caché local y no se volverá a descargar al cambiar de vista.</p></div><div className="product-confirmation-actions"><Button type="button" onClick={() => detailsSync.mutate()} disabled={detailsSync.isPending}>{detailsSync.isPending ? <><Spinner /> <span className="ml-2">Cargando datos</span></> : 'Cargar y guardar en caché'}</Button><Button type="button" variant="secondary" onClick={() => { setDetailsPrompt(false); setDetailsPromptDismissed(true) }}>Ahora no</Button></div></div>}
    {catalog.isError && <div className="p-4"><Notice>{catalog.error.message}</Notice></div>}{refresh.isError && <div className="p-4"><Notice>{refresh.error.message}</Notice></div>}
    {catalog.isPending ? <div className="flex justify-center p-12"><Spinner /></div> : !hasCache ? <div className="p-12 text-center"><p className="font-medium text-slate-700">Aún no hay productos en la caché local.</p><p className="mt-1 muted">Pulsa “Refrescar catálogo” para descargar todos los Items una sola vez.</p></div> : rows.length === 0 ? <div className="p-12 text-center muted">No se encontraron productos.</div> : view === 'cards' ? <div className="product-card-list">{rows.map((row) => <ProductCard key={String(row.name)} item={row} prices={prices.data?.prices ?? []} variant={variants.data?.items.find((item) => item.name === row.name)} onOpen={() => navigate(`/items/${encodeURIComponent(String(row.name))}`)} />)}</div> : <ProductTable items={rows} prices={prices.data?.prices ?? []} variants={variants.data?.items ?? []} profileId={profileId} onOpen={(name) => navigate(`/items/${encodeURIComponent(name)}`)} onUom={(name) => navigate(`/items/${encodeURIComponent(name)}/uoms`)} />}
    <div className="product-pagination"><span className="muted">Página {page + 1} · {filtered.length} resultados</span><div className="product-pagination-actions"><Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button><Button variant="secondary" disabled={(page + 1) * pageLength >= filtered.length} onClick={() => setPage((p) => p + 1)}>Siguiente</Button></div></div>
  </div></section>
}
