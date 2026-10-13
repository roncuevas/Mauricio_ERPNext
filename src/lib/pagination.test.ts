import { describe, expect, it, vi } from 'vitest'
import type { ErpNextClient } from './erpnext'
import { listAllDocuments } from './pagination'

describe('REST pagination', () => {
  it('loads all batches and reports progress before each request', async () => {
    const listDocuments = vi.fn()
      .mockResolvedValueOnce({ data: [{ name: 'A' }, { name: 'B' }] })
      .mockResolvedValueOnce({ data: [{ name: 'C' }] })
    const progress: number[] = []
    const client = { listDocuments } as unknown as ErpNextClient

    await expect(listAllDocuments(client, 'Item', { fields: ['name'], batchSize: 2 }, (count) => progress.push(count))).resolves.toEqual([
      { name: 'A' },
      { name: 'B' },
      { name: 'C' },
    ])
    expect(progress).toEqual([0, 2])
    expect(listDocuments).toHaveBeenNthCalledWith(2, 'Item', { fields: ['name'], pageLength: 2, start: 2 })
  })
})
