// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { downloadMissingProductImages } from './product-image-sync'
import { writeProductImage } from './product-image-cache'

function client() {
  return {
    listDocuments: vi.fn(async () => ({ data: [{ name: 'Martillo', image: '/files/martillo.png' }, { name: 'Pinzas', image: '/files/pinzas.png' }] })),
    isExternalImageUrl: () => false,
    getImage: vi.fn(async () => new Blob(['png'])),
  } as never as Parameters<typeof downloadMissingProductImages>[0] & { getImage: ReturnType<typeof vi.fn> }
}

describe('downloadMissingProductImages', () => {
  it('skips images already cached at the same URL unless forced', async () => {
    await writeProductImage({ profileId: 'centro', itemName: 'Martillo', url: '/files/martillo.png', blob: new Blob(['old']) })
    const missing = client()
    expect(await downloadMissingProductImages(missing, 'centro', () => {})).toMatchObject({ total: 1, downloaded: 1 })
    expect(missing.getImage).toHaveBeenCalledWith('/files/pinzas.png')

    const forced = client()
    expect(await downloadMissingProductImages(forced, 'centro', () => {}, { force: true })).toMatchObject({ total: 2, downloaded: 2 })
    expect(forced.getImage).toHaveBeenCalledWith('/files/martillo.png')
  })
})
