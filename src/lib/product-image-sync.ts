import { ErpNextError, type createErpNextClient } from './erpnext'
import { listProductImages, readProductImage, writeProductImage } from './product-image-cache'

type Client = ReturnType<typeof createErpNextClient>

function imageLocation(value: string) {
  try {
    const url = new URL(value)
    return `${url.host}${url.pathname}`
  } catch {
    return value.split(/[?#]/, 1)[0]
  }
}

/** Image source for an item: its external URL, or a blob from ERPNext stored in the image cache. Downloads only when asked. */
export async function loadProductImage(client: Client, profileId: string, item: { name: string; image?: string }) {
  const imageUrl = item.image || (await client.getDocument<{ image?: string }>('Item', item.name)).image
  if (!imageUrl) return null
  if (client.isExternalImageUrl(imageUrl)) return { url: imageUrl, blob: null }
  const cached = await readProductImage(profileId, item.name)
  if (cached?.url === imageUrl) return { url: imageUrl, blob: cached.blob }
  const blob = await client.getImage(imageUrl)
  await writeProductImage({ profileId, itemName: item.name, url: imageUrl, blob })
  return { url: imageUrl, blob }
}

/** Copy a cached image to items that now share its URL, so they show it without another download. */
export async function shareCachedProductImage(profileId: string, sourceItem: string, url: string, targets: string[]) {
  const cached = await readProductImage(profileId, sourceItem)
  if (!cached || cached.url !== url) return
  await Promise.all(targets.map((itemName) => writeProductImage({ profileId, itemName, url, blob: cached.blob })))
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
  const pending = records.filter((record) => record.image && !client.isExternalImageUrl(record.image) && cached.get(record.name) !== record.image)
  let cursor = 0
  let downloaded = 0
  let failed = 0
  const failureDetails: string[] = []
  const worker = async () => {
    while (cursor < pending.length) {
      const record = pending[cursor++]
      try {
        const blob = await client.getImage(record.image!)
        await writeProductImage({ profileId, itemName: record.name, url: record.image!, blob })
        downloaded += 1
      } catch (error) {
        failed += 1
        if (failureDetails.length < 5) {
          const detail = error instanceof ErpNextError ? `HTTP ${error.status}: ${error.message}` : error instanceof Error ? error.message : 'Error desconocido'
          failureDetails.push(`${record.name} (${imageLocation(record.image!)}): ${detail}`)
        }
      }
      onProgress(downloaded + failed, pending.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, () => worker()))
  return { total: pending.length, downloaded, failed, failureDetails }
}
