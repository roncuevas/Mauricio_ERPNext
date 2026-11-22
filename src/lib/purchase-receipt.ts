import type { ItemPrice, VariantItem } from './types'

export type PurchaseReceiptLine = {
  itemCode: string
  itemName: string
  qty: number
  rejectedQty?: number
  uom: string
  stockUom: string
  conversionFactor: number
  rate: number
}

export type PurchaseReceiptInput = {
  company: string
  currency: string
  supplier: string
  warehouse: string
  rejectedWarehouse?: string
  /** Only sent with `set_posting_time`; otherwise ERPNext posts at the server's current date and time. */
  posting?: { date: string; time: string }
  supplierDeliveryNote?: string
  remarks?: string
  lines: PurchaseReceiptLine[]
}

export type UomOption = { uom: string; conversionFactor: number }

export function purchaseReceiptPayload(input: PurchaseReceiptInput) {
  if (!input.supplier.trim()) throw new Error('Selecciona un proveedor.')
  if (!input.company.trim() || !input.warehouse.trim()) throw new Error('Selecciona el almacén que recibe.')
  if (!input.currency.trim()) throw new Error('La empresa no tiene moneda predeterminada; refresca el inventario.')
  if (!input.lines.length) throw new Error('Agrega al menos un producto.')
  for (const line of input.lines) {
    const rejected = line.rejectedQty ?? 0
    if (!Number.isFinite(line.qty) || line.qty < 0 || !Number.isFinite(rejected) || rejected < 0 || line.qty + rejected <= 0) throw new Error(`Cantidad inválida para ${line.itemName}.`)
    if (!Number.isFinite(line.rate) || line.rate < 0) throw new Error(`Captura un costo válido para ${line.itemName}.`)
    if (!line.uom || !(line.conversionFactor > 0)) throw new Error(`UOM inválida para ${line.itemName}.`)
  }
  const hasRejected = input.lines.some((line) => (line.rejectedQty ?? 0) > 0)
  if (hasRejected && !input.rejectedWarehouse) throw new Error('Selecciona el almacén de rechazados.')
  if (hasRejected && input.rejectedWarehouse === input.warehouse) throw new Error('El almacén de rechazados debe ser distinto al que recibe.')
  if (input.posting && (!input.posting.date || !input.posting.time)) throw new Error('Fecha y hora son obligatorias.')
  return {
    doctype: 'Purchase Receipt',
    supplier: input.supplier,
    company: input.company,
    currency: input.currency,
    conversion_rate: 1,
    set_warehouse: input.warehouse,
    ...(hasRejected ? { rejected_warehouse: input.rejectedWarehouse } : {}),
    ...(input.posting ? { set_posting_time: 1, posting_date: input.posting.date, posting_time: input.posting.time } : {}),
    supplier_delivery_note: input.supplierDeliveryNote?.trim() || undefined,
    remarks: input.remarks?.trim() || undefined,
    items: input.lines.map((line) => {
      const rejected = line.rejectedQty ?? 0
      return {
        item_code: line.itemCode,
        item_name: line.itemName,
        qty: line.qty,
        received_qty: line.qty + rejected,
        ...(rejected > 0 ? { rejected_qty: rejected, rejected_warehouse: input.rejectedWarehouse } : {}),
        uom: line.uom,
        stock_uom: line.stockUom,
        conversion_factor: line.conversionFactor,
        rate: line.rate,
        warehouse: input.warehouse,
      }
    }),
  }
}

/** Stock UOM first, then the item's UOM conversions; the purchase UOM is the default when the item defines one. */
export function purchaseUomOptions(item: VariantItem | undefined): { options: UomOption[]; defaultUom: string } {
  const stockUom = item?.stock_uom || ''
  const options: UomOption[] = stockUom ? [{ uom: stockUom, conversionFactor: 1 }] : []
  for (const conversion of item?.uoms ?? []) if (conversion.uom && conversion.uom !== stockUom && conversion.conversion_factor > 0) options.push({ uom: conversion.uom, conversionFactor: conversion.conversion_factor })
  const purchaseUom = options.find((option) => option.uom === item?.purchase_uom)
  return { options, defaultUom: (purchaseUom ?? options[0])?.uom ?? '' }
}

export type RateSuggestion = { rate: number; priceList?: string; supplier?: string }

function isCurrent(price: ItemPrice, today: string) {
  return (!price.valid_from || price.valid_from <= today) && (!price.valid_upto || price.valid_upto >= today)
}

const newestFirst = (left: ItemPrice, right: ItemPrice) => (right.valid_from ?? '').localeCompare(left.valid_from ?? '') || (right.modified ?? '').localeCompare(left.modified ?? '')

/**
 * Suggested purchase cost from cached buying Item Prices: the selected supplier's price first, then a general
 * buying price, then the newest price from any supplier. Converts a stock-UOM price when the UOM has no own price.
 */
export function suggestPurchaseRate(prices: ItemPrice[], itemCode: string, uom: UomOption, stockUom: string, supplier: string, today: string): RateSuggestion | null {
  const buying = prices.filter((price) => price.item_code === itemCode && Boolean(price.buying) && isCurrent(price, today) && Number(price.price_list_rate) > 0)
  const pick = (candidates: ItemPrice[]) => supplier && candidates.find((price) => price.supplier === supplier) || candidates.find((price) => !price.supplier) || candidates[0]
  const forUom = (target: string) => buying.filter((price) => (price.uom || stockUom) === target).sort(newestFirst)
  const exact = pick(forUom(uom.uom))
  if (exact) return { rate: Number(exact.price_list_rate), priceList: exact.price_list, supplier: exact.supplier }
  const base = uom.uom !== stockUom ? pick(forUom(stockUom)) : undefined
  return base ? { rate: Number(base.price_list_rate) * uom.conversionFactor, priceList: base.price_list, supplier: base.supplier } : null
}
