import { describe, expect, it } from 'vitest'
import { readProductImage, writeProductImage } from './product-image-cache'

describe('product image cache', () => {
  it('rejects incomplete image records without opening IndexedDB', async () => {
    await expect(writeProductImage({ profileId: '', itemName: 'ITEM-1', url: '/files/item.png', blob: new Blob(['x']) })).rejects.toThrow()
    await expect(readProductImage('', 'ITEM-1')).resolves.toBeNull()
  })
})
