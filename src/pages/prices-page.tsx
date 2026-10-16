import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Input, Notice, PageHeader, RefreshButton, SearchButton, Spinner } from '../components/ui'
import { createErpNextClient } from '../lib/erpnext'
import { listAllDocuments } from '../lib/pagination'
import { patchItemPriceCatalog, readItemPriceCatalog, writeItemPriceCatalog } from '../lib/price-cache'
import { buildVariantTree, readVariantCatalog } from '../lib/variant-cache'
import { variantSearchScore } from '../components/variant-tree'
import { calculateGrossMargin, findComparablePurchases } from '../lib/pricing'
import { PriceFilterSheet } from '../components/price-filter-sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import type { ItemPrice, ItemPriceCatalogCache, PriceList, VariantItem } from '../lib/types'
import { queryKeys } from '../lib/query-keys'

type Client = ReturnType<typeof createErpNextClient>

async function loadPriceLists(client: Client) {
  return listAllDocuments<PriceList>(client, 'Price List', { fields: ['name', 'selling', 'buying', 'enabled'], filters: [['enabled', '=', 1]], orderBy: 'name asc' })
}

function priceListSupports(priceList: PriceList, kind: 'buying' | 'selling') {
  return Boolean(priceList[kind])
}

function money(price: ItemPrice) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: price.currency || 'MXN' }).format(Number(price.price_list_rate ?? 0))
}

function sortPricesByPriceList(prices: ItemPrice[]) {
  return [...prices].sort((left, right) => {
    const listOrder = (left.price_list || 'Sin lista').localeCompare(right.price_list || 'Sin lista', 'es', { sensitivity: 'base' })
    return listOrder || (left.name || '').localeCompare(right.name || '', 'es', { sensitivity: 'base' })
  })
}

