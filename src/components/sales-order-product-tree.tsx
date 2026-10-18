import { useMemo, useState } from 'react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { defaultUom, priceForUom } from '../lib/pos-catalog'
import { buildVariantTree } from '../lib/variant-cache'
import type { ItemPrice, ItemUom, VariantItem } from '../lib/types'

type ProductTreeProps = {
  items: VariantItem[]
  prices: ItemPrice[]
  priceList?: string
  search: string
  disabled?: boolean
  currency: string
  onSearchChange: (value: string) => void
  onAdd: (item: VariantItem, uom: ItemUom, rate: number) => void
}

function matchesItem(item: VariantItem, query: string) {
  if (!query) return true
  const values = [item.name, item.item_code, item.item_name, item.brand, item.item_group, item.stock_uom, item.sales_uom, ...(((item as { barcodes?: string[] }).barcodes) ?? [])]
  return values.some((value) => String(value ?? '').toLocaleLowerCase().includes(query))
}

function formatRate(rate: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(rate)
}

function ProductNode({ item, depth, childrenByParent, visibleNames, expanded, disabled, prices, priceList, currency, onToggle, onAdd }: {
  item: VariantItem
  depth: number
  childrenByParent: Map<string, VariantItem[]>
  visibleNames: Set<string>
  expanded: Set<string>
  disabled: boolean
  prices: ItemPrice[]
  priceList?: string
  currency: string
  onToggle: (name: string) => void
  onAdd: (item: VariantItem, uom: ItemUom, rate: number) => void
}) {
  const children = childrenByParent.get(item.name) ?? []
  const isTemplate = Boolean(item.has_variants) || children.length > 0
  const expandedNode = expanded.has(item.name)
  const [selectedUom, setSelectedUom] = useState(() => defaultUom(item).uom)
  const uom = item.uoms?.find((candidate) => candidate.uom === selectedUom) ?? defaultUom(item)
  const rate = priceForUom(item, uom.uom, prices, priceList)
  const visibleChildren = children.filter((child) => visibleNames.has(child.name))

  return <div className="price-node">
    <div className="price-node-row" style={{ paddingLeft: `${16 + depth * 28}px` }}>
      <div className="price-node-main">
        <div className="price-node-heading">
          <div className={`price-node-toggle${children.length ? '' : ' price-node-toggle-empty'}`}>
            {children.length > 0 && <button className="price-expand-button" type="button" aria-label={expandedNode ? `Ocultar variantes de ${item.item_name || item.name}` : `Mostrar variantes de ${item.item_name || item.name}`} aria-expanded={expandedNode} onClick={() => onToggle(item.name)}>{expandedNode ? '▾' : '▸'}</button>}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><strong className="price-node-title">{item.item_name || item.name}</strong>{isTemplate && <Badge tone="info">Plantilla</Badge>}{!isTemplate && item.variant_of && <Badge tone="neutral">Variante</Badge>}</div>
            <div className="price-node-meta"><span className="font-mono">{item.item_code || item.name}</span>{item.brand && <span>Marca: {item.brand}</span>}{item.stock_uom && <span>UOM stock: {item.stock_uom}</span>}{isTemplate ? <span>{children.length} variante(s) en caché</span> : <span>{rate > 0 ? `Precio: ${formatRate(rate, currency)}` : 'Sin precio en caché'}</span>}</div>
          </div>
        </div>
        {!isTemplate && <div className="price-entry-list">
          <div className="price-entry">
            <div className="price-entry-top"><span className="price-kind price-kind-selling">Venta</span><span className="price-amount">{rate > 0 ? formatRate(rate, currency) : 'Tarifa editable'}</span></div>
            <div className="price-entry-meta"><span>Lista: {priceList || 'Sin lista seleccionada'}</span><Badge tone={rate > 0 ? 'success' : 'warning'}>UOM: {uom.uom || '—'}</Badge>{rate === 0 && <span>ERPNext validará la tarifa al guardar</span>}</div>
            {!disabled && <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-3"><Select value={uom.uom || '__none__'} onValueChange={(value) => setSelectedUom(value === '__none__' ? '' : value)}><SelectTrigger className="min-w-32" aria-label={`UOM para ${item.item_name || item.name}`}><SelectValue placeholder="Selecciona UOM" /></SelectTrigger><SelectContent>{(item.uoms?.length ? item.uoms : [defaultUom(item)]).map((candidate) => <SelectItem key={candidate.uom} value={candidate.uom}>{candidate.uom}{candidate.conversion_factor !== 1 ? ` · ×${candidate.conversion_factor}` : ''}</SelectItem>)}</SelectContent></Select><Button type="button" size="compact" onClick={() => onAdd(item, uom, rate)}>Agregar</Button></div>}
          </div>
        </div>}
      </div>
    </div>
    {expandedNode && visibleChildren.map((child) => <ProductNode key={child.name} item={child} depth={depth + 1} childrenByParent={childrenByParent} visibleNames={visibleNames} expanded={expanded} disabled={disabled} prices={prices} priceList={priceList} currency={currency} onToggle={onToggle} onAdd={onAdd} />)}
  </div>
}

export function SalesOrderProductTree({ items, prices, priceList, search, disabled = false, currency, onSearchChange, onAdd }: ProductTreeProps) {
  const tree = useMemo(() => buildVariantTree(items), [items])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const query = search.trim().toLocaleLowerCase()
  const visibleNames = useMemo(() => {
    const visible = new Set<string>()
    const visit = (item: VariantItem): boolean => {
      const children = tree.children.get(item.name) ?? []
      const childVisible = children.some(visit)
      const matches = matchesItem(item, query)
      if (matches || childVisible) visible.add(item.name)
      return matches || childVisible
    }
    tree.roots.forEach(visit)
    items.filter((item) => !visible.has(item.name) && !item.variant_of).forEach(visit)
    return visible
  }, [items, query, tree.children, tree.roots])
  const effectiveExpanded = useMemo(() => {
    if (!query) return expanded
    const result = new Set(expanded)
    const expandAncestors = (item: VariantItem) => {
      if (!item.variant_of) return
      result.add(item.variant_of)
      const parent = items.find((candidate) => candidate.name === item.variant_of)
      if (parent) expandAncestors(parent)
    }
    items.filter((item) => matchesItem(item, query)).forEach(expandAncestors)
    return result
  }, [expanded, items, query])
  const roots = tree.roots.filter((item) => visibleNames.has(item.name))

  return <div className="grid gap-3">
    <div className="relative"><span className="pointer-events-none absolute left-3 top-2.5 text-[var(--color-muted)]" aria-hidden="true">⌕</span><Input className="pl-9" value={search} disabled={disabled} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar producto, variante, código, marca, UOM o barcode" aria-label="Buscar producto" /></div>
    <div className="prices-tree overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      {roots.map((item) => <ProductNode key={item.name} item={item} depth={0} childrenByParent={tree.children} visibleNames={visibleNames} expanded={effectiveExpanded} disabled={disabled} prices={prices} priceList={priceList} currency={currency} onToggle={(name) => setExpanded((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next })} onAdd={onAdd} />)}
      {!roots.length && <p className="p-8 text-center text-sm text-[var(--color-muted)]">{items.length ? 'No hay productos que coincidan con la búsqueda.' : 'No hay caché de productos. Refresca Items y Variantes antes de crear la venta.'}</p>}
    </div>
    <p className="text-xs text-[var(--color-muted)]">Las plantillas agrupan variantes y no se pueden agregar directamente. Selecciona la UOM de una variante para ver su tarifa en caché antes de agregarla.</p>
  </div>
}
