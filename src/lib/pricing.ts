import type { ItemPrice } from './types'

function currencyOf(price: ItemPrice) {
  return price.currency || 'MXN'
}

export function findComparablePurchase(selling: ItemPrice, prices: ItemPrice[]) {
  const candidates = prices.filter((price) => price.buying && price.item_code === selling.item_code && (price.uom || '') === (selling.uom || '') && currencyOf(price) === currencyOf(selling))
  const supplierCandidates = selling.supplier ? candidates.filter((price) => price.supplier === selling.supplier) : candidates
  return [...supplierCandidates].sort((left, right) => Number(left.price_list_rate ?? 0) - Number(right.price_list_rate ?? 0))[0] ?? null
}

export function calculateGrossMargin(selling: ItemPrice, purchase: ItemPrice) {
  const sale = Number(selling.price_list_rate ?? 0)
  const cost = Number(purchase.price_list_rate ?? 0)
  const amount = sale - cost
  return { amount, percentage: sale > 0 ? (amount / sale) * 100 : 0 }
}
