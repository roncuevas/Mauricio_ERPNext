import { describe, expect, it } from 'vitest'
import { filterSalesOrders, normalizeSalesOrder, salesOrderPayload, salesOrderTotals, validateSalesOrderForm } from './sales-orders'
import type { SalesOrderFormState } from './types'

const form: SalesOrderFormState = { customer: 'CUST-1', transaction_date: '2026-10-17', delivery_date: '2026-10-17', company: 'Acme', currency: 'MXN', selling_price_list: 'Standard Selling', set_warehouse: 'Main', items: [{ item_code: 'SKU-1', qty: 2, rate: 100, discount_percentage: 10 }] }
describe('sales orders', () => {
  it('builds a draft payload with ERPNext line fields', () => expect(salesOrderPayload({ ...form, delivery_date: '2026-10-20', items: [{ ...form.items[0], stock_uom: 'Nos', price_list_rate: 110 }] }, true)).toMatchObject({ doctype: 'Sales Order', docstatus: 0, order_type: 'Sales', customer: 'CUST-1', delivery_date: '2026-10-20', items: [{ item_code: 'SKU-1', qty: 2, delivery_date: '2026-10-20', price_list_rate: 110 }] }))
  it('validates customer, lines and date boundaries', () => { expect(validateSalesOrderForm({ ...form, customer: '' })).toMatch(/cliente|customer/); expect(validateSalesOrderForm({ ...form, transaction_date: '2026-10-19' }, '2026-10-17')).toMatch(/futura|future/); expect(validateSalesOrderForm({ ...form, delivery_date: '2026-10-16' })).toMatch(/entrega|delivery/); expect(validateSalesOrderForm({ ...form, items: [] })).toMatch(/línea|line/) })
  it('calculates discounts', () => expect(salesOrderTotals(form.items)).toEqual({ subtotal: 200, discount: 20, total: 180 }))
  it('filters by customer, status and search', () => expect(filterSalesOrders([{ ...form, name: 'SO-1', customer_name: 'Ana', status: 'To Deliver and Bill', docstatus: 1 }], 'ana', 'Pendiente', 'CUST-1')).toHaveLength(1))
  it('normalizes ERPNext submitted and cancelled states', () => { expect(normalizeSalesOrder({ name: 'SO-1', customer: 'CUST-1', company: 'Acme', transaction_date: '2026-10-17', status: 'To Deliver and Bill', docstatus: 1 }).status).toBe('Pendiente'); expect(normalizeSalesOrder({ name: 'SO-2', customer: 'CUST-1', company: 'Acme', transaction_date: '2026-10-17', status: 'Cancelled', docstatus: 2 }).status).toBe('Cancelado') })
})
