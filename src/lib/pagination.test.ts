import { describe, expect, it, vi } from 'vitest'
import type { ErpNextClient } from './erpnext'
import { listAllDocuments, paginate } from './pagination'

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

describe('paginate', () => {
  const rows = Array.from({ length: 60 }, (_, index) => index + 1)

  it('returns one page of rows and clamps the page number', () => {
    expect(paginate(rows, 2, 25)).toEqual({ rows: rows.slice(25, 50), page: 2, totalPages: 3 })
    expect(paginate(rows, 9, 25)).toMatchObject({ page: 3, rows: rows.slice(50) })
    expect(paginate(rows, Number.NaN, 25)).toMatchObject({ page: 1 })
    expect(paginate([], 4, 25)).toEqual({ rows: [], page: 1, totalPages: 1 })
  })
})

