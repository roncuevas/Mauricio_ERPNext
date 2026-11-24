import type { StockCache } from './types'
import { createCacheStore } from './indexed-db'

/** Where this cache lives, for measuring and clearing a profile's data. */
export const stockCacheLocation = { databaseName: 'mauricio-erpnext-stock', storeName: 'stock-caches' }
const config = stockCacheLocation
const store = createCacheStore<StockCache>(config)

export const readStockCache = store.read

export const writeStockCache = store.write
