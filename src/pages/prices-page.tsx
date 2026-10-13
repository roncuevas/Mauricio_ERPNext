import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Input, Notice, PageHeader, Spinner } from '../components/ui'
import { createErpNextClient } from '../lib/erpnext'
import { listAllDocuments } from '../lib/pagination'
import { patchItemPriceCatalog, readItemPriceCatalog, writeItemPriceCatalog } from '../lib/price-cache'
import { buildVariantTree, readVariantCatalog } from '../lib/variant-cache'
import { variantMatches, variantNodeIsVisible } from '../components/variant-tree'
import { calculateGrossMargin, findComparablePurchase } from '../lib/pricing'
import type { ItemPrice, ItemPriceCatalogCache, VariantItem } from '../lib/types'

type Client = ReturnType<typeof createErpNextClient>

function money(price: ItemPrice) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: price.currency || 'MXN' }).format(Number(price.price_list_rate ?? 0))
}

function MarginSummary({ selling, purchase }: { selling: ItemPrice; purchase: ItemPrice | null }) {
  if (!purchase) return <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">Sin compra comparable</span>
  const margin = calculateGrossMargin(selling, purchase)
  const positive = margin.amount >= 0
  return <span className={`rounded px-2 py-1 text-xs font-semibold ${positive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`} title="Margen bruto: no incluye impuestos, flete ni otros costos"><span>Ganancia: {money({ ...selling, price_list_rate: margin.amount })}</span><span className="ml-2">{margin.percentage.toFixed(2)}%</span><span className="ml-2 font-normal opacity-80">Costo {money(purchase)} · {purchase.supplier || 'Proveedor general'}</span></span>
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

  return <div className="card mb-5 border-blue-200 p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{price ? 'Editar precio' : 'Agregar precio'}</h2><p className="muted">{item.item_name || item.name} · {item.name}</p></div><Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button></div>{error && <div className="mb-4"><Notice>{error}</Notice></div>}<form className="grid gap-4 sm:grid-cols-2" onSubmit={save}><Field label="Tipo"><select className="control" value={kind} onChange={(event) => setKind(event.target.value as 'buying' | 'selling')}><option value="buying">Compra</option><option value="selling">Venta</option></select></Field><Field label="Lista de precios *"><Input value={priceList} onChange={(event) => setPriceList(event.target.value)} placeholder="Standard Selling" required /></Field><Field label="Precio *"><Input type="number" min="0" step="any" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="0.00" required /></Field><Field label="Moneda"><Input value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="MXN" /></Field><Field label="UOM"><Input value={uom} onChange={(event) => setUom(event.target.value)} placeholder={item.stock_uom || 'UOM de stock'} /></Field><Field label="Proveedor"><Input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Opcional: precio general o por proveedor" /></Field><div className="flex flex-wrap justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? <><Spinner /> <span className="ml-2">Guardando</span></> : 'Guardar precio'}</Button></div></form></div>
}

