import type { StockCache } from './types'
import { readCache, writeCache } from './indexed-db'

const config = { databaseName: 'mauricio-erpnext-stock', storeName: 'stock-caches' }

export const readStockCache = (profileId: string) => readCache<StockCache>(config, profileId)

export const writeStockCache = (cache: StockCache) => writeCache(config, cache)
