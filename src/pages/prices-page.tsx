import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Input, Notice, PageHeader, Spinner } from '../components/ui'
import { createErpNextClient } from '../lib/erpnext'
import { listAllDocuments } from '../lib/pagination'
import { patchItemPriceCatalog, readItemPriceCatalog, writeItemPriceCatalog } from '../lib/price-cache'
import { buildVariantTree, readVariantCatalog } from '../lib/variant-cache'
import { variantSearchScore } from '../components/variant-tree'
import { calculateGrossMargin, findComparablePurchases } from '../lib/pricing'
import type { ItemPrice, ItemPriceCatalogCache, VariantItem } from '../lib/types'

type Client = ReturnType<typeof createErpNextClient>

function money(price: ItemPrice) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: price.currency || 'MXN' }).format(Number(price.price_list_rate ?? 0))
}

function MarginSummary({ selling, purchases }: { selling: ItemPrice; purchases: ItemPrice[] }) {
  if (!purchases.length) return <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">Sin compra comparable</span>
  return <div className="price-margin-list" title="Margen bruto: no incluye impuestos, flete ni otros costos">{purchases.map((purchase) => { const margin = calculateGrossMargin(selling, purchase); const positive = margin.amount >= 0; return <span className={`price-margin-row ${positive ? 'price-margin-positive' : 'price-margin-negative'}`} key={`${selling.name}-${purchase.name}`}><strong>{purchase.supplier || 'Proveedor general'}</strong><span>Ganancia: {money({ ...selling, price_list_rate: margin.amount })}</span><span>{margin.percentage.toFixed(2)}%</span><span className="price-margin-cost">Costo {money(purchase)}</span></span> })}</div>
}

