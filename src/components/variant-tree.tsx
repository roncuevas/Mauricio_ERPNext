/* eslint-disable react-refresh/only-export-components */
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { hasMultipleUoms } from '../lib/variant-cache'
import { fuzzyMatch } from '../lib/search'
import type { VariantItem } from '../lib/types'

const VIRTUALIZATION_THRESHOLD = 200

export function variantMatches(item: VariantItem, search: string) {
  return fuzzyMatch(search, [item])
}

export function variantNodeIsVisible(item: VariantItem, childrenByParent: Map<string, VariantItem[]>, uomOnly: boolean, search: string): boolean {
  const children = childrenByParent.get(item.name) ?? []
  return (!uomOnly || hasMultipleUoms(item) || children.some((child) => variantNodeIsVisible(child, childrenByParent, true, search))) && (!search || variantMatches(item, search) || children.some((child) => variantNodeIsVisible(child, childrenByParent, uomOnly, search)))
}

function formatFactor(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('es-MX', { maximumFractionDigits: 4 })
}

function UomConversionSummary({ item }: { item: VariantItem }) {
  const stockUom = item.stock_uom ?? item.uoms?.[0]?.uom ?? 'Stock'
  const alternatives = (item.uoms ?? []).filter((uom) => uom.uom !== stockUom)
  if (!alternatives.length) return null
  const colors = ['border-emerald-200 bg-emerald-50 text-emerald-800', 'border-violet-200 bg-violet-50 text-violet-800', 'border-amber-200 bg-amber-50 text-amber-800', 'border-rose-200 bg-rose-50 text-rose-800']
  return <div className="mt-3 grid gap-2"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-800">Stock: {stockUom}</span><span className="text-slate-400">conversiones relativas al stock</span></div>{alternatives.map((uom, index) => <div className={`flex flex-wrap items-center gap-2 rounded border px-2 py-2 text-xs font-medium ${colors[index % colors.length]}`} key={`${item.name}-${uom.uom}`}><span>1 {uom.uom}</span><span className="font-bold">=</span><span>{formatFactor(uom.conversion_factor)} {stockUom}</span><span className="opacity-70">· 2 {uom.uom} = {formatFactor(uom.conversion_factor * 2)} {stockUom}</span></div>)}</div>
}

export function VariantTreeNode({ item, childrenByParent, depth = 0, uomOnly = false, search = '', expanded, onToggle }: { item: VariantItem; childrenByParent: Map<string, VariantItem[]>; depth?: number; uomOnly?: boolean; search?: string; expanded: Set<string>; onToggle: (name: string) => void }) {
  const children = childrenByParent.get(item.name) ?? []
  const visibleChildren = children.filter((child) => variantNodeIsVisible(child, childrenByParent, uomOnly, search))
  const multipleUoms = hasMultipleUoms(item)
  if (uomOnly && !multipleUoms && !visibleChildren.length) return null
  const isTemplate = Boolean(item.has_variants) || children.length > 0
  const isExpanded = expanded.has(item.name)
  return <div><div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ paddingLeft: `${16 + depth * 28}px` }}><div className="flex min-w-0 flex-1 items-start gap-2"><div className="w-10 shrink-0">{children.length > 0 && <button className="inline-flex size-10 items-center justify-center rounded-lg text-2xl font-bold leading-none text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={isExpanded ? `Ocultar variantes de ${item.name}` : `Mostrar variantes de ${item.name}`} aria-expanded={isExpanded} onClick={() => onToggle(item.name)}>{isExpanded ? '▾' : '▸'}</button>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-slate-900">{item.item_name || item.name}</strong>{isTemplate && <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Plantilla</span>}{multipleUoms && <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{item.uoms?.length} UOM</span>}{uomOnly && !multipleUoms && <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Contexto</span>}{item.disabled ? <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Deshabilitado</span> : null}</div><div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500"><span className="font-mono">{item.name}</span>{item.stock_uom && <span>Stock: {item.stock_uom}</span>}{children.length > 0 && <span>{children.length} variantes</span>}</div>{multipleUoms && <UomConversionSummary item={item} />}</div></div><div className="flex shrink-0 gap-2"><Link className="button button-secondary" to={`/variants/${encodeURIComponent(item.name)}`}>Editar</Link>{isTemplate && <Link className="button button-primary" to={`/variants/new?template=${encodeURIComponent(item.name)}`}>Nueva variante</Link>}</div></div>{isExpanded && visibleChildren.map((child) => <VariantTreeNode key={child.name} item={child} childrenByParent={childrenByParent} depth={depth + 1} uomOnly={uomOnly} search={search} expanded={expanded} onToggle={onToggle} />)}</div>
}

export function VariantRoots({ items, childrenByParent, uomOnly, search, expanded, onToggle }: { items: VariantItem[]; childrenByParent: Map<string, VariantItem[]>; uomOnly: boolean; search: string; expanded: Set<string>; onToggle: (name: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualized = items.length > VIRTUALIZATION_THRESHOLD
  const rowVirtualizer = useVirtualizer({ count: virtualized ? items.length : 0, getScrollElement: () => scrollRef.current, estimateSize: () => 80, overscan: 8 })
  if (!virtualized) return <>{items.map((item) => <VariantTreeNode key={item.name} item={item} childrenByParent={childrenByParent} uomOnly={uomOnly} search={search} expanded={expanded} onToggle={onToggle} />)}</>
  return <div ref={scrollRef} className="max-h-[70vh] overflow-auto"><div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>{rowVirtualizer.getVirtualItems().map((virtualRow) => { const item = items[virtualRow.index]; return <div key={item.name} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="absolute left-0 w-full" style={{ transform: `translateY(${virtualRow.start}px)` }}><VariantTreeNode item={item} childrenByParent={childrenByParent} uomOnly={uomOnly} search={search} expanded={expanded} onToggle={onToggle} /></div> })}</div></div>
}
