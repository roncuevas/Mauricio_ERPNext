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