type PriceFilters = {
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

function collectVisibleNames(items: VariantItem[], childrenByParent: Map<string, VariantItem[]>, pricesByItem: Map<string, ItemPrice[]>, search: string, filters: PriceFilters): HierarchySearchResult {
  const visibleNames = new Set<string>()
  const directNames = new Set<string>()
  const contextNames = new Set<string>()
  const expandedNames = new Set<string>()
  const scores = new Map<string, number>()
  function visit(item: VariantItem): boolean {
    const children = childrenByParent.get(item.name) ?? []
    const descendantMatches = children.map(visit).some(Boolean)
    const match = search ? variantSearchScore(item, search) : { score: 0 }
    const searchMatches = !search || match !== null
    const matches = searchMatches && itemMatchesFilters(item, pricesByItem.get(item.name) ?? [], filters)
    if (matches) { directNames.add(item.name); scores.set(item.name, match?.score ?? 0) }
    if (descendantMatches && !matches) contextNames.add(item.name)
    if (descendantMatches) expandedNames.add(item.name)
    if (matches || descendantMatches) visibleNames.add(item.name)
    return matches || descendantMatches
  }
  items.forEach(visit)
  return { visibleNames, directNames, contextNames, expandedNames, scores }
}

type PriceEditorProps = { client: Client; item: VariantItem; price?: ItemPrice; onSaved: (price: ItemPrice) => void; onClose: () => void }

function PriceEditor({ client, item, price, onSaved, onClose }: PriceEditorProps) {
  const [kind, setKind] = useState<'buying' | 'selling'>(price?.buying ? 'buying' : 'selling')
  const [priceList, setPriceList] = useState(price?.price_list ?? (price?.buying ? 'Standard Buying' : 'Standard Selling'))
  const [rate, setRate] = useState(String(price?.price_list_rate ?? ''))
  const [uom, setUom] = useState(price?.uom ?? item.stock_uom ?? '')
  const [currency, setCurrency] = useState(price?.currency ?? 'MXN')
  const [supplier, setSupplier] = useState(price?.supplier ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    if (!priceList.trim() || !rate || Number(rate) < 0) { setError('Lista de precios y precio son obligatorios.'); setBusy(false); return }
    const data = { item_code: item.name, price_list: priceList.trim(), price_list_rate: Number(rate), buying: kind === 'buying' ? 1 : 0, selling: kind === 'selling' ? 1 : 0, uom: uom.trim() || null, currency: currency.trim() || 'MXN', supplier: supplier.trim() || null }
    try {
      const saved = price ? await client.updateDocument<Record<string, unknown>>('Item Price', price.name, data) : await client.createDocument<Record<string, unknown>>('Item Price', data)
      onSaved({ ...data, ...saved, name: String(saved.name ?? price?.name ?? '') } as ItemPrice)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el precio.') } finally { setBusy(false) }
  }

  return <div id="price-editor" className="card mb-5 border-blue-200 p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{price ? 'Editar precio' : 'Agregar precio'}</h2><p className="muted">{item.item_name || item.name} · {item.name}</p></div><Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button></div>{error && <div className="mb-4"><Notice>{error}</Notice></div>}<form className="grid gap-4 sm:grid-cols-2" onSubmit={save}><Field label="Tipo"><select className="control" value={kind} onChange={(event) => setKind(event.target.value as 'buying' | 'selling')}><option value="buying">Compra</option><option value="selling">Venta</option></select></Field><Field label="Lista de precios *"><Input value={priceList} onChange={(event) => setPriceList(event.target.value)} placeholder="Standard Selling" required /></Field><Field label="Precio *"><Input type="number" min="0" step="any" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="0.00" required /></Field><Field label="Moneda"><Input value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="MXN" /></Field><Field label="UOM"><Input value={uom} onChange={(event) => setUom(event.target.value)} placeholder={item.stock_uom || 'UOM de stock'} /></Field><Field label="Proveedor"><Input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Opcional: precio general o por proveedor" /></Field><div className="flex flex-wrap justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? <><Spinner /> <span className="ml-2">Guardando</span></> : 'Guardar precio'}</Button></div></form></div>
}

function PriceNode({ item, depth, childrenByParent, pricesByItem, visibleNames, expanded, onToggle, onAdd, onEdit }: { item: VariantItem; depth: number; childrenByParent: Map<string, VariantItem[]>; pricesByItem: Map<string, ItemPrice[]>; visibleNames: Set<string>; expanded: Set<string>; onToggle: (name: string) => void; onAdd: (item: VariantItem) => void; onEdit: (item: VariantItem, price: ItemPrice) => void }) {
  const children = childrenByParent.get(item.name) ?? []
  const prices = pricesByItem.get(item.name) ?? []
  const expandedNode = expanded.has(item.name)
  return <div className="price-node"><div className="price-node-row" style={{ paddingLeft: `${16 + depth * 28}px` }}><div className="price-node-main"><div className="price-node-heading"><div className={`price-node-toggle${children.length ? '' : ' price-node-toggle-empty'}`}>{children.length > 0 && <button className="price-expand-button" aria-label={expandedNode ? `Ocultar ${item.name}` : `Mostrar ${item.name}`} aria-expanded={expandedNode} onClick={() => onToggle(item.name)}>{expandedNode ? '▾' : '▸'}</button>}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="price-node-title">{item.item_name || item.name}</strong>{item.has_variants || children.length > 0 ? <span className="price-template-badge">Plantilla</span> : null}</div><div className="price-node-meta"><span className="font-mono">{item.name}</span>{item.brand && <span>Marca: {item.brand}</span>}{item.stock_uom && <span>Stock: {item.stock_uom}</span>}<span>{prices.length} precios</span></div></div></div>{prices.length > 0 && <div className="price-entry-list">{prices.map((price) => <div className="price-entry" key={price.name}><div className="price-entry-top"><span className={`price-kind ${price.buying ? 'price-kind-buying' : 'price-kind-selling'}`}>{price.buying ? 'Compra' : 'Venta'}</span><span className="price-amount">{money(price)}</span></div><div className="price-entry-meta"><span>{price.price_list || 'Sin lista'}</span><span>UOM: {price.uom || item.stock_uom || '—'}</span><span>Proveedor: {price.supplier || 'General'}</span></div>{price.selling ? <div className="price-entry-margin"><MarginSummary selling={price} purchases={findComparablePurchases(price, prices)} /></div> : null}<Button className="price-edit-button" type="button" variant="secondary" onClick={() => onEdit(item, price)}>Editar</Button></div>)}</div>}</div><Button className="price-add-button" type="button" variant="secondary" onClick={() => onAdd(item)}>Agregar precio</Button></div>{expandedNode && children.filter((child) => visibleNames.has(child.name)).map((child) => <PriceNode key={child.name} item={child} depth={depth + 1} childrenByParent={childrenByParent} pricesByItem={pricesByItem} visibleNames={visibleNames} expanded={expanded} onToggle={onToggle} onAdd={onAdd} onEdit={onEdit} />)}</div>
}

export function PricesPage({ client, profileId }: { client: Client; profileId: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const pricesQuery = useQuery({ queryKey: ['item-price-catalog', profileId], queryFn: () => readItemPriceCatalog(profileId), staleTime: Infinity })
  const variantsQuery = useQuery({ queryKey: ['variant-catalog', profileId], queryFn: () => readVariantCatalog(profileId), staleTime: Infinity })
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<PriceFilters>(emptyPriceFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [syncMessage, setSyncMessage] = useState('')
  const tree = useMemo(() => buildVariantTree(variantsQuery.data?.items ?? []), [variantsQuery.data?.items])
  const pricesByItem = useMemo(() => { const result = new Map<string, ItemPrice[]>(); for (const price of pricesQuery.data?.prices ?? []) { const item = price.item_code ?? ''; result.set(item, [...(result.get(item) ?? []), price]) } return result }, [pricesQuery.data?.prices])
  const filterOptions = useMemo(() => {
    const items = variantsQuery.data?.items ?? []
    const prices = pricesQuery.data?.prices ?? []
    return {
      brands: Array.from(new Set(items.map((item) => item.brand || 'Sin marca'))).sort(),
      itemGroups: Array.from(new Set(items.map((item) => item.item_group || 'Sin grupo'))).sort(),
      suppliers: Array.from(new Set(prices.map((price) => price.supplier || 'General'))).sort(),
      priceLists: Array.from(new Set(prices.map((price) => price.price_list || 'Sin lista'))).sort(),
      uoms: Array.from(new Set(prices.map((price) => price.uom || '—'))).sort(),
    }
  }, [pricesQuery.data?.prices, variantsQuery.data?.items])
  const refresh = useMutation({ mutationFn: async () => { const prices = await listAllDocuments<ItemPrice>(client, 'Item Price', { fields: ['name', 'item_code', 'price_list', 'price_list_rate', 'buying', 'selling', 'uom', 'currency', 'supplier', 'valid_from', 'valid_upto'], orderBy: 'item_code asc, price_list asc' }, (count) => setSyncMessage(`Descargando precios: ${count}`)); const next: ItemPriceCatalogCache = { profileId, updatedAt: new Date().toISOString(), prices }; return writeItemPriceCatalog(next) }, onSuccess: (next) => { queryClient.setQueryData(['item-price-catalog', profileId], next); setSyncMessage(`Precios actualizados: ${next.prices.length}`) }, onError: (error) => setSyncMessage(error.message) })
  const searchResult = useMemo(() => collectVisibleNames(tree.roots, tree.children, pricesByItem, search, filters), [tree.children, tree.roots, pricesByItem, search, filters])
  const visibleNames = searchResult.visibleNames
  const effectiveExpanded = useMemo(() => search ? new Set([...expanded, ...searchResult.expandedNames]) : expanded, [expanded, search, searchResult.expandedNames])
  const sortItems = useCallback((items: VariantItem[]) => [...items].filter((item) => visibleNames.has(item.name)).sort((left, right) => {
    const leftDirect = searchResult.directNames.has(left.name) ? 1 : 0
    const rightDirect = searchResult.directNames.has(right.name) ? 1 : 0
    return rightDirect - leftDirect || (searchResult.scores.get(right.name) ?? 0) - (searchResult.scores.get(left.name) ?? 0)
  }), [searchResult, visibleNames])
  const orderedChildren = useMemo(() => new Map(Array.from(tree.children.entries()).map(([parent, children]) => [parent, sortItems(children)])), [sortItems, tree.children])
  const roots = sortItems(tree.roots)
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const updated = pricesQuery.data ? new Date(pricesQuery.data.updatedAt).toLocaleString() : ''
  return <section className="prices-workspace"><PageHeader title="Precios por producto" description="Jerarquía de plantillas, variantes y precios por UOM o proveedor." action={<div className="flex flex-wrap gap-2"><Link className="button button-secondary" to="/suppliers">Proveedores</Link><Button type="button" variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? <><Spinner /> <span className="ml-2">Actualizando</span></> : 'Refrescar precios'}</Button></div>} />{!variantsQuery.data && <div className="mb-5"><Notice tone="info">Primero refresca el catálogo en Variantes para cargar la jerarquía plantilla → variante.</Notice><Link className="button button-secondary mt-3" to="/variants">Ir a Variantes</Link></div>}{pricesQuery.isError && <Notice>{pricesQuery.error.message}</Notice>}{refresh.isError && <Notice>{refresh.error.message}</Notice>}{pricesQuery.isPending || variantsQuery.isPending ? <div className="flex justify-center p-12"><Spinner /></div> : !pricesQuery.data ? <div className="card p-12 text-center"><p className="font-medium text-slate-700">Precios sin descargar.</p><p className="mt-1 muted">Pulsa “Refrescar precios” para cargar Item Price.</p></div> : <><div className="prices-toolbar"><div className="prices-toolbar-main"><form className="prices-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setFiltersOpen(false) }}><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar plantilla, variante o código..." aria-label="Buscar precios por producto" /><Button type="submit">Buscar</Button></form><div className="prices-filter-menu"><Button className="prices-filter-toggle" type="button" variant="secondary" aria-expanded={filtersOpen} aria-controls="prices-filter-panel" onClick={() => setFiltersOpen((current) => !current)}><span>Filtros</span>{activeFilterCount > 0 && <span className="prices-filter-count">{activeFilterCount}</span>}<span aria-hidden="true">{filtersOpen ? '▴' : '▾'}</span></Button><form id="prices-filter-panel" className={`prices-filter-panel${filtersOpen ? '' : ' prices-filter-panel-collapsed'}`} aria-label="Filtros de precios" aria-hidden={!filtersOpen} onSubmit={(event) => event.preventDefault()}><div className="prices-filter-heading"><div><strong>Filtrar productos</strong><span className="prices-filter-hint">Combínalos para reducir la lista sin volver a descargar datos.</span></div>{activeFilterCount > 0 && <Button type="button" variant="secondary" onClick={() => setFilters(emptyPriceFilters)}>Limpiar filtros ({activeFilterCount})</Button>}</div><div className="prices-filter-grid"><Field label="Precio mínimo"><Input type="number" min="0" step="any" value={filters.minPrice} onChange={(event) => setFilters((current) => ({ ...current, minPrice: event.target.value }))} placeholder="0.00" aria-label="Precio mínimo" /></Field><Field label="Precio máximo"><Input type="number" min="0" step="any" value={filters.maxPrice} onChange={(event) => setFilters((current) => ({ ...current, maxPrice: event.target.value }))} placeholder="Sin límite" aria-label="Precio máximo" /></Field><Field label="Marca"><select className="control" value={filters.brand} onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value }))} aria-label="Filtrar por marca"><option value="">Todas las marcas</option>{filterOptions.brands.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><Field label="Grupo"><select className="control" value={filters.itemGroup} onChange={(event) => setFilters((current) => ({ ...current, itemGroup: event.target.value }))} aria-label="Filtrar por grupo"><option value="">Todos los grupos</option>{filterOptions.itemGroups.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><Field label="Proveedor"><select className="control" value={filters.supplier} onChange={(event) => setFilters((current) => ({ ...current, supplier: event.target.value }))} aria-label="Filtrar por proveedor"><option value="">Todos los proveedores</option>{filterOptions.suppliers.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><Field label="Lista de precios"><select className="control" value={filters.priceList} onChange={(event) => setFilters((current) => ({ ...current, priceList: event.target.value }))} aria-label="Filtrar por lista de precios"><option value="">Todas las listas</option>{filterOptions.priceLists.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><Field label="UOM"><select className="control" value={filters.uom} onChange={(event) => setFilters((current) => ({ ...current, uom: event.target.value }))} aria-label="Filtrar por UOM"><option value="">Todas las UOM</option>{filterOptions.uoms.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field><Field label="Tipo"><select className="control" value={filters.priceType} onChange={(event) => setFilters((current) => ({ ...current, priceType: event.target.value as PriceFilters['priceType'] }))} aria-label="Filtrar por tipo de precio"><option value="">Compra y venta</option><option value="buying">Compra</option><option value="selling">Venta</option></select></Field><Field label="Estado"><select className="control" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as PriceFilters['status'] }))} aria-label="Filtrar por estado"><option value="">Activos y deshabilitados</option><option value="active">Activos</option><option value="disabled">Deshabilitados</option></select></Field></div></form></div></div><span className="prices-summary">{pricesQuery.data.prices.length} precios · {updated ? `Actualizado: ${updated}` : 'sin fecha'}{syncMessage ? ` · ${syncMessage}` : ''}</span></div><div className="card prices-tree overflow-hidden">{roots.length ? roots.map((item) => <PriceNode key={item.name} item={item} depth={0} childrenByParent={orderedChildren} pricesByItem={pricesByItem} visibleNames={visibleNames} expanded={effectiveExpanded} onToggle={(name) => setExpanded((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next })} onAdd={(selectedItem) => navigate(`/prices/manage/${encodeURIComponent(selectedItem.name)}`)} onEdit={(selectedItem, price) => navigate(`/prices/manage/${encodeURIComponent(selectedItem.name)}?price=${encodeURIComponent(price.name)}`)} />) : <div className="p-10 text-center muted">No hay productos para la búsqueda actual.</div>}</div></>}</section>
}

