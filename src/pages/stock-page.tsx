import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ButtonLink, Field, Input, Notice, PageHeader, RefreshButton, SearchButton, Spinner } from '../components/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { StockFilterSheet } from '../components/stock-filter-sheet'
import { createErpNextClient } from '../lib/erpnext'
import { itemCanReconcile, loadStockData, reconciliationPayload, stockErrorMessage } from '../lib/stock'
import { readStockCache, writeStockCache } from '../lib/stock-cache'
import { readVariantCatalog } from '../lib/variant-cache'
import { searchScore } from '../lib/search'
import type { StockBin, VariantItem, Warehouse } from '../lib/types'

type Client = ReturnType<typeof createErpNextClient>
type ReconciliationLine = { itemCode: string; qty: string; valuationRate: string }
const PAGE_SIZE = 25
const today = () => new Date().toISOString().slice(0, 10)
const now = () => new Date().toTimeString().slice(0, 8)

export function stockSearch(bins: StockBin[], items: VariantItem[], search: string) {
  const term = search.trim().toLocaleLowerCase()
  if (!term) return bins
  const itemMap = new Map(items.map((item) => [item.name, item]))
  return bins.filter((bin) => `${bin.item_code} ${itemMap.get(bin.item_code)?.item_name ?? ''}`.toLocaleLowerCase().includes(term))
}

export function visibleStockBins(bins: StockBin[], _items: VariantItem[] = [], _warehouses: Warehouse[] = []) {
  const warehouseNames = new Set(_warehouses.filter((warehouse) => !warehouse.disabled && !warehouse.is_group).map((warehouse) => warehouse.name))
  return bins.filter((bin) => warehouseNames.has(bin.warehouse) && [bin.actual_qty, bin.reserved_qty, bin.ordered_qty, bin.projected_qty, bin.stock_value].some((value) => Number(value ?? 0) !== 0))
}

export function paginateStock<T>(rows: T[], page: number, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  return { rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, totalPages }
}

export function searchReconciliationItems(items: VariantItem[], search: string) {
  return items.map((item, index) => ({ item, index, match: searchScore(search, [
    { value: item.item_name, weight: 5 },
    { value: item.name, weight: 5 },
    { value: item.brand, weight: 3 },
    { value: item.item_group, weight: 2 },
  ]) })).filter((entry) => entry.match).sort((left, right) => (right.match?.score ?? 0) - (left.match?.score ?? 0) || left.index - right.index).map((entry) => entry.item)
}

function itemLabel(item: VariantItem | undefined, code: string) { return item ? `${item.item_name || item.name} · ${item.name}` : code }
function money(value: number | undefined) { return Number(value ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) }
function returnQuery(params: URLSearchParams) { const query = new URLSearchParams(); for (const key of ['company', 'warehouse', 'search', 'page']) { const value = params.get(key); if (value) query.set(key, value) } return query.toString() }
function activeWarehouses(warehouses: Warehouse[], company: string) { return warehouses.filter((warehouse) => !warehouse.disabled && !warehouse.is_group && (!company || warehouse.company === company)) }

function StockCard({ bin, item }: { bin: StockBin; item?: VariantItem }) {
  return <article className="stock-card"><div className="stock-card-heading"><div><span className="stock-card-warehouse">{bin.warehouse}</span><strong>{item?.item_name || bin.item_code}</strong><small>{bin.item_code} · {item?.stock_uom || 'Sin UOM'}</small></div><div className="stock-card-current"><span>Existencia</span><strong>{Number(bin.actual_qty ?? 0).toLocaleString('es-MX')}</strong></div></div><div className="stock-card-metrics"><span><small>Reservado</small><strong>{Number(bin.reserved_qty ?? 0).toLocaleString('es-MX')}</strong></span><span><small>Proyectado</small><strong>{Number(bin.projected_qty ?? 0).toLocaleString('es-MX')}</strong></span><span><small>Costo</small><strong>{money(bin.valuation_rate)}</strong></span><span><small>Valor</small><strong>{money(bin.stock_value)}</strong></span></div></article>
}

