export type CacheKind = 'catalog' | 'prices' | 'stock' | 'suppliers' | 'doctypes' | 'uom' | 'customers' | 'salesOrders' | 'posContext' | 'shifts' | 'quotations'
export type CacheStatus = 'missing' | 'fresh' | 'stale'
export type TimestampedCache = { updatedAt?: string }

export const CACHE_TTL_MS: Record<CacheKind, number> = {
  catalog: 30 * 60 * 1000,
  prices: 15 * 60 * 1000,
  stock: 10 * 60 * 1000,
  suppliers: 60 * 60 * 1000,
  doctypes: 60 * 60 * 1000,
  uom: 24 * 60 * 60 * 1000,
  customers: 60 * 60 * 1000,
  salesOrders: 5 * 60 * 1000,
  posContext: 30 * 60 * 1000,
  shifts: 5 * 60 * 1000,
  quotations: 5 * 60 * 1000,
}

export function getCacheStatus(kind: CacheKind, cache: TimestampedCache | null | undefined, now = Date.now()): CacheStatus {
  if (!cache?.updatedAt) return 'missing'
  const updatedAt = Date.parse(cache.updatedAt)
  return Number.isFinite(updatedAt) && now - updatedAt < CACHE_TTL_MS[kind] ? 'fresh' : 'stale'
}

export function cacheStatusLabel(status: CacheStatus) {
  if (status === 'fresh') return 'vigente'
  if (status === 'stale') return 'antigua; refresca para actualizar'
  return 'sin caché'
}
