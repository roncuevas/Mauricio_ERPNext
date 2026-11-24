// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearProfileData, listProfilesWithData, measureProfileData } from './profile-data'
import { readItemCatalog, writeItemCatalog } from './item-cache'
import { readItemPriceCatalog, writeItemPriceCatalog } from './price-cache'
import { listProductImages, writeProductImage } from './product-image-cache'
import { emptyLocalCarts, readLocalPosCarts, writeLocalPosCarts } from './pos-local-carts'
import type { ItemCatalogCache } from './types'

const catalog = (profileId: string) => ({ profileId, updatedAt: '2026-11-24', items: [{ name: 'Martillo', item_name: 'Martillo con nombre largo' }] }) as ItemCatalogCache

async function seed(profileId: string) {
  await writeItemCatalog(catalog(profileId))
  await writeItemPriceCatalog({ profileId, updatedAt: '2026-11-24', prices: [] })
  await writeProductImage({ profileId, itemName: 'Martillo', url: '/files/m.png', blob: new Blob([new Uint8Array(2048)]) })
  await writeLocalPosCarts({ ...emptyLocalCarts(profileId, 'Caja'), current: { lines: [{ itemCode: 'Martillo', itemName: 'Martillo', qty: 1, rate: 10 }] as never, customer: '' } })
  localStorage.setItem(`mauricio-erpnext:cache-sync:${profileId}`, '{"products":{}}')
  localStorage.setItem(`mauricio-erpnext:pos-preferences:${profileId}`, '{"profileName":"Caja"}')
}

describe('profile data', () => {
  beforeEach(() => localStorage.clear())

  it('measures each cache, the images, the carts and the preferences of one profile only', async () => {
    await seed('centro')
    await seed('norte')
    const usage = await measureProfileData('centro')
    expect(usage.caches.map((entry) => entry.id).sort()).toEqual(['prices', 'products'])
    // jsdom loses the Blob when fake-indexeddb clones it, so only the record is measured here; browsers keep it.
    expect(usage.images.count).toBe(1)
    expect(usage.images.bytes).toBeGreaterThan(0)
    expect(usage.carts).toBeGreaterThan(0)
    expect(usage.preferences).toBeGreaterThan(0)
    expect(usage.total).toBe(usage.cacheBytes + usage.carts + usage.preferences)
    expect(await listProfilesWithData()).toEqual(expect.arrayContaining(['centro', 'norte']))
  })

  it('clears the downloaded cache but keeps carts and preferences, and leaves other profiles alone', async () => {
    await seed('centro')
    await seed('norte')
    await clearProfileData('centro')
    expect(await readItemCatalog('centro')).toBeNull()
    expect(await readItemPriceCatalog('centro')).toBeNull()
    expect(await listProductImages('centro')).toEqual([])
    expect(localStorage.getItem('mauricio-erpnext:cache-sync:centro')).toBeNull()
    expect((await readLocalPosCarts('centro', 'Caja')).current.lines).toHaveLength(1)
    expect(localStorage.getItem('mauricio-erpnext:pos-preferences:centro')).not.toBeNull()
    expect(await readItemCatalog('norte')).not.toBeNull()
    expect(await listProductImages('norte')).toHaveLength(1)
    expect((await measureProfileData('centro')).cacheBytes).toBe(0)
  })

  it('removes everything of a deleted profile', async () => {
    await seed('centro')
    await clearProfileData('centro', { everything: true })
    expect((await readLocalPosCarts('centro', 'Caja')).current.lines).toHaveLength(0)
    expect(localStorage.getItem('mauricio-erpnext:pos-preferences:centro')).toBeNull()
    expect((await measureProfileData('centro')).total).toBe(0)
    expect(await listProfilesWithData()).not.toContain('centro')
  })
})
