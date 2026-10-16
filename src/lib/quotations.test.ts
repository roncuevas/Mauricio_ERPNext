import { describe, expect, it } from 'vitest'
import { extractMappedSalesOrder, filterQuotations, quotationValidityState } from './quotations'

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
})
