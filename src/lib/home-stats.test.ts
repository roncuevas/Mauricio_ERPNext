import { describe, expect, it } from 'vitest'
import { buildHomeStats } from './home-stats'
import type { HomeCacheData } from './cache-manager'

const overview = (id: HomeCacheData['overview'][number]['id'], status: HomeCacheData['overview'][number]['status'], count = 0): HomeCacheData['overview'][number] => ({ id, label: id, description: '', doctypes: [], kind: 'catalog', status, count })

describe('buildHomeStats', () => {
  it('calculates operational metrics from local caches', () => {
    const data: HomeCacheData = {
      overview: [overview('products', 'fresh', 12), overview('variants', 'stale', 4), overview('prices', 'fresh', 20), overview('stock', 'fresh', 2), overview('quotations', 'missing', 0)],
      stock: { profileId: 'p1', updatedAt: '2026-10-18T10:00:00Z', companies: [], warehouses: [], bins: [{ item_code: 'A', warehouse: 'W', stock_value: 100, projected_qty: 3 }, { item_code: 'B', warehouse: 'W', stock_value: 50, projected_qty: -1 }] },
      salesOrders: { profileId: 'p1', schemaVersion: 2, updatedAt: '2026-10-18T10:00:00Z', buckets: [{ company: 'C', date: '2026-10-18', updatedAt: '2026-10-18T10:00:00Z', salesOrders: [{ name: 'SO-1', customer: 'Customer', company: 'C', transaction_date: '2026-10-18', grand_total: 250 }] }] },
      quotations: { profileId: 'p1', updatedAt: '2026-10-18T10:00:00Z', data: { company: 'C', quotations: [{ name: 'Q-1', grand_total: 90 }] } },
      shifts: { profileId: 'p1', updatedAt: '2026-10-18T10:00:00Z', data: { user: 'user@example.com', profiles: [], openings: [{ name: 'POS-O-1', status: 'Open' }] } },
    }

    expect(buildHomeStats(data, '2026-10-18')).toMatchObject({ products: 12, variants: 4, prices: 20, stockBins: 2, stockValue: 150, negativeStock: 1, ordersToday: 1, ordersTodayTotal: 250, quotations: 1, quotationsTotal: 90, openShifts: 1, freshCaches: 3, staleCaches: 1, missingCaches: 1, errorCaches: 0 })
  })

  it('returns safe empty values without caches', () => {
    expect(buildHomeStats(undefined, '2026-10-18')).toMatchObject({ products: 0, stockBins: 0, stockValue: 0, ordersToday: 0, quotations: 0, openShifts: 0, freshCaches: 0, missingCaches: 0 })
  })
})