export function PriceManagementPage({ client, profileId }: { client: Client; profileId: string }) {
  const { itemName } = useParams<{ itemName: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const pricesQuery = useQuery({ queryKey: ['item-price-catalog', profileId], queryFn: () => readItemPriceCatalog(profileId), staleTime: Infinity })
  const variantsQuery = useQuery({ queryKey: ['variant-catalog', profileId], queryFn: () => readVariantCatalog(profileId), staleTime: Infinity })
  const [editingPriceName, setEditingPriceName] = useState(searchParams.get('price') ?? '')
  const [message, setMessage] = useState('')
  const item = variantsQuery.data?.items.find((candidate) => candidate.name === itemName)
  const existingPrices = (pricesQuery.data?.prices ?? []).filter((price) => price.item_code === itemName)
  const editingPrice = existingPrices.find((price) => price.name === editingPriceName)

  async function savePrice(price: ItemPrice) {
    const next = await patchItemPriceCatalog(profileId, price)
    if (next) queryClient.setQueryData(['item-price-catalog', profileId], next)
    setEditingPriceName(price.name)
    setMessage(`Precio guardado para ${price.item_code}`)
  }

  if (pricesQuery.isPending || variantsQuery.isPending) return <section><Spinner /></section>
  if (!item) return <section><Notice>No se encontró el producto en la caché de Variantes.</Notice><Button className="mt-3" type="button" variant="secondary" onClick={() => navigate('/prices')}>Volver a Precios</Button></section>
  return <section className="price-management-workspace"><PageHeader title={editingPrice ? 'Editar precio' : 'Agregar precio'} description={`${item.item_name || item.name} · administra listas, UOM y proveedores.`} action={<Button type="button" variant="secondary" onClick={() => navigate('/prices')}>Volver a Precios</Button>} /><div className="price-management-summary"><div><span className="price-management-label">Producto</span><strong>{item.item_name || item.name}</strong><code>{item.name}</code></div><div><span className="price-management-label">Precios existentes</span><strong>{existingPrices.length}</strong></div><Button type="button" variant="secondary" onClick={() => setEditingPriceName('')}>Agregar otro precio</Button></div><div className="price-management-existing"><div className="price-management-section-heading"><h2>Precios y proveedores actuales</h2><span>{existingPrices.length}</span></div>{existingPrices.length ? existingPrices.map((price) => <div className={`price-management-entry${price.name === editingPriceName ? ' price-management-entry-active' : ''}`} key={price.name}><div><span className={`price-kind ${price.buying ? 'price-kind-buying' : 'price-kind-selling'}`}>{price.buying ? 'Compra' : 'Venta'}</span><strong>{money(price)}</strong></div><div><span>{price.price_list || 'Sin lista'}</span><span>UOM: {price.uom || item.stock_uom || '—'}</span><span>Proveedor: {price.supplier || 'General'}</span></div><Button type="button" variant="secondary" onClick={() => setEditingPriceName(price.name)}>Editar</Button></div>) : <p className="muted">Todavía no hay precios guardados para este producto.</p>}</div>{message && <Notice tone="info">{message}</Notice>}<PriceEditor key={`${item.name}-${editingPrice?.name ?? 'new'}`} client={client} item={item} price={editingPrice} onSaved={savePrice} onClose={() => navigate('/prices')} /></section>
}
