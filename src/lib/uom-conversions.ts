import type { ItemUom } from './types'

export function rebaseUomConversions(currentStockUom: string, nextStockUom: string, conversions: ItemUom[]) {
  if (currentStockUom === nextStockUom) return [...conversions]

  const unique = new Map<string, number>([[currentStockUom, 1]])
  for (const row of conversions) {
    const uom = row.uom.trim()
    const factor = Number(row.conversion_factor)
    if (uom && !unique.has(uom) && Number.isFinite(factor) && factor > 0) unique.set(uom, factor)
  }

  const nextBaseFactor = unique.get(nextStockUom)
  if (!nextBaseFactor) return null

  return Array.from(unique, ([uom, factor]) => ({ uom, conversion_factor: factor / nextBaseFactor }))
    .filter((row) => row.uom !== nextStockUom)
}

export function buildItemUomRows(stockUom: string, conversions: ItemUom[]) {
  return [{ uom: stockUom, conversion_factor: 1 }, ...conversions]
}

export function itemUomRowsMatch(document: Record<string, unknown>, expected: ItemUom[]) {
  if (!Array.isArray(document.uoms)) return false
  const actual = new Map<string, number>()
  for (const row of document.uoms) {
    if (!row || typeof row !== 'object') return false
    const entry = row as Record<string, unknown>
    const uom = String(entry.uom ?? '')
    const factor = Number(entry.conversion_factor)
    if (!uom || !Number.isFinite(factor) || factor <= 0 || actual.has(uom)) return false
    actual.set(uom, factor)
  }

  return actual.size === expected.length && expected.every((row) => {
    const factor = actual.get(row.uom)
    return factor !== undefined && Math.abs(factor - row.conversion_factor) <= Math.max(1, Math.abs(row.conversion_factor)) * 1e-9
  })
}
