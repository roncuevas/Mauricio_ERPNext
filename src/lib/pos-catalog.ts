import { formatMoney } from './pos'
import type { CachedItem, ItemPrice, ItemUom } from './types'

export type PriceIndex = Map<string, ItemPrice[]>

export function buildPriceIndex(prices: ItemPrice[], priceList?: string): PriceIndex {
  const index: PriceIndex = new Map()
  prices.filter((price) => price.selling && (!priceList || price.price_list === priceList)).forEach((price) => {
    const key = price.item_code || ''
    if (!key) return
    index.set(key, [...(index.get(key) ?? []), price])
  })
  return index
}

export function defaultUom(item: CachedItem): ItemUom {
  return item.uoms?.find((uom) => uom.uom === item.sales_uom) ?? item.uoms?.find((uom) => uom.uom === item.stock_uom) ?? { uom: item.stock_uom || item.sales_uom || '', conversion_factor: 1 }
}

export function uomOptionLabel(item: CachedItem, uom: ItemUom) {
  const defaultUomName = defaultUom(item).uom
  if (uom.uom === defaultUomName) return `${uom.uom} · Default`
  return `${uom.uom} · ${uom.conversion_factor} ${item.stock_uom || defaultUomName}`
}

export function priceForUom(item: CachedItem, uom: string, prices: ItemPrice[], priceList?: string) {
  const matches = prices.filter((price) => [item.name, item.item_code].includes(price.item_code) && price.selling && (!priceList || price.price_list === priceList))
  return priceForUomFromMatches(item, uom, matches)
}

export function priceForUomFromIndex(item: CachedItem, uom: string, index: PriceIndex) {
  const matches = [item.name, item.item_code].flatMap((code) => code ? index.get(code) ?? [] : [])
  return priceForUomFromMatches(item, uom, matches)
}

function priceForUomFromMatches(item: CachedItem, uom: string, matches: ItemPrice[]) {
  const exact = matches.find((price) => (price.uom || item.stock_uom) === uom)
  if (exact) return Number(exact.price_list_rate ?? 0)
  if (uom === item.stock_uom) return Number(matches.find((price) => !price.uom)?.price_list_rate ?? matches[0]?.price_list_rate ?? 0)
  return 0
}

export function defaultPrice(item: CachedItem, prices: ItemPrice[], priceList?: string) {
  return priceForUom(item, defaultUom(item).uom, prices, priceList)
}

export function variantPriceRange(variants: CachedItem[], prices: ItemPrice[], priceList: string | undefined, currency: string) {
  const codes = new Set(variants.flatMap((variant) => [variant.name, variant.item_code].filter(Boolean)))
  const rates = prices.filter((price) => price.selling && codes.has(price.item_code || '') && (!priceList || price.price_list === priceList)).map((price) => Number(price.price_list_rate ?? 0)).filter((rate) => Number.isFinite(rate) && rate > 0)
  if (!rates.length) return undefined
  const minimum = Math.min(...rates)
  const maximum = Math.max(...rates)
  return minimum === maximum ? formatMoney(minimum, currency) : `${formatMoney(minimum, currency)} – ${formatMoney(maximum, currency)}`
}
