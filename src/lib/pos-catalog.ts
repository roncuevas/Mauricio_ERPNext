import { formatMoney } from './pos'
import type { CachedItem, ItemPrice, ItemUom } from './types'

export function defaultUom(item: CachedItem): ItemUom {
  return item.uoms?.find((uom) => uom.uom === item.sales_uom) ?? item.uoms?.find((uom) => uom.uom === item.stock_uom) ?? { uom: item.stock_uom || item.sales_uom || '', conversion_factor: 1 }
}

export function priceForUom(item: CachedItem, uom: string, prices: ItemPrice[], priceList?: string) {
  const matches = prices.filter((price) => [item.name, item.item_code].includes(price.item_code) && price.selling && (!priceList || price.price_list === priceList))
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
