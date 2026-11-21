import { ErpNextError, type createErpNextClient } from './erpnext'
import { listProductImages, writeProductImage } from './product-image-cache'

type Client = ReturnType<typeof createErpNextClient>

function imageLocation(value: string) {
  try {
    const url = new URL(value)
    return `${url.host}${url.pathname}`
  } catch {
    return value.split(/[?#]/, 1)[0]
  }
}

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

  const cached = new Map((await listProductImages(profileId)).map((record) => [record.itemName, record.url]))
  const pending = records.filter((record) => record.image && cached.get(record.name) !== record.image)
  let cursor = 0
  let downloaded = 0
  let failed = 0
  let firstFailure = ''
  const worker = async () => {
    while (cursor < pending.length) {
      const record = pending[cursor++]
      try {
        const blob = await client.getImage(record.image!)
        await writeProductImage({ profileId, itemName: record.name, url: record.image!, blob })
        downloaded += 1
      } catch (error) {
        failed += 1
        if (!firstFailure) {
          const detail = error instanceof ErpNextError ? `HTTP ${error.status}: ${error.message}` : error instanceof Error ? error.message : 'Error desconocido'
          firstFailure = `${record.name} (${imageLocation(record.image!)}): ${detail}`
        }
      }
      onProgress(downloaded + failed, pending.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, () => worker()))
  return { total: pending.length, downloaded, failed, firstFailure }
}
