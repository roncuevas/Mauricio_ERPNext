import type { CustomerCatalogCache, SalesOrderCacheBucket, SalesOrderCatalogCache, SalesOrderSummary } from './types'
import { createCacheStore } from './indexed-db'

const cacheStoreConfig = {
  databaseName: 'mauricio-erpnext-sales-orders',
  version: 3,
  additionalStoreNames: ['customers', 'sales-orders'],
}
const customerStore = createCacheStore<CustomerCatalogCache>({ ...cacheStoreConfig, storeName: 'customers' })
const orderStore = createCacheStore<SalesOrderCatalogCache>({ ...cacheStoreConfig, storeName: 'sales-orders' })
export const readCustomerCatalog = customerStore.read
export const writeCustomerCatalog = customerStore.write

type LegacySalesOrderCache = { profileId: string; updatedAt: string; company?: string; date?: string; salesOrders?: SalesOrderSummary[] }

export async function readSalesOrderCatalog(profileId: string): Promise<SalesOrderCatalogCache | null> {
  const raw = await orderStore.read(profileId) as (SalesOrderCatalogCache | LegacySalesOrderCache | null)
  if (!raw) return null
  if ('buckets' in raw && Array.isArray(raw.buckets)) return raw
  if ('company' in raw && 'date' in raw && 'salesOrders' in raw && raw.company && raw.date && raw.salesOrders) return { profileId, schemaVersion: 2, updatedAt: raw.updatedAt, buckets: [{ company: raw.company, date: raw.date, updatedAt: raw.updatedAt, salesOrders: raw.salesOrders }] }
  return { profileId, schemaVersion: 2, updatedAt: raw.updatedAt, buckets: [] }
}

export async function writeSalesOrderCatalog(cache: SalesOrderCatalogCache) {
  return orderStore.write(cache)
}

export function salesOrderBucket(cache: SalesOrderCatalogCache | null | undefined, company: string, date: string) {
  return cache?.buckets.find((bucket) => bucket.company === company && bucket.date === date) ?? null
}

export function upsertSalesOrderBucket(cache: SalesOrderCatalogCache | null | undefined, bucket: SalesOrderCacheBucket, profileId: string): SalesOrderCatalogCache {
  const current = cache ?? { profileId, schemaVersion: 2 as const, updatedAt: bucket.updatedAt, buckets: [] }
  return { ...current, schemaVersion: 2, updatedAt: bucket.updatedAt, buckets: [bucket, ...current.buckets.filter((candidate) => candidate.company !== bucket.company || candidate.date !== bucket.date)] }
}
