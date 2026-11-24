// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { listProductImages, readProductImage, writeProductImage } from './product-image-cache'

describe('product image cache', () => {
  it('rejects incomplete image records without opening IndexedDB', async () => {
    await expect(writeProductImage({ profileId: '', itemName: 'ITEM-1', url: '/files/item.png', blob: new Blob(['x']) })).rejects.toThrow()
    await expect(readProductImage('', 'ITEM-1')).resolves.toBeNull()
  })

  it('keeps the image bytes and type, so Safari can store them', async () => {
    await writeProductImage({ profileId: 'centro', itemName: 'Martillo', url: '/files/martillo.png', blob: new Blob(['png-bytes'], { type: 'image/png' }) })
    const cached = await readProductImage('centro', 'Martillo')
    expect(cached?.url).toBe('/files/martillo.png')
    expect(cached?.blob.type).toBe('image/png')
    expect(await cached?.blob.text()).toBe('png-bytes')
    expect((await listProductImages('centro')).map((record) => record.blob.size)).toEqual([9])
  })
})