export function StockPage({ client, profileId }: { client: Client; profileId: string }) {
  const queryClient = useQueryClient(); const [searchParams, setSearchParams] = useSearchParams()
  const stockQuery = useQuery({ queryKey: ['stock-catalog', profileId], queryFn: () => readStockCache(profileId), staleTime: Infinity })
  const variantsQuery = useQuery({ queryKey: ['variant-catalog', profileId], queryFn: () => readVariantCatalog(profileId), staleTime: Infinity })
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? ''); const [syncMessage, setSyncMessage] = useState(''); const [filtersOpen, setFiltersOpen] = useState(false)
  const refresh = useMutation({ mutationFn: async () => { const data = await loadStockData(client, setSyncMessage); return writeStockCache({ profileId, updatedAt: new Date().toISOString(), ...data }) }, onSuccess: async (next) => { queryClient.setQueryData(['stock-catalog', profileId], next); await queryClient.invalidateQueries({ queryKey: ['stock-catalog', profileId], refetchType: 'active' }); setSyncMessage(`Inventario actualizado: ${next.bins.length} existencias`) }, onError: (error) => setSyncMessage(stockErrorMessage(error)) })
  const cache = stockQuery.data; const items = useMemo(() => cache?.items?.length ? cache.items : variantsQuery.data?.items ?? [], [cache?.items, variantsQuery.data?.items])
  const company = searchParams.get('company') ?? ''; const warehouse = searchParams.get('warehouse') ?? ''; const search = searchParams.get('search') ?? ''; const page = Number(searchParams.get('page') ?? '1') || 1
  const warehouses = useMemo(() => activeWarehouses(cache?.warehouses ?? [], company), [cache?.warehouses, company])
  const filtered = useMemo(() => stockSearch(visibleStockBins(cache?.bins ?? [], items, warehouses).filter((bin) => !warehouse || bin.warehouse === warehouse), items, search).sort((a, b) => a.warehouse.localeCompare(b.warehouse, 'es') || a.item_code.localeCompare(b.item_code, 'es')), [cache?.bins, items, search, warehouse, warehouses]); const paged = paginateStock(filtered, page)
  const update = (values: Record<string, string>) => setSearchParams({ ...(company ? { company } : {}), ...(warehouse ? { warehouse } : {}), ...(search ? { search } : {}), ...values })
  const reconciliationPath = `/stock/reconciliation${returnQuery(searchParams) ? `?${returnQuery(searchParams)}` : ''}`
  return <section className="stock-workspace"><PageHeader title="Inventario" description="Visualizador de existencias reales por producto y almacén." action={<><ButtonLink to={reconciliationPath}>Reconciliar existencia</ButtonLink><RefreshButton label="Refrescar inventario" onClick={() => refresh.mutate()} loading={refresh.isPending} /></>} />
    {!cache && <div className="card mb-5 p-5"><p className="font-medium">Inventario sin descargar.</p><p className="muted">Usa “Refrescar inventario” en el encabezado para cargar empresas, almacenes, productos y existencias desde ERPNext.</p></div>}
    {cache && <><div className="stock-controls card"><div className="stock-filter-grid"><Field label="Empresa"><Select value={company || '__all__'} onValueChange={(value) => update({ company: value === '__all__' ? '' : value, warehouse: '', page: '1' })}><SelectTrigger className="stock-select-trigger" aria-label="Empresa"><SelectValue /></SelectTrigger><SelectContent align="start"><SelectItem value="__all__">Todas las empresas</SelectItem>{cache.companies.map((item) => <SelectItem key={item.name} value={item.name}>{item.company_name || item.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Sucursal / almacén"><Select value={warehouse || '__all__'} onValueChange={(value) => update({ warehouse: value === '__all__' ? '' : value, page: '1' })}><SelectTrigger className="stock-select-trigger" aria-label="Sucursal / almacén"><SelectValue /></SelectTrigger><SelectContent align="start"><SelectItem value="__all__">Todos los almacenes</SelectItem>{warehouses.map((item) => <SelectItem key={item.name} value={item.name}>{item.warehouse_name || item.name}</SelectItem>)}</SelectContent></Select></Field><form className="stock-search" onSubmit={(event) => { event.preventDefault(); update({ search: searchInput.trim(), page: '1' }) }}><Field label="Producto"><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Código o nombre" /></Field><SearchButton label="Buscar inventario" /><StockFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} company={company} warehouse={warehouse} search={searchInput} companies={cache.companies} warehouses={warehouses} onCompany={(value) => update({ company: value, warehouse: "", page: "1" })} onWarehouse={(value) => update({ warehouse: value, page: "1" })} onSearch={setSearchInput} onApply={() => { update({ search: searchInput.trim(), page: "1" }); setFiltersOpen(false) }} /></form></div><div className="stock-summary"><span>{filtered.length} existencias reales</span><span>{warehouses.length} almacenes</span><span>{syncMessage || `Actualizado: ${new Date(cache.updatedAt).toLocaleString()}`}</span></div></div><div className="stock-cards">{paged.rows.map((bin) => <StockCard key={`${bin.warehouse}-${bin.item_code}`} bin={bin} item={items.find((candidate) => candidate.name === bin.item_code)} />)}{!paged.rows.length && <div className="card p-10 text-center muted">No hay existencias reales para los filtros actuales.</div>}<div className="stock-pagination"><Button variant="secondary" disabled={paged.page <= 1} onClick={() => update({ page: String(paged.page - 1) })}>Anterior</Button><span>Página {paged.page} de {paged.totalPages} · {filtered.length} resultados</span><Button variant="secondary" disabled={paged.page >= paged.totalPages} onClick={() => update({ page: String(paged.page + 1) })}>Siguiente</Button></div></div></>}
    {stockQuery.isError && <Notice>{stockErrorMessage(stockQuery.error)}</Notice>}{refresh.isError && <Notice>{stockErrorMessage(refresh.error)}</Notice>}
  </section>
}

function ReconciliationLineEditor({ line, items, onChange, onRemove }: { line: ReconciliationLine; items: VariantItem[]; onChange: (line: ReconciliationLine) => void; onRemove: () => void }) {
  return <div className="stock-line"><Field label="Producto"><Select value={line.itemCode || undefined} onValueChange={(value) => onChange({ ...line, itemCode: value })} required><SelectTrigger className="stock-select-trigger" aria-label="Producto de reconciliación"><SelectValue placeholder="Selecciona producto" /></SelectTrigger><SelectContent align="start">{items.map((candidate) => <SelectItem key={candidate.name} value={candidate.name}>{itemLabel(candidate, candidate.name)}</SelectItem>)}</SelectContent></Select></Field><Field label="Cantidad"><Input type="number" min="0" step="any" value={line.qty} onChange={(event) => onChange({ ...line, qty: event.target.value })} required /></Field><Field label="Valoración"><Input type="number" min="0" step="any" value={line.valuationRate} onChange={(event) => onChange({ ...line, valuationRate: event.target.value })} required /></Field><Button type="button" variant="danger" onClick={onRemove}>Quitar</Button></div>
}

export function StockReconciliationPage({ client, profileId }: { client: Client; profileId: string }) {
  const navigate = useNavigate(); const queryClient = useQueryClient(); const [searchParams] = useSearchParams()
  const stockQuery = useQuery({ queryKey: ['stock-catalog', profileId], queryFn: () => readStockCache(profileId), staleTime: Infinity }); const variantsQuery = useQuery({ queryKey: ['variant-catalog', profileId], queryFn: () => readVariantCatalog(profileId), staleTime: Infinity })
  const cache = stockQuery.data; const allItems = cache?.items?.length ? cache.items : variantsQuery.data?.items ?? []; const items = useMemo(() => allItems.filter(itemCanReconcile), [allItems]); const warehouses = useMemo(() => activeWarehouses(cache?.warehouses ?? [], ''), [cache?.warehouses])
  const [warehouseName, setWarehouseName] = useState(searchParams.get('warehouse') ?? ''); const [searchInput, setSearchInput] = useState(''); const [selectedItem, setSelectedItem] = useState(''); const [lines, setLines] = useState<ReconciliationLine[]>([]); const [postingDate, setPostingDate] = useState(today); const [postingTime, setPostingTime] = useState(now); const [remarks, setRemarks] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const warehouse = warehouses.find((candidate) => candidate.name === warehouseName); const bins = cache?.bins ?? []; const selectedNames = new Set(lines.map((line) => line.itemCode)); const matchingItems = useMemo(() => searchReconciliationItems(items, searchInput).filter((item) => !selectedNames.has(item.name)), [items, searchInput, lines])
  const lineFromItem = (itemCode: string, targetWarehouse = warehouseName): ReconciliationLine => { const bin = bins.find((candidate) => candidate.item_code === itemCode && candidate.warehouse === targetWarehouse); return { itemCode, qty: String(bin?.actual_qty ?? 0), valuationRate: String(bin?.valuation_rate ?? 0) } }
  function changeWarehouse(value: string) { setWarehouseName(value); setLines((current) => current.map((line) => lineFromItem(line.itemCode, value))) }
  function addLine() { if (!selectedItem || selectedNames.has(selectedItem)) return; setLines((current) => [...current, lineFromItem(selectedItem)]); setSelectedItem('') }
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); setBusy(true); try { if (!warehouse?.company) throw new Error('Selecciona un almacén con empresa configurada.'); const payload = reconciliationPayload({ company: warehouse.company, warehouse: warehouse.name, postingDate, postingTime, remarks, lines: lines.map((line) => ({ itemCode: line.itemCode, qty: Number(line.qty), valuationRate: Number(line.valuationRate) })) }); const created = await client.createDocument<{ name: string }>('Stock Reconciliation', payload); await client.submitDocument('Stock Reconciliation', created.name); const data = await loadStockData(client); const next = await writeStockCache({ profileId, updatedAt: new Date().toISOString(), ...data }); queryClient.setQueryData(['stock-catalog', profileId], next); navigate(`/stock${returnQuery(searchParams) ? `?${returnQuery(searchParams)}` : ''}`) } catch (reason) { setError(stockErrorMessage(reason)) } finally { setBusy(false) } }
  if (stockQuery.isLoading || variantsQuery.isLoading) return <div className="p-6 muted"><Spinner /> Cargando catálogo...</div>
  if (!cache) return <section><PageHeader title="Reconciliar existencia" /><Notice>Primero descarga el inventario desde ERPNext.</Notice><ButtonLink to="/stock" variant="secondary">Volver a Inventario</ButtonLink></section>
  return <section><PageHeader title="Reconciliar existencia" description="Selecciona cualquier producto stockable y fija su cantidad y valoración en un solo documento." action={<ButtonLink to={`/stock${returnQuery(searchParams) ? `?${returnQuery(searchParams)}` : ''}`} variant="secondary">Volver a Inventario</ButtonLink>} /><form className="card stock-operation-card stock-operation-form" onSubmit={submit}><div className="stock-form-grid"><Field label="Almacén"><Select value={warehouseName || undefined} onValueChange={changeWarehouse} required><SelectTrigger className="stock-select-trigger" aria-label="Almacén"><SelectValue placeholder="Selecciona almacén" /></SelectTrigger><SelectContent align="start">{warehouses.map((candidate) => <SelectItem key={candidate.name} value={candidate.name}>{candidate.warehouse_name || candidate.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Empresa"><Input value={warehouse?.company || ''} readOnly placeholder="Se deriva del almacén" /></Field><Field label="Fecha"><Input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} required /></Field><Field label="Hora"><Input type="time" value={postingTime.slice(0, 5)} onChange={(event) => setPostingTime(`${event.target.value}:00`)} required /></Field></div><div className="stock-lines-heading"><div><h3>Productos a reconciliar</h3><p className="muted">Puedes incluir productos sin Bin; ERPNext lo creará al enviar.</p></div></div><div className="stock-reconciliation-picker"><Field label="Buscar producto"><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Código o nombre" /></Field><Field label="Producto"><Select value={selectedItem || undefined} onValueChange={setSelectedItem}><SelectTrigger className="stock-select-trigger" aria-label="Producto"><SelectValue placeholder="Selecciona producto" /></SelectTrigger><SelectContent align="start">{matchingItems.map((item) => <SelectItem key={item.name} value={item.name}>{itemLabel(item, item.name)}</SelectItem>)}</SelectContent></Select></Field><Button type="button" variant="secondary" onClick={addLine} disabled={!warehouseName || !selectedItem}>Agregar línea</Button></div><div className="stock-lines">{lines.map((line, index) => <ReconciliationLineEditor key={`${line.itemCode}-${index}`} line={line} items={items} onChange={(next) => setLines((current) => current.map((candidate, rowIndex) => rowIndex === index ? (next.itemCode === line.itemCode ? next : lineFromItem(next.itemCode)) : candidate))} onRemove={() => setLines((current) => current.filter((_, rowIndex) => rowIndex !== index))} />)}</div><Field label="Notas"><Input value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Motivo o referencia opcional" /></Field>{error && <Notice>{error}</Notice>}<div className="stock-form-actions"><Button type="submit" disabled={busy || !lines.length}>{busy ? <><Spinner /> Enviando</> : 'Confirmar reconciliación'}</Button><ButtonLink to={`/stock${returnQuery(searchParams) ? `?${returnQuery(searchParams)}` : ''}`} variant="secondary">Cancelar</ButtonLink></div></form></section>
}
