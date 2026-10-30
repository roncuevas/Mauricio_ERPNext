import type { ItemPrice } from './types'

function currencyOf(price: ItemPrice) {
  return price.currency || 'MXN'
}

export function findComparablePurchase(selling: ItemPrice, prices: ItemPrice[]) {
  const candidates = prices.filter((price) => price.buying && price.item_code === selling.item_code && (price.uom || '') === (selling.uom || '') && currencyOf(price) === currencyOf(selling))
  const supplierCandidates = selling.supplier ? candidates.filter((price) => price.supplier === selling.supplier) : candidates
  return [...supplierCandidates].sort((left, right) => Number(left.price_list_rate ?? 0) - Number(right.price_list_rate ?? 0))[0] ?? null
}

export function findComparablePurchases(selling: ItemPrice, prices: ItemPrice[]) {
  const candidates = prices.filter((price) => price.buying && price.item_code === selling.item_code && (price.uom || '') === (selling.uom || '') && currencyOf(price) === currencyOf(selling))
  const bySupplier = new Map<string, ItemPrice>()
  for (const candidate of candidates) {
    const supplier = candidate.supplier || 'Proveedor general'
    const previous = bySupplier.get(supplier)
    if (!previous || Number(candidate.price_list_rate ?? 0) < Number(previous.price_list_rate ?? 0)) bySupplier.set(supplier, candidate)
  }
  return Array.from(bySupplier.values()).sort((left, right) => Number(left.price_list_rate ?? 0) - Number(right.price_list_rate ?? 0))
}

type PriceCandidate = Omit<Pick<ItemPrice, 'item_code' | 'price_list' | 'price_list_rate' | 'buying' | 'selling' | 'uom' | 'currency' | 'customer' | 'supplier' | 'batch_no' | 'packing_unit' | 'valid_from' | 'valid_upto' | 'name'>, 'name'> & { name?: string }

function sameOptionalValue(left?: string | null, right?: string | null) {
  return (left || '') === (right || '')
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Uses ERPNext's uniqueness dimensions and checks active dated prices when the editor leaves validity blank. */
export function findDuplicateItemPrice(prices: PriceCandidate[], candidate: PriceCandidate, excludeName?: string, stockUom?: string, today = localDateString()) {
  return prices.find((price) => price.name !== excludeName
    && price.item_code === candidate.item_code
    && price.price_list === candidate.price_list
    && (price.uom || stockUom || '') === (candidate.uom || stockUom || '')
    && (candidate.valid_from
      ? sameOptionalValue(price.valid_from, candidate.valid_from)
      : (!price.valid_from || price.valid_from <= today) && (!price.valid_upto || price.valid_upto >= today))
    && sameOptionalValue(price.customer, candidate.customer)
    && sameOptionalValue(price.supplier, candidate.supplier)
    && sameOptionalValue(price.batch_no, candidate.batch_no)
    && Number(price.packing_unit ?? 0) === Number(candidate.packing_unit ?? 0)) ?? null
}

/** Suggests an average from active prices in other lists with the same type, UOM, currency and party context. */
export function suggestComparableItemPrice(prices: PriceCandidate[], candidate: PriceCandidate, stockUom?: string, today = new Date().toISOString().slice(0, 10)) {
  const matches = prices.filter((price) => price.name !== candidate.name
    && price.item_code === candidate.item_code
    && Boolean(price.buying) === Boolean(candidate.buying)
    && Boolean(price.selling) === Boolean(candidate.selling)
    && price.price_list !== candidate.price_list
    && (price.uom || stockUom || '') === (candidate.uom || stockUom || '')
    && (price.currency || 'MXN') === (candidate.currency || 'MXN')
    && (!price.valid_from || price.valid_from <= today)
    && (!price.valid_upto || price.valid_upto >= today)
    && (candidate.buying ? sameOptionalValue(price.supplier, candidate.supplier) : sameOptionalValue(price.customer, candidate.customer)))
    .filter((price) => Number.isFinite(Number(price.price_list_rate)))

  if (!matches.length) return null
  const average = matches.reduce((sum, price) => sum + Number(price.price_list_rate), 0) / matches.length
  return { average, count: matches.length, prices: matches }
}

/** Calculates the active average from the opposite transaction type for a comparable item UOM and currency. */
export function averageComparableOppositeTypePrice(prices: ItemPrice[], candidate: ItemPrice, stockUom?: string, today = localDateString()) {
  const comparisonIsBuying = !candidate.buying
  const matches = prices.filter((price) => price.item_code === candidate.item_code
    && Boolean(price.buying) === comparisonIsBuying
    && (comparisonIsBuying ? Boolean(price.buying) : Boolean(price.selling))
    && (price.uom || stockUom || '') === (candidate.uom || stockUom || '')
    && (price.currency || 'MXN') === (candidate.currency || 'MXN')
    && (!price.valid_from || price.valid_from <= today)
    && (!price.valid_upto || price.valid_upto >= today))
    .filter((price) => Number.isFinite(Number(price.price_list_rate)))

  if (!matches.length) return null
  const average = matches.reduce((sum, price) => sum + Number(price.price_list_rate), 0) / matches.length
  return { average, count: matches.length, prices: matches }
}

export function calculateGrossMargin(selling: ItemPrice, purchase: ItemPrice) {
  const sale = Number(selling.price_list_rate ?? 0)
  const cost = Number(purchase.price_list_rate ?? 0)
  const amount = sale - cost
  return { amount, percentage: sale > 0 ? (amount / sale) * 100 : 0 }
}
