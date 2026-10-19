import type { HomeCacheData } from './cache-manager'

export type HomeStats = {
  products: number
  variants: number
  prices: number
  stockBins: number
  stockValue: number
  negativeStock: number
  ordersToday: number
  ordersTodayTotal: number
  quotations: number
  quotationsTotal: number
  openShifts: number
  freshCaches: number
  staleCaches: number
  missingCaches: number
  errorCaches: number
}

function count(overview: HomeCacheData['overview'], id: HomeCacheData['overview'][number]['id']) {
  return overview.find((entry) => entry.id === id)?.count ?? 0
}

function amount(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function buildHomeStats(data: HomeCacheData | undefined, date: string): HomeStats {
  const overview = data?.overview ?? []
  const orders = data?.salesOrders?.buckets.find((bucket) => bucket.date === date)?.salesOrders ?? []
  const quotations = data?.quotations?.data.quotations ?? []
  const bins = data?.stock?.bins ?? []
  const statuses = overview.reduce((result, entry) => ({ ...result, [entry.status]: result[entry.status] + 1 }), { fresh: 0, stale: 0, missing: 0, error: 0 } as Record<string, number>)

  return {
    products: count(overview, 'products'),
    variants: count(overview, 'variants'),
    prices: count(overview, 'prices'),
    stockBins: bins.length || count(overview, 'stock'),
    stockValue: bins.reduce((total, bin) => total + amount(bin.stock_value), 0),
    negativeStock: bins.filter((bin) => amount(bin.projected_qty) < 0).length,
    ordersToday: orders.length,
    ordersTodayTotal: orders.reduce((total, order) => total + amount(order.grand_total ?? order.total), 0),
    quotations: quotations.length || count(overview, 'quotations'),
    quotationsTotal: quotations.reduce((total, quotation) => total + amount(quotation.grand_total ?? quotation.total), 0),
    openShifts: data?.shifts?.data.openings.filter((opening) => opening.status === 'Open').length ?? 0,
    freshCaches: statuses.fresh,
    staleCaches: statuses.stale,
    missingCaches: statuses.missing,
    errorCaches: statuses.error,
  }
}
