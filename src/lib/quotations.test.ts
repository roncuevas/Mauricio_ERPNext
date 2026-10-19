import { describe, expect, it } from 'vitest'
import { defaultDeliveryDate, extractMappedSalesOrder, filterQuotations, minimumDeliveryDate, normalizeMappedSalesOrder, quotationPayload, quotationRevision, quotationValidityState, relatedSalesOrderFilters, relatedSalesOrderNames, validateMappedSalesOrder, validateQuotationForSalesOrder, validateQuotationForm } from './quotations'

const quotations = [
  { name: 'SAL-QTN-0001', customer_name: 'Cliente Uno', company: 'Empresa MX', status: 'Open' },
  { name: 'SAL-QTN-0002', customer_name: 'Cliente Dos', company: 'Empresa MX', status: 'Draft' },
  { name: 'SAL-QTN-0003', customer_name: 'Cliente Tres', company: 'Empresa MX', status: 'Ordered' },
]

describe('quotation helpers', () => {
  it('keeps only active quotations and filters by search and status', () => {
    expect(filterQuotations(quotations, '', 'Todas').map((item) => item.name)).toEqual(['SAL-QTN-0001', 'SAL-QTN-0002'])
    expect(filterQuotations(quotations, 'dos', 'Draft').map((item) => item.name)).toEqual(['SAL-QTN-0002'])
  })

  it('marks validity without mutating the quotation', () => {
    expect(quotationValidityState('2026-10-15', new Date('2026-10-16T12:00:00'))).toBe('vencida')
    expect(quotationValidityState('2026-10-17', new Date('2026-10-16T12:00:00'))).toBe('vigente')
    expect(quotationValidityState()).toBe('sin-vigencia')
  })

  it('extracts a mapped sales order and removes server metadata', () => {
    expect(extractMappedSalesOrder({ docs: [{ doctype: 'Sales Order', name: 'new-sales-order', docstatus: 0, customer: 'Cliente Uno', items: [{ doctype: 'Sales Order Item', name: 'new-row', item_code: 'ITEM-1', parent: 'new-sales-order' }] }] })).toEqual({ doctype: 'Sales Order', customer: 'Cliente Uno', items: [{ doctype: 'Sales Order Item', item_code: 'ITEM-1' }] })
  })

  it('accepts the direct mapped document returned by frappe.model.mapper.make_mapped_doc', () => {
    expect(extractMappedSalesOrder({ doctype: 'Sales Order', name: 'new-sales-order', customer: 'Cliente Uno', items: [{ doctype: 'Sales Order Item', item_code: 'ITEM-1', __islocal: 1 }] })).toEqual({ doctype: 'Sales Order', customer: 'Cliente Uno', items: [{ doctype: 'Sales Order Item', item_code: 'ITEM-1' }] })
  })

  it('accepts a mapped document nested in a data envelope', () => {
    expect(extractMappedSalesOrder({ data: { doctype: 'Sales Order', customer: 'Cliente Uno' } })).toEqual({ doctype: 'Sales Order', customer: 'Cliente Uno' })
  })

  it('defaults delivery date to today or the later transaction date', () => {
    expect(defaultDeliveryDate(undefined, new Date('2026-10-16T12:00:00'))).toBe('2026-10-17')
    expect(defaultDeliveryDate('2026-10-20', new Date('2026-10-16T12:00:00'))).toBe('2026-10-21')
    expect(minimumDeliveryDate('2026-10-15', new Date('2026-10-16T12:00:00'))).toBe('2026-10-17')
  })

  it('validates required conversion data and date order', () => {
    const quotation = { party_name: 'Cliente', company: 'Empresa', transaction_date: '2026-10-20', items: [{ item_code: 'ITEM-1', qty: 1, rate: 10 }] }
    expect(validateQuotationForSalesOrder(quotation, '2026-10-20')).toMatch(/posterior|after/)
    expect(validateQuotationForSalesOrder(quotation, '2026-10-19')).toMatch(/posterior|after/)
    expect(validateQuotationForSalesOrder({ ...quotation, party_name: '' }, '2026-10-21')).toMatch(/cliente|customer/)
    expect(validateQuotationForSalesOrder({ ...quotation, company: '' }, '2026-10-21')).toMatch(/compañía|company/)
    expect(validateQuotationForSalesOrder({ ...quotation, items: [] }, '2026-10-21')).toMatch(/partidas|items/)
  })

  it('normalizes the header and every mapped row without metadata', () => {
    expect(normalizeMappedSalesOrder({ doctype: 'Sales Order', name: 'new', docstatus: 0, customer: 'Cliente', items: [{ doctype: 'Sales Order Item', name: 'row', parent: 'new', item_code: 'ITEM-1' }] }, '2026-10-21')).toEqual({ doctype: 'Sales Order', customer: 'Cliente', delivery_date: '2026-10-21', items: [{ doctype: 'Sales Order Item', item_code: 'ITEM-1', delivery_date: '2026-10-21' }] })
  })

  it('validates mapped required fields and detects draft or submitted related orders', () => {
    expect(validateMappedSalesOrder({ customer: 'Cliente', company: 'Empresa', items: [{}] })).toBeNull()
    expect(validateMappedSalesOrder({ customer: 'Cliente', items: [{}] })).toMatch(/compañía|company/)
    expect(relatedSalesOrderFilters('SAL-QTN-0001')).toEqual([['items.prevdoc_docname', '=', 'SAL-QTN-0001'], ['docstatus', '<', 2]])
    expect(relatedSalesOrderNames([{ parent: 'SO-1', docstatus: 0 }, { parent: 'SO-2', docstatus: 1 }, { parent: 'SO-3', docstatus: 2 }])).toEqual(['SO-1', 'SO-2'])
  })

  it('builds a clean quotation payload with complete child tables', () => {
    const form = { quotation_to: 'Customer', party_name: 'C-1', company: 'Company', transaction_date: '2026-10-16', valid_till: '2026-10-20', items: [{ name: 'old-row', item_code: 'ITEM-1', qty: 2, rate: 10, parent: 'old', prevdoc_docname: 'SO-1' }], taxes: [{ name: 'old-tax', charge_type: 'On Net Total', rate: 16 }], payment_schedule: [{ name: 'old-pay', due_date: '2026-10-20', invoice_portion: 100 }], custom: { custom_channel: 'POS' }, grand_total: 20, modified: 'server' }
    expect(quotationPayload(form, true)).toEqual({ quotation_to: 'Customer', party_name: 'C-1', company: 'Company', transaction_date: '2026-10-16', valid_till: '2026-10-20', items: [{ item_code: 'ITEM-1', qty: 2, rate: 10, prevdoc_docname: 'SO-1' }], taxes: [{ charge_type: 'On Net Total', rate: 16 }], payment_schedule: [{ due_date: '2026-10-20', invoice_portion: 100 }], custom_channel: 'POS', docstatus: 0 })
  })

  it('validates dates, quantities and payment percentages before REST writes', () => {
    const form = { quotation_to: 'Customer', party_name: 'C-1', company: 'Company', transaction_date: '2026-10-20', valid_till: '2026-10-19', items: [{ item_code: 'ITEM-1', qty: 0, rate: 10 }], taxes: [], payment_schedule: [] }
    expect(validateQuotationForm(form)).toMatch(/vigencia|validity/)
    expect(validateQuotationForm({ ...form, valid_till: '2026-10-20' })).toMatch(/cantidad|quantity/)
    expect(validateQuotationForm({ ...form, valid_till: '2026-10-20', items: [{ item_code: 'ITEM-1', qty: 1, rate: 10 }], payment_schedule: [{ invoice_portion: 50 }] })).toMatch(/sumar 100|add up to 100/)
  })

  it('creates a revision payload with amended_from and no server identity', () => {
    const revision = quotationRevision({ quotation_to: 'Customer', party_name: 'C-1', company: 'Company', transaction_date: '2026-10-16', items: [{ item_code: 'ITEM-1', qty: 1, rate: 10, name: 'old-row' }], taxes: [], payment_schedule: [] }, 'QTN-1')
    expect(revision).toMatchObject({ amended_from: 'QTN-1', docstatus: 0 })
    expect(revision.name).toBeUndefined()
    expect((revision.items as Array<Record<string, unknown>>)[0].name).toBeUndefined()
  })
})
