import type { SalesOrderFormState, SalesOrderItem, SalesOrderSummary } from './types'

export const salesOrderStatuses = ['Todas', 'Borrador', 'Pendiente', 'En proceso', 'En espera', 'Cerrado', 'Cancelado'] as const

export function localDate(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function isCurrentOrPastDate(value: string, today = localDate()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= today
}

export function isValidDeliveryDate(value: string, transactionDate: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && /^\d{4}-\d{2}-\d{2}$/.test(transactionDate) && value >= transactionDate
}

export function salesOrderStatusLabel(document: Pick<SalesOrderSummary, 'docstatus' | 'status'>) {
  if (Number(document.docstatus) === 2 || document.status === 'Cancelled') return 'Cancelado'
  if (Number(document.docstatus) === 0 || document.status === 'Draft') return 'Borrador'
  switch (document.status) {
    case 'To Deliver and Bill': return 'Pendiente'
    case 'To Deliver':
    case 'To Bill': return 'En proceso'
    case 'On Hold': return 'En espera'
    case 'Completed':
    case 'Closed': return 'Cerrado'
    case 'Pendiente': return 'Pendiente'
    case 'En proceso': return 'En proceso'
    case 'En espera': return 'En espera'
    case 'Cerrado': return 'Cerrado'
    case 'Cancelado': return 'Cancelado'
    default: return Number(document.docstatus) === 1 ? 'Pendiente' : 'Borrador'
  }
}

export function lineAmount(item: Pick<SalesOrderItem, 'qty' | 'rate' | 'discount_percentage'>) {
  const discount = Math.min(100, Math.max(0, Number(item.discount_percentage ?? 0)))
  return Number(item.qty || 0) * Number(item.rate || 0) * (1 - discount / 100)
}

export function salesOrderTotals(items: SalesOrderItem[]) {
  const subtotal = items.reduce((total, item) => total + Number(item.qty || 0) * Number(item.rate || 0), 0)
  const discount = items.reduce((total, item) => total + Number(item.qty || 0) * Number(item.rate || 0) * Number(item.discount_percentage ?? 0) / 100, 0)
  return { subtotal, discount, total: subtotal - discount }
}

export function validateSalesOrderForm(form: SalesOrderFormState, today = localDate()) {
  if (!form.customer) return 'Selecciona un cliente.'
  if (!form.company) return 'Selecciona una compañía.'
  if (!form.set_warehouse) return 'Selecciona un almacén.'
  if (!form.selling_price_list) return 'Selecciona una lista de precios.'
  if (!isCurrentOrPastDate(form.transaction_date, today)) return 'La fecha no puede ser futura ni inválida.'
  if (!isValidDeliveryDate(form.delivery_date, form.transaction_date)) return 'La fecha de entrega debe ser válida y no anterior a la venta.'
  if (!form.items.length) return 'Agrega al menos una línea.'
  for (const [index, item] of form.items.entries()) {
    if (!item.item_code) return `La línea ${index + 1} requiere un producto.`
    if (!item.uom || !Number.isFinite(Number(item.conversion_factor ?? 1)) || Number(item.conversion_factor ?? 1) <= 0) return `La UOM de la línea ${index + 1} no es válida.`
    if (!Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) return `La cantidad de la línea ${index + 1} debe ser mayor que cero.`
    if (!Number.isFinite(Number(item.rate)) || Number(item.rate) < 0) return `El precio de la línea ${index + 1} no es válido.`
    if (!Number.isFinite(Number(item.discount_percentage ?? 0)) || Number(item.discount_percentage ?? 0) < 0 || Number(item.discount_percentage ?? 0) > 100) return `El descuento de la línea ${index + 1} debe estar entre 0 y 100%.`
  }
  return null
}

export function salesOrderPayload(form: SalesOrderFormState, isNew = false) {
  const payload: Record<string, unknown> = {
    doctype: 'Sales Order', customer: form.customer, transaction_date: form.transaction_date, delivery_date: form.delivery_date,
    company: form.company, currency: form.currency, selling_price_list: form.selling_price_list, set_warehouse: form.set_warehouse,
    docstatus: 0,
    order_type: 'Sales',
    items: form.items.map(({ name, amount, ...item }) => ({ ...item, delivery_date: form.delivery_date, price_list_rate: Number(item.price_list_rate ?? item.rate), ...(isNew ? {} : name ? { name } : {}) })),
  }
  if (!isNew && form.name) payload.name = form.name
  return payload
}

export function normalizeSalesOrder(document: Partial<SalesOrderSummary> & { docstatus?: number; status?: string }): SalesOrderSummary {
  const docstatus = Number(document.docstatus ?? 0)
  const normalized = { ...document, name: String(document.name ?? ''), customer: String(document.customer ?? ''), company: String(document.company ?? ''), transaction_date: String(document.transaction_date ?? ''), status: document.status || (docstatus === 0 ? 'Draft' : docstatus === 1 ? 'To Deliver and Bill' : 'Cancelled'), docstatus, items: (document.items ?? []).map((item) => ({ ...item, item_code: String(item.item_code ?? ''), qty: Number(item.qty ?? 0), rate: Number(item.rate ?? 0), price_list_rate: Number(item.price_list_rate ?? item.rate), conversion_factor: Number(item.conversion_factor ?? 1) })) }
  return { ...normalized, status: salesOrderStatusLabel(normalized) }
}

export function filterSalesOrders(rows: SalesOrderSummary[], search: string, status: string, customer = '') {
  const query = search.trim().toLocaleLowerCase()
  return rows.filter((row) => (status === 'Todas' || salesOrderStatusLabel(row) === status) && (!customer || row.customer === customer) && (!query || [row.name, row.customer, row.customer_name].some((value) => String(value ?? '').toLocaleLowerCase().includes(query))))
}
