import { ErpNextError, type createErpNextClient } from './erpnext'
import { listProductImages, readProductImage, writeProductImage } from './product-image-cache'
import { readItemCatalog, writeItemCatalog } from './item-cache'
import { readVariantCatalog, writeVariantCatalog } from './variant-cache'

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
  // A cache that cannot store it (private mode, full storage) must not hide an image that did download.
  await writeProductImage({ profileId, itemName: item.name, url: imageUrl, blob }).catch(() => undefined)
  return { url: imageUrl, blob }
}

const MAX_PARALLEL_LOADS = 4
let activeLoads = 0
const waitingLoads: Array<() => void> = []

/** `loadProductImage` with at most four downloads at a time, for thumbnails that load as they scroll into view. */
export function loadProductImageQueued(client: Client, profileId: string, item: { name: string; image?: string }) {
  return new Promise<Awaited<ReturnType<typeof loadProductImage>>>((resolve, reject) => {
    const run = () => {
      activeLoads += 1
      loadProductImage(client, profileId, item).then(resolve, reject).finally(() => { activeLoads -= 1; waitingLoads.shift()?.() })
    }
    if (activeLoads < MAX_PARALLEL_LOADS) run(); else waitingLoads.push(run)
  })
}

/** Copy a cached image to items that now share its URL, so they show it without another download. */
export async function shareCachedProductImage(profileId: string, sourceItem: string, url: string, targets: string[]) {
  const cached = await readProductImage(profileId, sourceItem)
  if (!cached || cached.url !== url) return
  await Promise.all(targets.map((itemName) => writeProductImage({ profileId, itemName, url, blob: cached.blob })))
}

/** The image field of every Item, read in pages of 500. */
async function listItemImages(client: Client) {
  const records: Array<{ name: string; image?: string }> = []
  let start = 0
  const pageLength = 500
  while (true) {
    const page = await client.listDocuments<{ name: string; image?: string }>('Item', { fields: ['name', 'image'], start, pageLength, orderBy: 'name asc' })
    records.push(...page.data)
    if (page.data.length < pageLength) break
    start += page.data.length
  }
  return records
}

/**
 * Updates only the image field of the cached Items and variants from ERPNext, without downloading
 * the rest of the catalog or any image file. Returns how many cached items changed.
 */
export async function refreshItemImages(client: Client, profileId: string) {
  const images = new Map((await listItemImages(client)).map((record) => [record.name, record.image?.trim() || '']))
  const [variants, items] = await Promise.all([readVariantCatalog(profileId), readItemCatalog(profileId)])
  const changed = new Set<string>()
  const withImages = <T extends { name: string; image?: string }>(list: T[]) => list.map((item) => {
    if (!images.has(item.name)) return item
    const image = images.get(item.name) || undefined
    if ((item.image?.trim() || undefined) === image) return item
    changed.add(item.name)
    return { ...item, image }
  })
  await Promise.all([
    variants && writeVariantCatalog({ ...variants, imageFieldLoaded: true, items: withImages(variants.items) }),
    items && writeItemCatalog({ ...items, imageFieldLoaded: true, items: withImages(items.items) }),
  ])
  return { changed: changed.size }
}

/**
 * Downloads the ERPNext-hosted image of every Item whose cached copy is missing or points to another file. `force`
 * downloads them all again, for files replaced in ERPNext without changing their URL.
 */
export async function downloadMissingProductImages(client: Client, profileId: string, onProgress: (completed: number, total: number) => void, { force = false }: { force?: boolean } = {}) {
  const records = await listItemImages(client)

  const cached = force ? new Map<string, string>() : new Map((await listProductImages(profileId)).map((record) => [record.itemName, record.url]))
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
