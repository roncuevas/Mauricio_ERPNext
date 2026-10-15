import { describe, expect, it } from 'vitest'
import { cartTotals, closingPayload, closingSummary, draftInvoicePayload, draftToCartLines, normalizeClosingResponse, openingAvailability, openingPayload, returnInvoicePayload, salesInvoicePayload, validateClosingInput, validateOpeningRequest, validatePayments } from './pos'
import type { PosTaxRow } from './types'
import type { PosProfile } from './types'

const profile: PosProfile = { name: 'Caja Principal', company: 'Empresa Demo', warehouse: 'Almacén - ED', selling_price_list: 'Standard Selling' }

describe('POS rules', () => {
  it('calculates discounts and totals', () => {
    expect(cartTotals([{ itemCode: 'A', itemName: 'Producto A', qty: 2, rate: 100, discountPercentage: 10 }])).toMatchObject({ subtotal: 200, discount: 20, total: 180, totalTaxes: 0, taxes: [] })
  })

  it('calculates ERPNext tax rows over the discounted net total', () => {
    const tax: PosTaxRow = { charge_type: 'On Net Total', account_head: 'IVA - ED', description: 'IVA 16%', rate: 16, add_deduct_tax: 'Add' }
    expect(cartTotals([{ itemCode: 'A', itemName: 'Producto A', qty: 1, rate: 100 }], [tax])).toMatchObject({ total: 116, totalTaxes: 16, taxes: [{ amount: 16, base: 100, total: 116 }] })
  })

  it('supports inclusive and compound taxes without treating string zero as enabled', () => {
    const taxes: PosTaxRow[] = [
      { charge_type: 'On Net Total', description: 'IVA incluido', rate: 16, included_in_print_rate: 1 },
      { charge_type: 'On Previous Row Total', description: 'Recargo', rate: 10, reference_row: 1, included_in_print_rate: '0' },
    ]
    expect(cartTotals([{ itemCode: 'A', itemName: 'Producto A', qty: 1, rate: 100 }], taxes)).toMatchObject({ total: 110, totalTaxes: 23.79, taxes: [{ amount: 13.79 }, { amount: 10 }] })
  })

  it('validates mixed payments and calculates change', () => {
    expect(validatePayments([{ modeOfPayment: 'Efectivo', amount: 100 }, { modeOfPayment: 'Tarjeta', amount: 100 }], 180)).toEqual({ paid: 200, change: 20 })
  })

  it('rejects payment below total', () => {
    expect(() => validatePayments([{ modeOfPayment: 'Efectivo', amount: 10 }], 20)).toThrow('Faltan')
  })

  it('builds standard ERPNext opening and sales payloads', () => {
    const opening = openingPayload({ profile, user: 'cashier@example.com', openingAt: '2026-10-14T09:00:00.000Z', balances: [{ modeOfPayment: 'Efectivo', amount: 500 }] })
    expect(opening).toMatchObject({ doctype: 'POS Opening Entry', company: 'Empresa Demo', pos_profile: 'Caja Principal', balance_details: [{ opening_amount: 500 }] })
    expect(opening.period_start_date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(salesInvoicePayload({ profile, customer: 'Cliente Mostrador', postingDate: '2026-10-14', postingTime: '09:00:00', lines: [{ itemCode: 'A', itemName: 'Producto A', qty: 1, rate: 120 }], payments: [{ modeOfPayment: 'Efectivo', amount: 120 }], posOpeningEntry: 'POS-O-0001' })).toMatchObject({ doctype: 'Sales Invoice', is_pos: 1, is_created_using_pos: 1, update_stock: 1, payments: [{ mode_of_payment: 'Efectivo', amount: 120 }] })
  })

  it('enforces ERPNext opening ownership and profile assignment rules', () => {
    const openings = [{ name: 'POS-O-1', status: 'Open', pos_profile: profile.name, user: 'other@example.com' }]
    expect(openingAvailability({ profile, user: 'cashier@example.com', openings })).toBe('profile-open')
    expect(() => validateOpeningRequest({ profile, user: 'cashier@example.com', openings, balances: [{ modeOfPayment: 'Efectivo', amount: 100 }] })).toThrow('POS Profile')
    expect(openingAvailability({ profile: { ...profile, name: 'Otra Caja' }, user: 'cashier@example.com', openings: [{ name: 'POS-O-2', status: 'Open', pos_profile: 'Caja Secundaria', user: 'cashier@example.com' }] })).toBe('user-open')
    expect(openingAvailability({ profile: { ...profile, applicable_for_users: [{ user: 'other@example.com' }] }, user: 'cashier@example.com', openings: [] })).toBe('not-applicable')
  })

  it('rejects invalid opening funds and duplicate payment methods', () => {
    expect(() => validateOpeningRequest({ profile, user: 'cashier@example.com', openings: [], balances: [{ modeOfPayment: 'Efectivo', amount: Number.NaN }] })).toThrow('válidos')
    expect(() => validateOpeningRequest({ profile, user: 'cashier@example.com', openings: [], balances: [{ modeOfPayment: 'Efectivo', amount: 1 }, { modeOfPayment: 'Efectivo', amount: 2 }] })).toThrow('duplicados')
    expect(() => openingPayload({ profile, user: 'cashier@example.com', openingAt: '2026-10-14T09:00:00.000Z', balances: [{ modeOfPayment: 'Efectivo', amount: Infinity }] })).toThrow('válidos')
    expect(() => openingPayload({ profile, user: 'cashier@example.com', openingAt: 'invalid', balances: [{ modeOfPayment: 'Efectivo', amount: 0 }] })).toThrow('fecha')
  })

  it('sends tax template metadata and calculated amounts to ERPNext', () => {
    const tax: PosTaxRow = { charge_type: 'On Net Total', account_head: 'IVA - ED', description: 'IVA', rate: 16, add_deduct_tax: 'Add' }
    const payload = salesInvoicePayload({ profile: { ...profile, taxes_and_charges: 'IVA 16%', tax_category: 'General' }, customer: 'Cliente Mostrador', postingDate: '2026-10-14', postingTime: '09:00:00', lines: [{ itemCode: 'A', itemName: 'Producto A', qty: 1, rate: 100 }], payments: [{ modeOfPayment: 'Efectivo', amount: 116 }], taxes: [tax] })
    expect(payload).toMatchObject({ taxes_and_charges: 'IVA 16%', tax_category: 'General', taxes: [{ idx: 1, tax_amount: 16 }] })
  })

  it('preserves a custom rate and its price-list reference', () => {
    const lines = [{ itemCode: 'A', itemName: 'Producto A', qty: 1, rate: 80, priceListRate: 100, rateOverride: true }]
    const payload = salesInvoicePayload({ profile, customer: 'Cliente Mostrador', postingDate: '2026-10-14', postingTime: '09:00:00', lines, payments: [{ modeOfPayment: 'Efectivo', amount: 80 }] })
    expect(payload.items).toMatchObject([{ rate: 80, price_list_rate: 100 }])
    expect(draftToCartLines([{ item_code: 'A', item_name: 'Producto A', qty: 1, rate: 120, price_list_rate: 100 }])).toMatchObject([{ rate: 120, priceListRate: 100, rateOverride: true }])
  })

  it('preserves alternate UOM conversion in the sales invoice', () => {
    const payload = salesInvoicePayload({ profile, customer: 'Cliente Mostrador', postingDate: '2026-10-14', postingTime: '09:00:00', lines: [{ itemCode: 'A', itemName: 'Producto A', qty: 2, rate: 50, uom: 'Caja', stockUom: 'Unidad', conversionFactor: 10 }], payments: [{ modeOfPayment: 'Efectivo', amount: 100 }], posOpeningEntry: 'POS-O-0001' })

    expect(payload.items).toMatchObject([{ uom: 'Caja', stock_uom: 'Unidad', conversion_factor: 10 }])
  })

  it('builds a payment-free draft and restores UOM details', () => {
    const payload = draftInvoicePayload({ profile, customer: 'Cliente Mostrador', postingDate: '2026-10-14', postingTime: '09:00:00', lines: [{ itemCode: 'A', itemName: 'Producto A', qty: 2, rate: 50, uom: 'Caja', stockUom: 'Unidad', conversionFactor: 10 }], posOpeningEntry: 'POS-O-0001' })

    expect(payload).toMatchObject({ doctype: 'Sales Invoice', is_pos: 1, customer: 'Cliente Mostrador', payments: [] })
    expect(payload.items).toMatchObject([{ uom: 'Caja', stock_uom: 'Unidad', conversion_factor: 10 }])
    expect(draftToCartLines([{ item_code: 'A', item_name: 'Producto A', qty: 2, rate: 50, uom: 'Caja', stock_uom: 'Unidad', conversion_factor: 10 }])).toMatchObject([{ itemCode: 'A', itemName: 'Producto A', qty: 2, rate: 50, uom: 'Caja', stockUom: 'Unidad', conversionFactor: 10 }])
  })

  it('builds closing payload with invoices', () => {
    expect(closingPayload({ profile, user: 'cashier@example.com', openingEntry: 'POS-O-0001', periodStartAt: '2026-10-14T09:00:00.000Z', periodEndAt: '2026-10-14T18:00:00.000Z', closingDate: '2026-10-14', closingTime: '18:00:00', openingBalances: [{ modeOfPayment: 'Efectivo', amount: 500 }], balances: [{ modeOfPayment: 'Efectivo', amount: 900 }], payments: [{ mode_of_payment: 'Efectivo', amount: 400 }], taxes: [], invoices: [{ name: 'SINV-0001', doctype: 'Sales Invoice' }] })).toMatchObject({ doctype: 'POS Closing Entry', pos_opening_entry: 'POS-O-0001', sales_invoices: [{ sales_invoice: 'SINV-0001' }], payment_reconciliation: [{ expected_amount: 400, closing_amount: 900 }] })
  })

  it('includes official closing totals and calculates opening plus payments', () => {
    const invoices = [{ name: 'SINV-0001', doctype: 'Sales Invoice' as const, net_total: 100, grand_total: 116, total_qty: 2, total_taxes_and_charges: 16 }]
    const summary = closingSummary({ openingBalances: [{ modeOfPayment: 'Efectivo', amount: 500 }], balances: [{ modeOfPayment: 'Efectivo', amount: 600 }, { modeOfPayment: 'Tarjeta', amount: 50 }], payments: [{ mode_of_payment: 'Efectivo', amount: 100 }, { mode_of_payment: 'Tarjeta', amount: 50 }], invoices, taxes: [{ account_head: 'IVA', amount: 16 }] })
    expect(summary.rows).toEqual([{ modeOfPayment: 'Efectivo', opening: 500, expected: 100, expectedTotal: 600, captured: 600, difference: 0 }, { modeOfPayment: 'Tarjeta', opening: 0, expected: 50, expectedTotal: 50, captured: 50, difference: 0 }])
    expect(closingPayload({ profile, user: 'cashier@example.com', openingEntry: 'POS-O-0001', periodStartAt: '2026-10-14T09:00:00.000Z', periodEndAt: '2026-10-14T18:00:00.000Z', closingDate: '2026-10-14', closingTime: '18:00:00', openingBalances: [{ modeOfPayment: 'Efectivo', amount: 500 }], balances: [{ modeOfPayment: 'Efectivo', amount: 600 }], payments: [{ mode_of_payment: 'Efectivo', amount: 100 }], taxes: [{ account_head: 'IVA', amount: 16 }], invoices })).toMatchObject({ net_total: 100, grand_total: 116, total_quantity: 2, total_taxes_and_charges: 16 })
  })

  it('normalizes invoice kinds and server tax names', () => {
    expect(normalizeClosingResponse({ invoices: [{ name: 'POS-1', doctype: 'POS Invoice' }], payments: [{ mode_of_payment: 'Efectivo', amount: 0 }], taxes: [{ account_head: 'IVA', tax_amount: 16 }] })).toEqual({ invoices: [{ name: 'POS-1', doctype: 'POS Invoice' }], payments: [{ mode_of_payment: 'Efectivo', amount: 0 }], taxes: [{ account_head: 'IVA', amount: 16 }] })
  })

  it('keeps return invoice totals and taxes signed', () => {
    const normalized = normalizeClosingResponse({ invoices: [{ name: 'SINV-RETURN', doctype: 'Sales Invoice', is_return: 1, grand_total: -116, net_total: -100 }], taxes: [{ account_head: 'IVA', tax_amount: -16 }] })
    expect(normalized.invoices[0]).toMatchObject({ is_return: 1, grand_total: -116 })
    expect(normalized.taxes).toEqual([{ account_head: 'IVA', amount: -16 }])
  })

  it('rejects invalid closing periods, duplicate methods, negative values and pending carts', () => {
    const base = { profile, user: 'cashier@example.com', opening: { name: 'POS-O-0001', status: 'Open', company: profile.company, pos_profile: profile.name, user: 'cashier@example.com', period_start_date: '2026-10-14T09:00:00.000Z' }, periodEndAt: '2026-10-14T18:00:00.000Z', balances: [{ modeOfPayment: 'Efectivo', amount: 0 }], invoices: [], payments: [], cartLines: [] }
    expect(() => validateClosingInput({ ...base, periodEndAt: '2026-10-13T18:00:00.000Z' })).toThrow('periodo')
    expect(() => validateClosingInput({ ...base, balances: [{ modeOfPayment: 'Efectivo', amount: 1 }, { modeOfPayment: 'Efectivo', amount: 2 }] })).toThrow('duplicados')
    expect(() => validateClosingInput({ ...base, balances: [{ modeOfPayment: 'Efectivo', amount: Number.NaN }] })).toThrow('finito')
    expect(() => validateClosingInput({ ...base, cartLines: [{ itemCode: 'A', itemName: 'A', qty: 1, rate: 10 }] })).toThrow('venta pendiente')
  })

  it('rejects an opening that ERPNext no longer considers open', () => {
    expect(() => validateClosingInput({ profile, user: 'cashier@example.com', opening: { name: 'POS-O-0001', status: 'Closed', period_start_date: '2026-10-14T09:00:00.000Z' }, periodEndAt: '2026-10-14T18:00:00.000Z', balances: [], invoices: [], payments: [] })).toThrow('ya no está abierto')
  })

  it('builds a stock-return invoice without changing the original', () => {
    expect(returnInvoicePayload({ name: 'SINV-0001', customer: 'Cliente', company: 'Empresa Demo', items: [{ item_code: 'A', qty: 2, rate: 100, warehouse: 'Almacén - ED' }] })).toMatchObject({ is_return: 1, return_against: 'SINV-0001', items: [{ item_code: 'A', qty: -2 }] })
  })
})