function PriceNode({ item, depth, childrenByParent, pricesByItem, expanded, onToggle, onAdd, onEdit }: { item: VariantItem; depth: number; childrenByParent: Map<string, VariantItem[]>; pricesByItem: Map<string, ItemPrice[]>; expanded: Set<string>; onToggle: (name: string) => void; onAdd: (item: VariantItem) => void; onEdit: (item: VariantItem, price: ItemPrice) => void }) {
  const children = childrenByParent.get(item.name) ?? []
  const prices = pricesByItem.get(item.name) ?? []
  const expandedNode = expanded.has(item.name)
  return <div className="border-b border-slate-100 last:border-b-0"><div className="flex flex-wrap items-start gap-3 px-4 py-4" style={{ paddingLeft: `${16 + depth * 28}px` }}><div className="flex min-w-0 flex-1 items-start gap-2"><div className="w-10 shrink-0">{children.length > 0 && <button className="inline-flex size-10 items-center justify-center rounded-lg text-2xl font-bold leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={expandedNode ? `Ocultar ${item.name}` : `Mostrar ${item.name}`} aria-expanded={expandedNode} onClick={() => onToggle(item.name)}>{expandedNode ? '▾' : '▸'}</button>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{item.item_name || item.name}</strong>{item.has_variants || children.length > 0 ? <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Plantilla</span> : null}</div><div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500"><span className="font-mono">{item.name}</span>{item.stock_uom && <span>Stock: {item.stock_uom}</span>}<span>{prices.length} precios</span></div>{prices.length > 0 && <div className="mt-3 grid gap-2">{prices.map((price) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" key={price.name}><div className="flex flex-wrap items-center gap-x-3 gap-y-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${price.buying ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{price.buying ? 'Compra' : 'Venta'}</span><span className="font-semibold">{money(price)}</span><span className="text-slate-600">{price.price_list || 'Sin lista'}</span><span className="text-slate-500">UOM: {price.uom || item.stock_uom || '—'}</span><span className="text-slate-500">Proveedor: {price.supplier || 'General'}</span>{price.selling ? <MarginSummary selling={price} purchase={findComparablePurchase(price, prices)} /> : null}</div><Button type="button" variant="secondary" onClick={() => onEdit(item, price)}>Editar</Button></div>)}</div>}</div></div><Button type="button" variant="secondary" onClick={() => onAdd(item)}>Agregar precio</Button></div>{expandedNode && children.map((child) => <PriceNode key={child.name} item={child} depth={depth + 1} childrenByParent={childrenByParent} pricesByItem={pricesByItem} expanded={expanded} onToggle={onToggle} onAdd={onAdd} onEdit={onEdit} />)}</div>
}

export function PricesPage({ client, profileId }: { client: Client; profileId: string }) {
  const queryClient = useQueryClient()
  const pricesQuery = useQuery({ queryKey: ['item-price-catalog', profileId], queryFn: () => readItemPriceCatalog(profileId), staleTime: Infinity })
  const variantsQuery = useQuery({ queryKey: ['variant-catalog', profileId], queryFn: () => readVariantCatalog(profileId), staleTime: Infinity })
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<{ item: VariantItem; price?: ItemPrice } | null>(null)
  const [syncMessage, setSyncMessage] = useState('')
  const tree = useMemo(() => buildVariantTree(variantsQuery.data?.items ?? []), [variantsQuery.data?.items])
  const pricesByItem = useMemo(() => { const result = new Map<string, ItemPrice[]>(); for (const price of pricesQuery.data?.prices ?? []) { const item = price.item_code ?? ''; result.set(item, [...(result.get(item) ?? []), price]) } return result }, [pricesQuery.data?.prices])
  const refresh = useMutation({ mutationFn: async () => { const prices = await listAllDocuments<ItemPrice>(client, 'Item Price', { fields: ['name', 'item_code', 'price_list', 'price_list_rate', 'buying', 'selling', 'uom', 'currency', 'supplier', 'valid_from', 'valid_upto'], orderBy: 'item_code asc, price_list asc' }, (count) => setSyncMessage(`Descargando precios: ${count}`)); const next: ItemPriceCatalogCache = { profileId, updatedAt: new Date().toISOString(), prices }; return writeItemPriceCatalog(next) }, onSuccess: (next) => { queryClient.setQueryData(['item-price-catalog', profileId], next); setSyncMessage(`Precios actualizados: ${next.prices.length}`) }, onError: (error) => setSyncMessage(error.message) })
  const roots = tree.roots.filter((item) => variantNodeIsVisible(item, tree.children, false, search) || pricesByItem.has(item.name) || variantMatches(item, search))
  const savePrice = async (price: ItemPrice) => { const next = await patchItemPriceCatalog(profileId, price); if (next) queryClient.setQueryData(['item-price-catalog', profileId], next); setSelected(null); setSyncMessage(`Precio guardado para ${price.item_code}`) }
  const updated = pricesQuery.data ? new Date(pricesQuery.data.updatedAt).toLocaleString() : ''
  return <section><PageHeader title="Precios por producto" description="Jerarquía de plantillas, variantes y precios por UOM o proveedor." action={<div className="flex flex-wrap gap-2"><Link className="button button-secondary" to="/suppliers">Proveedores</Link><Button type="button" variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? <><Spinner /> <span className="ml-2">Actualizando</span></> : 'Refrescar precios'}</Button></div>} />{selected && <PriceEditor key={`${selected.item.name}-${selected.price?.name ?? 'new'}`} client={client} item={selected.item} price={selected.price} onSaved={savePrice} onClose={() => setSelected(null)} />}{!variantsQuery.data && <div className="mb-5"><Notice tone="info">Primero refresca el catálogo en Variantes para cargar la jerarquía plantilla → variante.</Notice><Link className="button button-secondary mt-3" to="/variants">Ir a Variantes</Link></div>}{pricesQuery.isError && <Notice>{pricesQuery.error.message}</Notice>}{refresh.isError && <Notice>{refresh.error.message}</Notice>}{pricesQuery.isPending || variantsQuery.isPending ? <div className="flex justify-center p-12"><Spinner /></div> : !pricesQuery.data ? <div className="card p-12 text-center"><p className="font-medium text-slate-700">Precios sin descargar.</p><p className="mt-1 muted">Pulsa “Refrescar precios” para cargar Item Price.</p></div> : <><div className="mb-5 flex flex-wrap gap-3"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar plantilla, variante o código..." /><span className="flex items-center text-xs text-slate-500">{pricesQuery.data.prices.length} precios · {updated ? `Actualizado: ${updated}` : 'sin fecha'}{syncMessage ? ` · ${syncMessage}` : ''}</span></div><div className="card overflow-hidden">{roots.length ? roots.map((item) => <PriceNode key={item.name} item={item} depth={0} childrenByParent={tree.children} pricesByItem={pricesByItem} expanded={expanded} onToggle={(name) => setExpanded((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next })} onAdd={(selectedItem) => setSelected({ item: selectedItem })} onEdit={(selectedItem, price) => setSelected({ item: selectedItem, price })} />) : <div className="p-10 text-center muted">No hay productos para la búsqueda actual.</div>}</div></>}</section>
}
