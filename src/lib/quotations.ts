import type { QuotationDocument, QuotationSummary } from './types'

export const quotationStatuses = ['Draft', 'Open'] as const

export function isActiveQuotation(quotation: QuotationSummary) {
  return quotationStatuses.includes(quotation.status as typeof quotationStatuses[number])
}

export function filterQuotations(quotations: QuotationSummary[], search: string, status: string) {
  const normalizedSearch = search.trim().toLocaleLowerCase()
  return quotations.filter((quotation) => {
    if (!isActiveQuotation(quotation) || (status !== 'Todas' && quotation.status !== status)) return false
    if (!normalizedSearch) return true
    return [quotation.name, quotation.party_name, quotation.customer_name, quotation.company].some((value) => String(value ?? '').toLocaleLowerCase().includes(normalizedSearch))
  })
}

export function quotationValidityState(validTill?: string, today = new Date()) {
  if (!validTill) return 'sin-vigencia' as const
  const validDate = new Date(`${validTill}T23:59:59`)
  return validDate < today ? 'vencida' as const : 'vigente' as const
}

function localDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function defaultDeliveryDate(transactionDate?: string, today = new Date()) {
  const todayValue = localDate(today)
  return transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(transactionDate) && transactionDate > todayValue ? transactionDate : todayValue
}

export function validateQuotationForSalesOrder(quotation: Pick<QuotationDocument, 'party_name' | 'customer_name' | 'company' | 'items' | 'transaction_date'>, deliveryDate?: string) {
  if (!deliveryDate) return 'Selecciona una fecha de entrega.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return 'La fecha de entrega no es válida.'
  if (quotation.transaction_date && deliveryDate < quotation.transaction_date) return 'La fecha de entrega no puede ser anterior a la fecha de transacción.'
  if (!quotation.party_name && !quotation.customer_name) return 'La cotización no tiene cliente.'
  if (!quotation.company) return 'La cotización no tiene compañía.'
  if (!quotation.items?.length) return 'La cotización no tiene partidas.'
  return null
}

export function validateMappedSalesOrder(payload: Record<string, unknown>) {
  if (!payload.customer) return 'ERPNext no devolvió un cliente para el Sales Order.'
  if (!payload.company) return 'ERPNext no devolvió una compañía para el Sales Order.'
  if (!Array.isArray(payload.items) || payload.items.length === 0) return 'ERPNext no devolvió partidas para el Sales Order.'
  return null
}

export function extractMappedSalesOrder(result: unknown): Record<string, unknown> | null {
  const candidates = getMappedCandidates(result)
  const mapped = candidates.find((candidate) => candidate && typeof candidate === 'object' && ((candidate as Record<string, unknown>).doctype === 'Sales Order' || (candidate as Record<string, unknown>).doctype === 'Sales Order Item'))
  if (!mapped || typeof mapped !== 'object') return null
  const document = (mapped as Record<string, unknown>).doctype === 'Sales Order Item' ? candidates.find((candidate) => candidate && typeof candidate === 'object' && (candidate as Record<string, unknown>).doctype === 'Sales Order') : mapped
  if (!document || typeof document !== 'object') return null
  return stripMappedMetadata(document as Record<string, unknown>)
}

export function normalizeMappedSalesOrder(mapped: Record<string, unknown>, deliveryDate: string) {
  const payload = stripMappedMetadata(mapped)
  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => item && typeof item === 'object' ? { ...(item as Record<string, unknown>), delivery_date: deliveryDate } : item)
    : payload.items
  return { ...payload, delivery_date: deliveryDate, items }
}

export type RelatedSalesOrderRow = { name?: string; parent?: string; docstatus?: number }

export class RelatedSalesOrderError extends Error {
  constructor(public names: string[]) {
    super(`La cotización ya tiene Sales Order relacionado: ${names.join(', ')}.`)
  }
}

export function relatedSalesOrderNames(rows: RelatedSalesOrderRow[]) {
  return [...new Set(rows.filter((row) => row.docstatus === undefined || row.docstatus < 2).map((row) => row.parent || row.name).filter((name): name is string => Boolean(name)))]
}

function getMappedCandidates(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  if (!result || typeof result !== 'object') return []

  const value = result as Record<string, unknown>
  if (Array.isArray(value.docs)) return value.docs
  if (value.doc && typeof value.doc === 'object') return [value.doc]
  if (value.data && typeof value.data === 'object') return getMappedCandidates(value.data)

  return [value]
}

function stripMappedMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const metadata = new Set(['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx', '__islocal', '__unsaved', '_user_tags', '_comments', '_assign', 'parent', 'parentfield', 'parenttype'])
  return Object.fromEntries(Object.entries(value).filter(([key]) => !metadata.has(key)).map(([key, item]) => [key, Array.isArray(item) ? item.map((child) => child && typeof child === 'object' ? stripMappedMetadata(child as Record<string, unknown>) : child) : item]))
}
