import { ErpNextError, type ErpNextClient } from './erpnext'
import type { VariantItem } from './types'

export type ItemSearchDetails = { barcodes: string[]; sku?: unknown; barcode?: unknown }
export type ItemUomRow = { parent: string; uom: string; conversion_factor: number }

export async function readItemUomsThroughItems(client: ErpNextClient, items: VariantItem[], setMessage: (message: string) => void) {
  const rows: ItemUomRow[] = []
  const concurrency = 8
  for (let start = 0; start < items.length; start += concurrency) {
    const batch = items.slice(start, start + concurrency)
    setMessage(`Leyendo UOM desde Items: ${Math.min(start + batch.length, items.length)} de ${items.length}`)
    const documents = await Promise.all(batch.map((item) => client.getDocument<VariantItem>('Item', item.name)))
    for (const document of documents) for (const uom of document.uoms ?? []) rows.push({ parent: document.name, uom: uom.uom, conversion_factor: uom.conversion_factor })
  }
  return rows
}

export async function readItemSearchDetails(client: ErpNextClient, items: Array<{ name: string }>, setMessage: (message: string) => void) {
  const details: Record<string, ItemSearchDetails> = {}
  try {
    const rows = await listAllItemBarcodes(client)
    for (const row of rows) (details[row.parent] ??= { barcodes: [] }).barcodes.push(row.barcode)
    return details
  } catch (error) {
    if (!(error instanceof ErpNextError) || ![403, 404].includes(error.status)) throw error
  }
  const concurrency = 8
  for (let start = 0; start < items.length; start += concurrency) {
    const batch = items.slice(start, start + concurrency)
    setMessage(`Leyendo códigos desde Items: ${Math.min(start + batch.length, items.length)} de ${items.length}`)
    const documents = await Promise.all(batch.map((item) => client.getDocument<Record<string, unknown>>('Item', item.name)))
    for (const document of documents) {
      const barcodes = Array.isArray(document.barcodes) ? document.barcodes.map((row) => typeof row === 'object' && row ? String((row as Record<string, unknown>).barcode ?? '') : '').filter(Boolean) : []
      details[String(document.name)] = { barcodes, sku: document.sku, barcode: document.barcode }
    }
  }
  return details
}

async function listAllItemBarcodes(client: ErpNextClient) {
  const rows: Array<{ parent: string; barcode: string }> = []
  let start = 0
  while (true) {
    const batch = await client.listDocuments<{ parent: string; barcode: string }>('Item Barcode', { fields: ['parent', 'barcode'], filters: [['parenttype', '=', 'Item'], ['parentfield', '=', 'barcodes']], start, pageLength: 500, orderBy: 'parent asc, idx asc' })
    rows.push(...batch.data)
    if (batch.data.length < 500) return rows
    start += batch.data.length
  }
}
