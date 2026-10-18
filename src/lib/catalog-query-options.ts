import { readItemCatalog } from './item-cache'
import { readItemPriceCatalog } from './price-cache'
import { queryKeys } from './query-keys'
import { readVariantCatalogOrItems } from './variant-cache'

export const catalogQueryOptions = {
  item: (profileId: string) => ({
    queryKey: queryKeys.catalog.item(profileId),
    queryFn: () => readItemCatalog(profileId),
    staleTime: Infinity,
  }),
  price: (profileId: string) => ({
    queryKey: queryKeys.catalog.price(profileId),
    queryFn: () => readItemPriceCatalog(profileId),
    staleTime: Infinity,
  }),
  variant: (profileId: string) => ({
    queryKey: queryKeys.catalog.variant(profileId),
    queryFn: () => readVariantCatalogOrItems(profileId),
    staleTime: Infinity,
  }),
}
