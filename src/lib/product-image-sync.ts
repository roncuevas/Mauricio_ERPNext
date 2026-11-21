import type { createErpNextClient } from './erpnext'
import { listProductImages, writeProductImage } from './product-image-cache'

type Client = ReturnType<typeof createErpNextClient>

export async function downloadMissingProductImages(client: Client, profileId: string, onProgress: (completed: number, total: number) => void) {
  const records: Array<{ name: string; image?: string }> = []
  let start = 0
  const pageLength = 500
  while (true) {
    const page = await client.listDocuments<{ name: string; image?: string }>('Item', { fields: ['name', 'image'], start, pageLength, orderBy: 'name asc' })
    records.push(...page.data)
    if (page.data.length < pageLength) break
    start += page.data.length
  }

  const cached = new Set((await listProductImages(profileId)).map((record) => record.itemName))
  const pending = records.filter((record) => record.image && !cached.has(record.name))
  let cursor = 0
  let downloaded = 0
  let failed = 0
  const worker = async () => {
    while (cursor < pending.length) {
      const record = pending[cursor++]
      try {
        const blob = await client.getImage(record.image!)
        await writeProductImage({ profileId, itemName: record.name, url: record.image!, blob })
        downloaded += 1
      } catch {
        failed += 1
      }
      onProgress(downloaded + failed, pending.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, () => worker()))
  return { total: pending.length, downloaded, failed }
}
