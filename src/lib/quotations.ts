import type { DocTypeField, QuotationDocument, QuotationItem, QuotationPayment, QuotationSummary, QuotationTax } from './types'

export const quotationStatuses = ['Draft', 'Open'] as const

const serverFields = new Set(['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx', '__islocal', '__unsaved', '_user_tags', '_comments', '_assign', 'parent', 'parentfield', 'parenttype'])
const calculatedQuotationFields = new Set(['status', 'customer_name', 'total', 'net_total', 'grand_total', 'total_taxes_and_charges', 'total_qty', 'rounding_adjustment', 'rounded_total', 'in_words'])

export type QuotationFormState = Partial<QuotationDocument> & { items: QuotationItem[]; taxes: QuotationTax[]; payment_schedule: QuotationPayment[]; custom?: Record<string, unknown> }

export function stripQuotationServerMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripQuotationServerMetadata)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !serverFields.has(key)).map(([key, item]) => [key, stripQuotationServerMetadata(item)]))
}

function cleanChildRow(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(stripQuotationServerMetadata(row) as Record<string, unknown>).filter(([, value]) => value !== undefined && !(typeof value === 'string' && value === '')))
}

export function quotationPayload(form: QuotationFormState, isNew = false): Record<string, unknown> {
  const source = { ...form } as Record<string, unknown>
  const custom = form.custom ?? {}
  const result = Object.fromEntries(Object.entries({ ...source, ...custom }).filter(([key, value]) => key !== 'custom' && !calculatedQuotationFields.has(key) && value !== undefined))
  result.items = form.items.map((item) => cleanChildRow(item as Record<string, unknown>))
  result.taxes = form.taxes.map((tax) => cleanChildRow(tax as Record<string, unknown>))
  result.payment_schedule = form.payment_schedule.map((payment) => cleanChildRow(payment as Record<string, unknown>))
  if (isNew) delete result.name
  const payload = stripQuotationServerMetadata(result) as Record<string, unknown>
  payload.docstatus = 0
  return payload
}

export function validateQuotationForm(form: QuotationFormState) {
  if (!form.quotation_to || !form.party_name) return 'Selecciona un cliente o Lead.'
  if (!form.company) return 'Selecciona una compañía.'
  if (!form.transaction_date) return 'Selecciona la fecha de transacción.'
  if (form.valid_till && form.valid_till < form.transaction_date) return 'La fecha de vigencia debe ser igual o posterior a la fecha de transacción.'
  if (!form.items.length) return 'Agrega al menos una partida.'
  for (const [index, item] of form.items.entries()) {
    if (!item.item_code) return `La partida ${index + 1} requiere un artículo.`
    if (!Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) return `La cantidad de la partida ${index + 1} debe ser mayor que cero.`
    if (!Number.isFinite(Number(item.rate)) || Number(item.rate) < 0) return `La tarifa de la partida ${index + 1} no es válida.`
    if (Number(item.discount_percentage ?? 0) < 0 || Number(item.discount_percentage ?? 0) > 100) return `El descuento de la partida ${index + 1} debe estar entre 0 y 100%.`
  }
  const portions = form.payment_schedule.map((row) => Number(row.invoice_portion ?? 0))
  if (portions.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) return 'Los porcentajes de pago deben estar entre 0 y 100%.'
  if (portions.length && Math.abs(portions.reduce((sum, value) => sum + value, 0) - 100) > 0.01) return 'Los porcentajes de pago deben sumar 100%.'
  return null
}

export function quotationCustomFields(fields: DocTypeField[], source: Record<string, unknown>) {
  return Object.fromEntries(fields.filter((field) => field.fieldname && !field.hidden && !field.read_only && !['Section Break', 'Column Break', 'Tab Break', 'Table', 'Table MultiSelect', 'Button'].includes(field.fieldtype ?? '') && !(field.fieldname in source)).map((field) => [field.fieldname, source[field.fieldname] ?? (field.fieldtype === 'Check' ? 0 : '')]))
}

export function quotationRevision(form: QuotationFormState, originalName: string) {
  const payload = quotationPayload(form, true)
  delete payload.amended_from
  payload.amended_from = originalName
  return payload
}

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

function addDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  return localDate(date)
}

export function minimumDeliveryDate(transactionDate?: string, today = new Date()) {
  const tomorrow = localDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))
  if (!transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) return tomorrow
  const afterTransaction = addDays(transactionDate, 1)
  return afterTransaction > tomorrow ? afterTransaction : tomorrow
}

export function defaultDeliveryDate(transactionDate?: string, today = new Date()) {
  return minimumDeliveryDate(transactionDate, today)
}

export function validateQuotationForSalesOrder(quotation: Pick<QuotationDocument, 'party_name' | 'customer_name' | 'company' | 'items' | 'transaction_date'>, deliveryDate?: string) {
  if (!deliveryDate) return 'Selecciona una fecha de entrega.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return 'La fecha de entrega no es válida.'
  if (quotation.transaction_date && deliveryDate <= quotation.transaction_date) return 'La fecha de entrega debe ser posterior a la fecha de transacción.'
  if (!quotation.party_name && !quotation.customer_name) return 'La cotización no tiene cliente.'
  if (!quotation.company) return 'La cotización no tiene compañía.'
  if (!quotation.items?.length) return 'La cotización no tiene partidas.'
  return null
}

export function validateMappedSalesOrder(payload: Record<string, unknown>, deliveryDate?: string) {
  if (!payload.customer) return 'ERPNext no devolvió un cliente para el Sales Order.'
  if (!payload.company) return 'ERPNext no devolvió una compañía para el Sales Order.'
  if (!Array.isArray(payload.items) || payload.items.length === 0) return 'ERPNext no devolvió partidas para el Sales Order.'
  if (deliveryDate && typeof payload.transaction_date === 'string' && deliveryDate <= payload.transaction_date) return 'La fecha de entrega debe ser posterior a la fecha del Sales Order.'
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

export function relatedSalesOrderFilters(quotationName: string): Array<[string, string, unknown]> {
  return [['items.prevdoc_docname', '=', quotationName], ['docstatus', '<', 2]]
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
