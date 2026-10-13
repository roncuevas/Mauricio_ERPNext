import type { ErpNextClient } from './erpnext'
import type { ListOptions } from './types'

export async function listAllDocuments<T>(client: ErpNextClient, doctype: string, options: Omit<ListOptions, 'start'> & { batchSize?: number }, onProgress?: (count: number) => void) {
  const data: T[] = []
  const { batchSize: requestedBatchSize, ...listOptions } = options
  const batchSize = requestedBatchSize ?? 500
  let start = 0
  while (true) {
    onProgress?.(data.length)
    const batch = await client.listDocuments<T>(doctype, { ...listOptions, pageLength: batchSize, start })
    data.push(...batch.data)
    if (batch.data.length < batchSize) return data
    start += batch.data.length
  }
}
