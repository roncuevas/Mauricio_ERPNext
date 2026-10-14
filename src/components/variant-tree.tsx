/* eslint-disable react-refresh/only-export-components */
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { getVariantAttributeCoverage, hasMultipleUoms } from '../lib/variant-cache'
import { searchScore } from '../lib/search'
import type { VariantItem } from '../lib/types'

const VIRTUALIZATION_THRESHOLD = 200

export function variantMatches(item: VariantItem, search: string) {
  return variantSearchScore(item, search) !== null
}

export function variantSearchScore(item: VariantItem, search: string) {
  return searchScore(search, [
    { value: item.item_name, weight: 5 },
    { value: item.name, weight: 5 },
    { value: item.brand, weight: 3 },
    { value: item.item_group, weight: 2 },
    { value: item.stock_uom, weight: 1 },
    { value: item.attributes, weight: 1 },
  ])
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
  return <div className="variant-uom-summary"><div className="variant-uom-heading"><span className="variant-stock-badge">Stock: {stockUom}</span><span>conversiones relativas al stock</span></div>{alternatives.map((uom, index) => <div className={`variant-conversion ${colors[index % colors.length]}`} key={`${item.name}-${uom.uom}`}><span>1 {uom.uom}</span><span className="font-bold">=</span><span>{formatFactor(uom.conversion_factor)} {stockUom}</span><span className="variant-conversion-secondary">· 2 {uom.uom} = {formatFactor(uom.conversion_factor * 2)} {stockUom}</span></div>)}</div>
}

function AttributeCoverageSummary({ template, variants }: { template: VariantItem; variants: VariantItem[] }) {
  const coverage = getVariantAttributeCoverage(template, variants)
  if (!coverage.length) return <div className="variant-attribute-empty">Sin atributos configurados en esta plantilla</div>
  return <div className="variant-coverage"><div className="variant-coverage-heading"><span>Atributos y cobertura</span><span>{coverage.filter((entry) => !entry.missing.length).length}/{coverage.length} completos</span></div>{coverage.map((entry) => <div className="variant-coverage-row" key={`${template.name}-${entry.attribute}`}><div className="variant-coverage-title"><strong>{entry.attribute}</strong><span className={entry.missing.length ? 'variant-coverage-missing' : 'variant-coverage-complete'}>{entry.missing.length ? `Faltan ${entry.missing.length}` : 'Completo'}</span></div><div className="variant-value-chips">{entry.expected.length ? entry.expected.map((value) => <span className={entry.missing.includes(value) ? 'variant-value-missing' : 'variant-value-present'} key={`${entry.attribute}-${value}`}>{value}</span>) : <span className="variant-coverage-observed">Valores detectados: {entry.created.length}</span>}</div></div>)}</div>
}

export function VariantTreeNode({ item, childrenByParent, depth = 0, uomOnly = false, search = '', expanded, onToggle }: { item: VariantItem; childrenByParent: Map<string, VariantItem[]>; depth?: number; uomOnly?: boolean; search?: string; expanded: Set<string>; onToggle: (name: string) => void }) {
  const children = childrenByParent.get(item.name) ?? []
  const visibleChildren = children.filter((child) => variantNodeIsVisible(child, childrenByParent, uomOnly, search))
  const multipleUoms = hasMultipleUoms(item)
  if (uomOnly && !multipleUoms && !visibleChildren.length) return null
  const isTemplate = Boolean(item.has_variants) || children.length > 0
  const isExpanded = expanded.has(item.name)
  return <div className="variant-tree-node"><div className={`variant-node-row${isExpanded ? ' variant-node-row-expanded' : ''}`} style={{ paddingLeft: `${16 + depth * 28}px` }}><div className="variant-node-main"><div className="variant-node-heading"><div className={`variant-node-toggle${children.length ? '' : ' variant-node-toggle-empty'}`}>{children.length > 0 && <button className="variant-expand-button" aria-label={isExpanded ? `Ocultar variantes de ${item.name}` : `Mostrar variantes de ${item.name}`} aria-expanded={isExpanded} onClick={() => onToggle(item.name)}>{isExpanded ? '▾' : '▸'}</button>}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="variant-node-title">{item.item_name || item.name}</strong>{isTemplate && <span className="variant-badge variant-badge-template">Plantilla</span>}{multipleUoms && <span className="variant-badge variant-badge-uom">{item.uoms?.length} UOM</span>}{uomOnly && !multipleUoms && <span className="variant-badge variant-badge-context">Contexto</span>}{item.disabled ? <span className="variant-badge variant-badge-disabled">Deshabilitado</span> : null}</div><div className="variant-node-meta"><span className="font-mono">{item.name}</span>{item.stock_uom && <span>Stock: {item.stock_uom}</span>}{children.length > 0 && <span>{children.length} variantes</span>}</div></div></div>{isTemplate && <AttributeCoverageSummary template={item} variants={children} />}{multipleUoms && <UomConversionSummary item={item} />}</div><div className="variant-node-actions"><Link className="button button-secondary" to={`/variants/${encodeURIComponent(item.name)}`}>Editar</Link><Link className="button button-secondary" to={`/items/${encodeURIComponent(item.name)}/uoms`}>UOM</Link>{isTemplate && <Link className="button button-primary" to={`/variants/new?template=${encodeURIComponent(item.name)}`}>Nueva variante</Link>}</div></div>{isExpanded && <div className="variant-children"><div className="variant-children-label">Variantes de {item.item_name || item.name}</div>{visibleChildren.map((child) => <VariantTreeNode key={child.name} item={child} childrenByParent={childrenByParent} depth={depth + 1} uomOnly={uomOnly} search={search} expanded={expanded} onToggle={onToggle} />)}</div>}</div>
}

export function VariantRoots({ items, childrenByParent, uomOnly, search, expanded, onToggle }: { items: VariantItem[]; childrenByParent: Map<string, VariantItem[]>; uomOnly: boolean; search: string; expanded: Set<string>; onToggle: (name: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const orderedItems = [...items].sort((left, right) => (variantSearchScore(right, search)?.score ?? 0) - (variantSearchScore(left, search)?.score ?? 0))
  const virtualized = items.length > VIRTUALIZATION_THRESHOLD
  const rowVirtualizer = useVirtualizer({ count: virtualized ? items.length : 0, getScrollElement: () => scrollRef.current, estimateSize: () => 80, overscan: 8 })
  if (!virtualized) return <>{orderedItems.map((item) => <VariantTreeNode key={item.name} item={item} childrenByParent={childrenByParent} uomOnly={uomOnly} search={search} expanded={expanded} onToggle={onToggle} />)}</>
  return <div ref={scrollRef} className="max-h-[70vh] overflow-auto"><div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>{rowVirtualizer.getVirtualItems().map((virtualRow) => { const item = orderedItems[virtualRow.index]; return <div key={item.name} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="absolute left-0 w-full" style={{ transform: `translateY(${virtualRow.start}px)` }}><VariantTreeNode item={item} childrenByParent={childrenByParent} uomOnly={uomOnly} search={search} expanded={expanded} onToggle={onToggle} /></div> })}</div></div>
}
