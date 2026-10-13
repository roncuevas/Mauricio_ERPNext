import { describe, expect, it, vi } from 'vitest'
import { syncUomCatalog } from './catalog-sync'
import type { ErpNextClient } from './erpnext'

describe('UOM catalog synchronization', () => {
  it('paginates and deduplicates available UOM names', async () => {
    const listDocuments = vi.fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, index) => ({ name: `UOM-${index}` })) })
      .mockResolvedValueOnce({ data: [{ name: 'UOM-500' }, { name: 'UOM-501' }] })

    const result = await syncUomCatalog({ listDocuments } as unknown as ErpNextClient, 'profile-1', null)

    expect(listDocuments).toHaveBeenCalledTimes(2)
    expect(listDocuments).toHaveBeenLastCalledWith('UOM', expect.objectContaining({ start: 500, pageLength: 500 }))
    expect(result.profileId).toBe('profile-1')
    expect(result.uoms).toHaveLength(502)
    expect(result.uoms).toContain('UOM-501')
  })
})
