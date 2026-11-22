import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { readStockCache } from '../lib/stock-cache'
import { queryKeys } from '../lib/query-keys'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { activeWarehouses, itemCanReconcile } from '../lib/stock'

/** Stock cache plus stockable items enriched with the product catalog (barcodes, brand, UOM conversions). */
export function useStockItems(profileId: string) {
  const stockQuery = useQuery({ queryKey: queryKeys.catalog.stock(profileId), queryFn: () => readStockCache(profileId), staleTime: Infinity })
  const variantsQuery = useQuery(catalogQueryOptions.variant(profileId))
  const cache = stockQuery.data
  const items = useMemo(() => {
    const catalog = new Map((variantsQuery.data?.items ?? []).map((item) => [item.name, item]))
    const base = cache?.items?.length ? cache.items : variantsQuery.data?.items ?? []
    return base.map((item) => ({ ...catalog.get(item.name), ...item })).filter(itemCanReconcile)
  }, [cache?.items, variantsQuery.data?.items])
  const itemsByName = useMemo(() => new Map(items.map((item) => [item.name, item])), [items])
  const warehouses = useMemo(() => activeWarehouses(cache?.warehouses ?? []), [cache?.warehouses])
  return { cache, items, itemsByName, warehouses, isLoading: stockQuery.isLoading || variantsQuery.isLoading }
}
