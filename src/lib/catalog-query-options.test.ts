import { describe, expect, it } from 'vitest'
import { catalogQueryOptions } from './catalog-query-options'

describe('catalog query options', () => {
  it('reuses profile-scoped keys and local-cache freshness for every catalog', () => {
    const profileId = 'profile-a'
    expect(catalogQueryOptions.item(profileId).queryKey).toEqual(['item-catalog', profileId])
    expect(catalogQueryOptions.variant(profileId).queryKey).toEqual(['variant-catalog', profileId])
    expect(catalogQueryOptions.price(profileId).queryKey).toEqual(['item-price-catalog', profileId])
    expect(catalogQueryOptions.item(profileId).staleTime).toBe(Infinity)
    expect(catalogQueryOptions.variant(profileId).staleTime).toBe(Infinity)
    expect(catalogQueryOptions.price(profileId).staleTime).toBe(Infinity)
  })
})
