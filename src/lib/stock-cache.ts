import type { StockCache } from './types'
import { createCacheStore } from './indexed-db'

const config = { databaseName: 'mauricio-erpnext-stock', storeName: 'stock-caches' }
const store = createCacheStore<StockCache>(config)

export const readStockCache = store.read

export const writeStockCache = store.write
