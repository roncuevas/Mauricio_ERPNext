import { describe, expect, it } from 'vitest'
import { defaultDeliveryDate, extractMappedSalesOrder, filterQuotations, normalizeMappedSalesOrder, quotationValidityState, relatedSalesOrderFilters, relatedSalesOrderNames, validateMappedSalesOrder, validateQuotationForSalesOrder } from './quotations'

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
    expect(defaultDeliveryDate(undefined, new Date('2026-10-16T12:00:00'))).toBe('2026-10-16')
    expect(defaultDeliveryDate('2026-10-20', new Date('2026-10-16T12:00:00'))).toBe('2026-10-20')
  })

  it('validates required conversion data and date order', () => {
    const quotation = { party_name: 'Cliente', company: 'Empresa', transaction_date: '2026-10-20', items: [{ item_code: 'ITEM-1', qty: 1, rate: 10 }] }
    expect(validateQuotationForSalesOrder(quotation, '2026-10-19')).toContain('anterior')
    expect(validateQuotationForSalesOrder({ ...quotation, party_name: '' }, '2026-10-20')).toContain('cliente')
    expect(validateQuotationForSalesOrder({ ...quotation, company: '' }, '2026-10-20')).toContain('compañía')
    expect(validateQuotationForSalesOrder({ ...quotation, items: [] }, '2026-10-20')).toContain('partidas')
  })

  it('normalizes the header and every mapped row without metadata', () => {
    expect(normalizeMappedSalesOrder({ doctype: 'Sales Order', name: 'new', docstatus: 0, customer: 'Cliente', items: [{ doctype: 'Sales Order Item', name: 'row', parent: 'new', item_code: 'ITEM-1' }] }, '2026-10-21')).toEqual({ doctype: 'Sales Order', customer: 'Cliente', delivery_date: '2026-10-21', items: [{ doctype: 'Sales Order Item', item_code: 'ITEM-1', delivery_date: '2026-10-21' }] })
  })

  it('validates mapped required fields and detects draft or submitted related orders', () => {
    expect(validateMappedSalesOrder({ customer: 'Cliente', company: 'Empresa', items: [{}] })).toBeNull()
    expect(validateMappedSalesOrder({ customer: 'Cliente', items: [{}] })).toContain('compañía')
    expect(relatedSalesOrderFilters('SAL-QTN-0001')).toEqual([['items.prevdoc_docname', '=', 'SAL-QTN-0001'], ['docstatus', '<', 2]])
    expect(relatedSalesOrderNames([{ parent: 'SO-1', docstatus: 0 }, { parent: 'SO-2', docstatus: 1 }, { parent: 'SO-3', docstatus: 2 }])).toEqual(['SO-1', 'SO-2'])
  })
})
