import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { buildPriceIndex, defaultUom, priceForUomFromIndex, uomOptionLabel, type PriceIndex } from '../lib/pos-catalog'
import { buildVariantTree } from '../lib/variant-cache'
import { searchScore } from '../lib/search'
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

const PAGE_SIZE = 50

function matchesItem(item: VariantItem, query: string) {
  if (!query) return true
  const values = [item.name, item.item_code, item.item_name, item.brand, item.item_group, item.stock_uom, item.sales_uom, ...(((item as { barcodes?: string[] }).barcodes) ?? [])]
  return searchScore(query, values.map((value) => ({ value, weight: 1 }))) !== null
}

function formatRate(rate: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(rate)
}

function ProductNode({ item, depth, childrenByParent, visibleNames, expanded, disabled, priceIndex, priceList, currency, onToggle, onAdd }: {
  item: VariantItem
  depth: number
  childrenByParent: Map<string, VariantItem[]>
  visibleNames: Set<string>
  expanded: Set<string>
  disabled: boolean
  priceIndex: PriceIndex
  priceList?: string
  currency: string
  onToggle: (name: string) => void
  onAdd: (item: VariantItem, uom: ItemUom, rate: number) => void
}) {
  const { t } = useTranslation()
  const children = childrenByParent.get(item.name) ?? []
  const isTemplate = Boolean(item.has_variants) || children.length > 0
  const expandedNode = expanded.has(item.name)
  const [selectedUom, setSelectedUom] = useState(() => defaultUom(item).uom)
  const uom = item.uoms?.find((candidate) => candidate.uom === selectedUom) ?? defaultUom(item)
  const rate = priceForUomFromIndex(item, uom.uom, priceIndex)
  const visibleChildren = children.filter((child) => visibleNames.has(child.name))

  return <div className="price-node">
    <div className="price-node-row" style={{ paddingLeft: `${16 + depth * 28}px` }}>
      <div className="price-node-main">
        <div className="price-node-heading">
          <div className={`price-node-toggle${children.length ? '' : ' price-node-toggle-empty'}`}>
            {children.length > 0 && <button className="price-expand-button" type="button" aria-label={expandedNode ? t("salesOrderTree.hideVariants", { name: item.item_name || item.name }) : t("salesOrderTree.showVariants", { name: item.item_name || item.name })} aria-expanded={expandedNode} onClick={() => onToggle(item.name)}>{expandedNode ? '▾' : '▸'}</button>}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><strong className="price-node-title">{item.item_name || item.name}</strong>{isTemplate && <Badge tone="info">{t("salesOrderTree.template")}</Badge>}{!isTemplate && item.variant_of && <Badge tone="neutral">{t("salesOrderTree.variant")}</Badge>}</div>
            <div className="price-node-meta"><span className="font-mono">{item.item_code || item.name}</span>{item.brand && <span>{t("salesOrderTree.brand", { value: item.brand })}</span>}{item.stock_uom && <span>{t("salesOrderTree.stockUom", { value: item.stock_uom })}</span>}{isTemplate ? <span>{t("salesOrderTree.cachedVariants", { count: children.length })}</span> : <span>{rate > 0 ? t("salesOrderTree.price", { value: formatRate(rate, currency) }) : t("salesOrderTree.noCachedPrice")}</span>}</div>
          </div>
        </div>
        {!isTemplate && <div className="price-entry-list">
          <div className="price-entry">
            <div className="price-entry-top"><span className="price-kind price-kind-selling">{t("salesOrderTree.sale")}</span><span className="price-amount">{rate > 0 ? formatRate(rate, currency) : t("salesOrderTree.editableRate")}</span></div>
            <div className="price-entry-meta"><span>{t("salesOrderTree.list", { value: priceList || t("salesOrderTree.noList") })}</span><Badge tone={rate > 0 ? 'success' : 'warning'}>{t("salesOrderTree.uom", { value: uom.uom || '—' })}</Badge>{rate === 0 && <span>{t("salesOrderTree.validateRate")}</span>}</div>
            {!disabled && <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-3"><Select value={uom.uom || '__none__'} onValueChange={(value) => setSelectedUom(value === '__none__' ? '' : value)}><SelectTrigger className="min-w-32" aria-label={t("salesOrderTree.uomFor", { name: item.item_name || item.name })}><SelectValue placeholder={t("salesOrderTree.selectUom")} /></SelectTrigger><SelectContent>{(item.uoms?.length ? item.uoms : [defaultUom(item)]).map((candidate) => <SelectItem key={candidate.uom} value={candidate.uom}>{uomOptionLabel(item, candidate)}</SelectItem>)}</SelectContent></Select><Button type="button" size="compact" onClick={() => onAdd(item, uom, rate)}>{t("salesOrderTree.add")}</Button></div>}
          </div>
        </div>}
      </div>
    </div>
    {expandedNode && visibleChildren.map((child) => <ProductNode key={child.name} item={child} depth={depth + 1} childrenByParent={childrenByParent} visibleNames={visibleNames} expanded={expanded} disabled={disabled} priceIndex={priceIndex} priceList={priceList} currency={currency} onToggle={onToggle} onAdd={onAdd} />)}
  </div>
}

export function SalesOrderProductTree({ items, prices, priceList, search, disabled = false, currency, onSearchChange, onAdd }: ProductTreeProps) {
  const { t } = useTranslation()
  const tree = useMemo(() => buildVariantTree(items), [items])
  const itemByName = useMemo(() => new Map(items.map((item) => [item.name, item])), [items])
  const priceIndex = useMemo(() => buildPriceIndex(prices, priceList), [prices, priceList])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const query = search.trim()
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
      const parent = itemByName.get(item.variant_of)
      if (parent) expandAncestors(parent)
    }
    items.filter((item) => matchesItem(item, query)).forEach(expandAncestors)
    return result
  }, [expanded, itemByName, items, query])
  const roots = tree.roots.filter((item) => visibleNames.has(item.name))
  const visibleRoots = roots.slice(0, page * PAGE_SIZE)

  useEffect(() => setPage(1), [items, query])

  return <div className="grid gap-3">
    <div className="relative"><span className="pointer-events-none absolute left-3 top-2.5 text-[var(--color-muted)]" aria-hidden="true">⌕</span><Input className="pl-9" value={search} disabled={disabled} onChange={(event) => onSearchChange(event.target.value)} placeholder={t("salesOrderTree.searchPlaceholder")} aria-label={t("salesOrderTree.searchLabel")} /></div>
    <div className="prices-tree overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      {visibleRoots.map((item) => <ProductNode key={item.name} item={item} depth={0} childrenByParent={tree.children} visibleNames={visibleNames} expanded={effectiveExpanded} disabled={disabled} priceIndex={priceIndex} priceList={priceList} currency={currency} onToggle={(name) => setExpanded((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next })} onAdd={onAdd} />)}
      {!roots.length && <p className="p-8 text-center text-sm text-[var(--color-muted)]">{items.length ? t("salesOrderTree.noMatches") : t("salesOrderTree.noCache")}</p>}
    </div>
    {roots.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--color-muted)]">{t("salesOrderTree.showing", { shown: Math.min(visibleRoots.length, roots.length), total: roots.length })}</p>{visibleRoots.length < roots.length && <Button type="button" variant="secondary" onClick={() => setPage((current) => current + 1)}>{t("salesOrderTree.loadMore")}</Button>}</div>}
    <p className="text-xs text-[var(--color-muted)]">{t("salesOrderTree.hint")}</p>
  </div>
}
