import { ErpNextError, type ErpNextClient } from './erpnext'
import { readItemSearchDetails, readItemUomsThroughItems } from './catalog-sync'
import { listAllDocuments } from './pagination'
import { readItemPriceCatalog, writeItemPriceCatalog } from './price-cache'
import { mergeItemUoms, readVariantCatalog, writeVariantCatalog } from './variant-cache'
import type { ItemPrice, VariantItem } from './types'

export async function syncProductCardDetails(client: ErpNextClient, profileId: string, setMessage: (message: string) => void) {
  const priceCache = await readItemPriceCatalog(profileId)
  const variantCache = await readVariantCatalog(profileId)
  const prices = priceCache?.prices ?? await (async () => {
    setMessage('Descargando precios para la vista Cards...')
    const nextPrices = await listAllDocuments<ItemPrice>(client, 'Item Price', {
      fields: ['name', 'item_code', 'price_list', 'price_list_rate', 'buying', 'selling', 'uom', 'currency', 'supplier', 'valid_from', 'valid_upto'],
      orderBy: 'item_code asc, price_list asc',
    }, (count) => setMessage(`Descargando precios para la vista Cards: ${count}`))
    await writeItemPriceCatalog({ profileId, updatedAt: new Date().toISOString(), prices: nextPrices })
    return nextPrices
  })()

  if (variantCache) return { prices, variants: variantCache.items.length }

  setMessage('Descargando UOM y variantes para la vista Cards...')
  const items = await listAllDocuments<VariantItem>(client, 'Item', {
    fields: ['name', 'item_code', 'item_name', 'brand', 'item_group', 'stock_uom', 'sales_uom', 'purchase_uom', 'variant_of', 'has_variants', 'disabled'],
    orderBy: 'item_name asc',
  }, (count) => setMessage(`Descargando productos y UOM para la vista Cards: ${count}`))
  const searchDetails = await readItemSearchDetails(client, items, setMessage)
  const enrichedItems = items.map((item) => ({ ...item, ...(searchDetails[item.name] ?? { barcodes: [] }) }))
  let uomRows: Array<{ parent: string; uom: string; conversion_factor: number }>
  try {
    uomRows = await listAllDocuments<{ parent: string; uom: string; conversion_factor: number }>(client, 'UOM Conversion Detail', {
      fields: ['parent', 'uom', 'conversion_factor'],
      filters: [['parenttype', '=', 'Item'], ['parentfield', '=', 'uoms']],
      orderBy: 'parent asc, idx asc',
    }, (count) => setMessage(`Descargando conversiones UOM para la vista Cards: ${count}`))
  } catch (error) {
    if (!(error instanceof ErpNextError) || error.status !== 403) throw error
    setMessage('Sin permiso para leer UOM directamente; usando los Items...')
    uomRows = await readItemUomsThroughItems(client, enrichedItems, setMessage)
  }
  const nextVariants = mergeItemUoms(enrichedItems, uomRows)
  await writeVariantCatalog({ profileId, updatedAt: new Date().toISOString(), items: nextVariants })
  return { prices, variants: nextVariants.length }
}
