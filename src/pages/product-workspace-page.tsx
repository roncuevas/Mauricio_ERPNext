import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Notice, PageHeader, Spinner } from '../components/ui'
import { ProductCard } from '../components/product-card'
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
      const batch = await client.listDocuments<CachedItem>('Item', { fields: ['name', 'item_code', 'item_name', 'item_group', 'stock_uom', 'sales_uom', 'purchase_uom', 'disabled'], start, pageLength: batchSize, orderBy: 'modified desc' })
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
  const variantByName = useMemo(() => new Map((variants.data?.items ?? []).map((item) => [item.name, item])), [variants.data?.items])
  const hasCache = Boolean(catalog.data)
  const updated = catalog.data ? new Date(catalog.data.updatedAt).toLocaleString() : ''

  function changeView(next: ProductView) {
    setView(next)
    setPage(0)
    if (next === 'table') setDetailsPromptDismissed(false)
  }

  return <section className="product-workspace"><PageHeader title="Productos" description="Busca por nombre, código, SKU, barcode o cualquier dato disponible en la caché local." action={<Button onClick={() => navigate('/items/new')}>Nuevo producto</Button>} /><div className="card product-workspace-card overflow-hidden">
    <div className="product-controls"><form className="product-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(0) }}><Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar producto, SKU o barcode" aria-label="Buscar productos" /><Button type="submit">Buscar</Button></form><Button className="product-refresh" type="button" variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? <><Spinner /> <span className="ml-2">Actualizando</span></> : 'Refrescar catálogo'}</Button></div>
    <div className="product-toolbar"><div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"><span>{hasCache ? `${catalog.data?.items.length ?? 0} productos en caché` : 'Catálogo sin descargar'}</span>{search && <span>Filtro: “{search}”</span>}{updated && <span>Actualizado: {updated}</span>}{syncMessage && <span className="font-medium text-blue-700">{syncMessage}</span>}</div><div className="view-switcher" aria-label="Vista de productos"><span className="view-switcher-label">Vista</span><button type="button" className={view === 'table' ? 'view-switch-active' : ''} aria-pressed={view === 'table'} onClick={() => changeView('table')}>Tabla</button><button type="button" className={view === 'cards' ? 'view-switch-active' : ''} aria-pressed={view === 'cards'} onClick={() => changeView('cards')}>Cards</button></div></div>
    {detailsPrompt && <div className="product-details-confirmation" role="alert"><div><strong>La vista Cards carga información enriquecida</strong><p>Para mostrar precios de compra/venta, ganancia, variantes, UOM y conversiones se descargará el catálogo de precios y los Items con sus conversiones. Se guardará en caché local y no se volverá a descargar al cambiar de vista.</p></div><div className="product-confirmation-actions"><Button type="button" onClick={() => detailsSync.mutate()} disabled={detailsSync.isPending}>{detailsSync.isPending ? <><Spinner /> <span className="ml-2">Cargando datos</span></> : 'Cargar y guardar en caché'}</Button><Button type="button" variant="secondary" onClick={() => { setDetailsPrompt(false); setDetailsPromptDismissed(true) }}>Ahora no</Button></div></div>}
    {catalog.isError && <div className="p-4"><Notice>{catalog.error.message}</Notice></div>}{refresh.isError && <div className="p-4"><Notice>{refresh.error.message}</Notice></div>}
    {catalog.isPending ? <div className="flex justify-center p-12"><Spinner /></div> : !hasCache ? <div className="p-12 text-center"><p className="font-medium text-slate-700">Aún no hay productos en la caché local.</p><p className="mt-1 muted">Pulsa “Refrescar catálogo” para descargar todos los Items una sola vez.</p></div> : rows.length === 0 ? <div className="p-12 text-center muted">No se encontraron productos.</div> : view === 'cards' ? <div className="product-card-list">{rows.map((row) => <ProductCard key={String(row.name)} item={row} prices={prices.data?.prices ?? []} variant={variantByName.get(String(row.name))} onOpen={() => navigate(`/items/${encodeURIComponent(String(row.name))}`)} />)}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Código</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Grupo</th><th className="px-4 py-3">UOM stock</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={String(row.name)} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/items/${encodeURIComponent(String(row.name))}`)}><td className="px-4 py-3 font-mono text-xs">{String(row.name)}</td><td className="px-4 py-3 font-medium">{String(row.item_name ?? '—')}</td><td className="px-4 py-3">{String(row.item_group ?? '—')}</td><td className="px-4 py-3">{String(row.stock_uom ?? '—')}</td><td className="px-4 py-3">{row.disabled ? 'Deshabilitado' : 'Activo'}</td><td className="px-4 py-3"><Link className="button button-secondary" to={`/items/${encodeURIComponent(String(row.name))}/uoms`} onClick={(event) => event.stopPropagation()}>UOM</Link></td></tr>)}</tbody></table></div>}
    <div className="product-pagination"><span className="muted">Página {page + 1} · {filtered.length} resultados</span><div className="product-pagination-actions"><Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button><Button variant="secondary" disabled={(page + 1) * pageLength >= filtered.length} onClick={() => setPage((p) => p + 1)}>Siguiente</Button></div></div>
  </div></section>
}
