import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshItemImages } from './product-image-sync'
import type { ItemCatalogCache, VariantCatalogCache } from './types'

const store = vi.hoisted(() => ({ variants: null as VariantCatalogCache | null, items: null as ItemCatalogCache | null }))
vi.mock('./variant-cache', () => ({ readVariantCatalog: async () => store.variants, writeVariantCatalog: async (cache: VariantCatalogCache) => { store.variants = cache } }))
vi.mock('./item-cache', () => ({ readItemCatalog: async () => store.items, writeItemCatalog: async (cache: ItemCatalogCache) => { store.items = cache } }))
vi.mock('./product-image-cache', () => ({ listProductImages: async () => [], readProductImage: async () => null, writeProductImage: async () => undefined }))

describe('refreshItemImages', () => {
  beforeEach(() => {
    store.variants = { profileId: 'p', updatedAt: '2026-11-01T00:00:00Z', imageFieldLoaded: false, items: [{ name: 'A' }, { name: 'B', image: '/files/old.png' }, { name: 'C', image: '/files/c.png' }, { name: 'LOCAL-ONLY' }] }
    store.items = { profileId: 'p', updatedAt: '2026-11-01T00:00:00Z', items: [{ name: 'A' }, { name: 'B', image: '/files/old.png' }] } as ItemCatalogCache
  })

  it('updates only the image field of cached items and reports how many changed', async () => {
    const listDocuments = vi.fn()
      .mockResolvedValueOnce({ data: [{ name: 'A', image: '/files/a.png' }, { name: 'B', image: '' }, { name: 'C', image: '/files/c.png' }] })
    const result = await refreshItemImages({ listDocuments } as never, 'p')
    expect(result).toEqual({ changed: 2 })
    expect(listDocuments).toHaveBeenCalledWith('Item', expect.objectContaining({ fields: ['name', 'image'] }))
    expect(store.variants?.imageFieldLoaded).toBe(true)
    expect(store.variants?.updatedAt).toBe('2026-11-01T00:00:00Z')
    expect(store.variants?.items).toEqual([{ name: 'A', image: '/files/a.png' }, { name: 'B', image: undefined }, { name: 'C', image: '/files/c.png' }, { name: 'LOCAL-ONLY' }])
    expect(store.items?.items).toEqual([{ name: 'A', image: '/files/a.png' }, { name: 'B', image: undefined }])
  })
})