function MarginSummary({ selling, purchases }: { selling: ItemPrice; purchases: ItemPrice[] }) {
  if (!purchases.length) return <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">Sin compra comparable</span>
  return <div className="price-margin-list" title="Margen bruto: no incluye impuestos, flete ni otros costos">{purchases.map((purchase) => { const margin = calculateGrossMargin(selling, purchase); const positive = margin.amount >= 0; return <span className={`price-margin-row ${positive ? 'price-margin-positive' : 'price-margin-negative'}`} key={`${selling.name}-${purchase.name}`}><strong>{purchase.supplier || 'Proveedor general'}</strong><span>Ganancia: {money({ ...selling, price_list_rate: margin.amount })}</span><span>{margin.percentage.toFixed(2)}%</span><span className="price-margin-cost">Costo {money(purchase)}</span></span> })}</div>
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

type PriceEditorProps = { client: Client; item: VariantItem; price?: ItemPrice; priceLists: PriceList[]; defaultPriceList?: string; defaultUom?: string; onSaved: (price: ItemPrice) => Promise<void>; onClose: () => void }

function PriceEditor({ client, item, price, priceLists, defaultPriceList, defaultUom, onSaved, onClose }: PriceEditorProps) {
  const [kind, setKind] = useState<'buying' | 'selling'>(price?.buying ? 'buying' : 'selling')
  const [priceList, setPriceList] = useState(price?.price_list ?? defaultPriceList ?? (price?.buying ? 'Standard Buying' : 'Standard Selling'))
  const [rate, setRate] = useState(String(price?.price_list_rate ?? ''))
  const [uom, setUom] = useState(price?.uom ?? defaultUom ?? item.stock_uom ?? '')
  const [currency, setCurrency] = useState(price?.currency ?? 'MXN')
  const [customer, setCustomer] = useState(price?.customer ?? '')
  const [supplier, setSupplier] = useState(price?.supplier ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const availablePriceLists = priceLists.filter((candidate) => priceListSupports(candidate, kind))
  const selectedPriceListIsAvailable = availablePriceLists.some((candidate) => candidate.name === priceList)

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    if (!priceList.trim() || !rate || Number(rate) < 0) { setError('Lista de precios y precio son obligatorios.'); setBusy(false); return }
    const data = { item_code: item.name, price_list: priceList.trim(), price_list_rate: Number(rate), buying: kind === 'buying' ? 1 : 0, selling: kind === 'selling' ? 1 : 0, uom: uom.trim() || null, currency: currency.trim() || 'MXN', customer: kind === 'selling' ? customer.trim() || null : null, supplier: kind === 'buying' ? supplier.trim() || null : null }
    try {
      const saved = price ? await client.updateDocument<Record<string, unknown>>('Item Price', price.name, data) : await client.createDocument<Record<string, unknown>>('Item Price', data)
      await onSaved({ ...data, ...saved, name: String(saved.name ?? price?.name ?? '') } as ItemPrice)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el precio.') } finally { setBusy(false) }
  }

  return <div id="price-editor" className="card mb-5 border-blue-200 p-5">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{price ? 'Editar precio' : 'Agregar precio'}</h2><p className="muted">{item.item_name || item.name} · {item.name}</p></div><Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button></div>
    {error && <div className="mb-4"><Notice>{error}</Notice></div>}
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
      <Field label="Tipo"><Select value={kind} onValueChange={(value) => setKind(value as 'buying' | 'selling')}><SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger><SelectContent align="start"><SelectItem value="buying">Compra</SelectItem><SelectItem value="selling">Venta</SelectItem></SelectContent></Select></Field>
      <Field label="Lista de precios *"><Select value={priceList || undefined} onValueChange={setPriceList} required><SelectTrigger aria-label="Lista de precios"><SelectValue placeholder="Selecciona una lista" /></SelectTrigger><SelectContent align="start">{!selectedPriceListIsAvailable && priceList && <SelectItem value={priceList}>{priceList} (actual)</SelectItem>}{availablePriceLists.map((candidate) => <SelectItem key={candidate.name} value={candidate.name}>{candidate.name}</SelectItem>)}</SelectContent></Select></Field>
      <Field label="Precio *"><Input type="number" min="0" step="any" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="0.00" required /></Field>
      <Field label="Moneda"><Input value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="MXN" /></Field>
      <Field label="UOM"><Input value={uom} onChange={(event) => setUom(event.target.value)} placeholder={item.stock_uom || 'UOM de stock'} /></Field>
      {kind === 'selling' ? <Field label="Cliente"><Input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Opcional: precio específico para un cliente" /></Field> : <Field label="Proveedor"><Input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Opcional: precio específico por proveedor" /></Field>}
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? <><Spinner /> <span className="ml-2">Guardando</span></> : 'Guardar precio'}</Button></div>
    </form>
  </div>
}

function PriceNode({ item, depth, childrenByParent, pricesByItem, visibleNames, expanded, onToggle, onAdd, onEdit }: { item: VariantItem; depth: number; childrenByParent: Map<string, VariantItem[]>; pricesByItem: Map<string, ItemPrice[]>; visibleNames: Set<string>; expanded: Set<string>; onToggle: (name: string) => void; onAdd: (item: VariantItem) => void; onEdit: (item: VariantItem, price: ItemPrice) => void }) {
  const children = childrenByParent.get(item.name) ?? []
  const prices = sortPricesByPriceList(pricesByItem.get(item.name) ?? [])
  const expandedNode = expanded.has(item.name)
  const isTemplate = Boolean(item.has_variants) || children.length > 0
  return <div className="price-node">
    <div className="price-node-row" style={{ paddingLeft: `${16 + depth * 28}px` }}>
      <div className="price-node-main">
        <div className="price-node-heading">
          <div className={`price-node-toggle${children.length ? '' : ' price-node-toggle-empty'}`}>{children.length > 0 && <button className="price-expand-button" aria-label={expandedNode ? `Ocultar ${item.name}` : `Mostrar ${item.name}`} aria-expanded={expandedNode} onClick={() => onToggle(item.name)}>{expandedNode ? '▾' : '▸'}</button>}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><strong className="price-node-title">{item.item_name || item.name}</strong>{isTemplate ? <span className="price-template-badge">Plantilla</span> : null}</div>
            <div className="price-node-meta"><span className="font-mono">{item.name}</span>{item.brand && <span>Marca: {item.brand}</span>}{item.stock_uom && <span className="variant-stock-badge">{item.stock_uom}</span>}{!isTemplate && <span>{prices.length} precios</span>}</div>
          </div>
        </div>
        {prices.length > 0 && <div className="price-entry-list">{prices.map((price) => <div className="price-entry" key={price.name}>
          <div className="price-entry-top"><span className={`price-kind ${price.buying ? 'price-kind-buying' : 'price-kind-selling'}`}>{price.buying ? 'Compra' : 'Venta'}</span><span className="price-amount">{money(price)}</span></div>
          <div className="price-entry-meta"><span>{price.price_list || 'Sin lista'}</span><span>UOM: {price.uom || item.stock_uom || '—'}</span>{price.buying ? <span>Proveedor: {price.supplier || 'General'}</span> : price.customer ? <span>Cliente: {price.customer}</span> : null}</div>
          {price.selling ? <div className="price-entry-margin"><MarginSummary selling={price} purchases={findComparablePurchases(price, prices)} /></div> : null}
          <Button className="price-edit-button" type="button" variant="secondary" onClick={() => onEdit(item, price)}>Editar</Button>
        </div>)}</div>}
      </div>
      {!isTemplate && <Button className="price-add-button" type="button" variant="secondary" onClick={() => onAdd(item)}>Agregar precio</Button>}
    </div>
    {expandedNode && children.filter((child) => visibleNames.has(child.name)).map((child) => <PriceNode key={child.name} item={child} depth={depth + 1} childrenByParent={childrenByParent} pricesByItem={pricesByItem} visibleNames={visibleNames} expanded={expanded} onToggle={onToggle} onAdd={onAdd} onEdit={onEdit} />)}
  </div>
}

export function PricesPage({ client, profileId }: { client: Client; profileId: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const pricesQuery = useQuery({ queryKey: queryKeys.catalog.price(profileId), queryFn: () => readItemPriceCatalog(profileId), staleTime: Infinity })
  const variantsQuery = useQuery({ queryKey: queryKeys.catalog.variant(profileId), queryFn: () => readVariantCatalog(profileId), staleTime: Infinity })
  const priceListsQuery = useQuery({ queryKey: ['price-lists', profileId], queryFn: () => loadPriceLists(client), staleTime: 5 * 60 * 1000 })
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') ?? '')
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [filters, setFilters] = useState<PriceFilters>(emptyPriceFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [collapsedDuringSearch, setCollapsedDuringSearch] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
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
  const refresh = useMutation({ mutationFn: async () => { const prices = await listAllDocuments<ItemPrice>(client, 'Item Price', { fields: ['name', 'item_code', 'price_list', 'price_list_rate', 'buying', 'selling', 'uom', 'currency', 'customer', 'supplier', 'valid_from', 'valid_upto'], orderBy: 'item_code asc, price_list asc' }, (count) => setSyncMessage(`Descargando precios: ${count}`)); const next: ItemPriceCatalogCache = { profileId, updatedAt: new Date().toISOString(), prices }; return writeItemPriceCatalog(next) }, onSuccess: (next) => { queryClient.setQueryData(['item-price-catalog', profileId], next); setSyncMessage(`Precios actualizados: ${next.prices.length}`) }, onError: (error) => setSyncMessage(error.message) })
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
  const updated = pricesQuery.data ? new Date(pricesQuery.data.updatedAt).toLocaleString() : ''
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
  return <section className="prices-workspace"><PageHeader title="Precios por producto" description="Jerarquía de plantillas, variantes y precios por UOM o proveedor." action={<div className="flex flex-wrap gap-2"><Link className="button button-secondary" to="/suppliers">Proveedores</Link><RefreshButton label="Refrescar precios" onClick={() => refresh.mutate()} loading={refresh.isPending} /></div>} />{!variantsQuery.data && <div className="mb-5"><Notice tone="info">Primero refresca el catálogo en Variantes para cargar la jerarquía plantilla → variante.</Notice><Link className="button button-secondary mt-3" to="/variants">Ir a Variantes</Link></div>}{pricesQuery.isError && <Notice>{pricesQuery.error.message}</Notice>}{refresh.isError && <Notice>{refresh.error.message}</Notice>}{pricesQuery.isPending || variantsQuery.isPending ? <div className="flex justify-center p-12"><Spinner /></div> : !pricesQuery.data ? <div className="card p-12 text-center"><p className="font-medium text-slate-700">Precios sin descargar.</p><p className="mt-1 muted">Pulsa “Refrescar precios” para cargar Item Price.</p></div> : <><div className="prices-toolbar"><div className="prices-toolbar-main"><form className="prices-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setCollapsedDuringSearch(new Set()); setFiltersOpen(false) }}><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar plantilla, variante o código..." aria-label="Buscar precios por producto" /><SearchButton label="Buscar precios por producto" /></form><div className="prices-filter-menu"><PriceFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} filters={filters} options={filterOptions} activeCount={activeFilterCount} onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onClear={() => setFilters(emptyPriceFilters)} /></div></div><span className="prices-summary">{pricesQuery.data.prices.length} precios · {updated ? `Actualizado: ${updated}` : 'sin fecha'}{syncMessage ? ` · ${syncMessage}` : ''}</span></div><div className="card prices-tree overflow-hidden">{roots.length ? roots.map((item) => <PriceNode key={item.name} item={item} depth={0} childrenByParent={orderedChildren} pricesByItem={pricesByItem} visibleNames={visibleNames} expanded={effectiveExpanded} onToggle={toggleExpanded} onAdd={(selectedItem) => openPriceManagement(selectedItem.name)} onEdit={(selectedItem, price) => openPriceManagement(selectedItem.name, price.name)} />) : <div className="p-10 text-center muted">No hay productos para la búsqueda actual.</div>}</div></>}</section>
}

export function PriceManagementPage({ client, profileId }: { client: Client; profileId: string }) {
  const { itemName } = useParams<{ itemName: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const pricesQuery = useQuery({ queryKey: queryKeys.catalog.price(profileId), queryFn: () => readItemPriceCatalog(profileId), staleTime: Infinity })
  const variantsQuery = useQuery({ queryKey: queryKeys.catalog.variant(profileId), queryFn: () => readVariantCatalog(profileId), staleTime: Infinity })
  const priceListsQuery = useQuery({ queryKey: ['price-lists', profileId], queryFn: () => loadPriceLists(client), staleTime: 5 * 60 * 1000 })
  const [editingPriceName, setEditingPriceName] = useState(searchParams.get('price') ?? '')
  const [message, setMessage] = useState('')
  const returnToPrices = searchParams.get('returnTo') || '/prices'
  const item = variantsQuery.data?.items.find((candidate) => candidate.name === itemName)
  const existingPrices = useMemo(() => sortPricesByPriceList((pricesQuery.data?.prices ?? []).filter((price) => price.item_code === itemName)), [itemName, pricesQuery.data?.prices])
  const editingPrice = existingPrices.find((price) => price.name === editingPriceName)

  async function savePrice(price: ItemPrice) {
    const next = await patchItemPriceCatalog(profileId, price)
    if (!next) throw new Error('ERPNext guardó el precio, pero no se pudo actualizar la caché local.')
    queryClient.setQueryData(['item-price-catalog', profileId], next)
    setEditingPriceName(price.name)
    setMessage(`Precio guardado para ${price.item_code}`)
    if (returnToPrices.startsWith('/pos')) navigate(returnToPrices)
  }

  if (pricesQuery.isPending || variantsQuery.isPending) return <section><Spinner /></section>
  if (!item) return <section><Notice>No se encontró el producto en la caché de Variantes.</Notice><Button className="mt-3" type="button" variant="secondary" onClick={() => navigate(returnToPrices)}>Volver a Precios</Button></section>
  return <section className="price-management-workspace"><PageHeader title={editingPrice ? 'Editar precio' : 'Agregar precio'} description={`${item.item_name || item.name} · administra listas, UOM y cliente/proveedor según el tipo.`} action={<Button type="button" variant="secondary" onClick={() => navigate(returnToPrices)}>Volver a Precios</Button>} /><div className="price-management-summary"><div><span className="price-management-label">Producto</span><strong>{item.item_name || item.name}</strong><code>{item.name}</code></div><div><span className="price-management-label">Precios existentes</span><strong>{existingPrices.length}</strong></div><Button type="button" variant="secondary" onClick={() => setEditingPriceName('')}>Agregar otro precio</Button></div><div className="price-management-existing"><div className="price-management-section-heading"><h2>Precios y clientes/proveedores actuales</h2><span>{existingPrices.length}</span></div>{existingPrices.length ? existingPrices.map((price) => <div className={`price-management-entry${price.name === editingPriceName ? ' price-management-entry-active' : ''}`} key={price.name}><div><span className={`price-kind ${price.buying ? 'price-kind-buying' : 'price-kind-selling'}`}>{price.buying ? 'Compra' : 'Venta'}</span><strong>{money(price)}</strong></div><div><span>{price.price_list || 'Sin lista'}</span><span>UOM: {price.uom || item.stock_uom || '—'}</span>{price.buying ? <span>Proveedor: {price.supplier || 'General'}</span> : price.customer ? <span>Cliente: {price.customer}</span> : null}</div><Button type="button" variant="secondary" onClick={() => setEditingPriceName(price.name)}>Editar</Button></div>) : <p className="muted">Todavía no hay precios guardados para este producto.</p>}</div>{message && <Notice tone="info">{message}</Notice>}{priceListsQuery.isError && <Notice tone="warning">No se pudieron cargar las listas de precios; solo se conservará la lista actual del registro.</Notice>}<PriceEditor key={`${item.name}-${editingPrice?.name ?? 'new'}`} client={client} item={item} price={editingPrice} priceLists={priceListsQuery.data ?? []} defaultPriceList={searchParams.get('priceList') ?? undefined} defaultUom={searchParams.get('uom') ?? undefined} onSaved={savePrice} onClose={() => navigate(returnToPrices)} /></section>
}
