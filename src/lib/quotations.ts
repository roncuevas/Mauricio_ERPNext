import type { QuotationSummary } from './types'

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

export function extractMappedSalesOrder(result: unknown): Record<string, unknown> | null {
  const value = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  const candidates = Array.isArray(result) ? result : Array.isArray(value.docs) ? value.docs : [value.doc]
  const mapped = candidates.find((candidate) => candidate && typeof candidate === 'object' && ((candidate as Record<string, unknown>).doctype === 'Sales Order' || (candidate as Record<string, unknown>).doctype === 'Sales Order Item'))
  if (!mapped || typeof mapped !== 'object') return null
  const document = (mapped as Record<string, unknown>).doctype === 'Sales Order Item' ? candidates.find((candidate) => candidate && typeof candidate === 'object' && (candidate as Record<string, unknown>).doctype === 'Sales Order') : mapped
  if (!document || typeof document !== 'object') return null
  return stripMappedMetadata(document as Record<string, unknown>)
}

function stripMappedMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const metadata = new Set(['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx', '__islocal', '__unsaved', '_user_tags', '_comments', '_assign', 'parent', 'parentfield', 'parenttype'])
  return Object.fromEntries(Object.entries(value).filter(([key]) => !metadata.has(key)).map(([key, item]) => [key, Array.isArray(item) ? item.map((child) => child && typeof child === 'object' ? stripMappedMetadata(child as Record<string, unknown>) : child) : item]))
}
