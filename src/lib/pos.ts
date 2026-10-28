import type { PosCartLine, PosOpeningEntry, PosPaymentLine, PosPaymentMethod, PosProfile, PosTaxRow } from './types'

export type PosInvoiceMode = 'Sales Invoice' | 'POS Invoice'
export type PosClosingInvoice = { name: string; doctype: PosInvoiceMode; posting_date?: string; grand_total?: number; customer?: string; is_return?: number | boolean; return_against?: string; net_total?: number; total_qty?: number; total_taxes_and_charges?: number; owner?: string; pos_profile?: string; docstatus?: number; consolidated_invoice?: string; pos_closing_entry?: string; is_pos?: number | boolean; is_created_using_pos?: number | boolean }
export type PosClosingPayment = { mode_of_payment: string; amount: number; account?: string }
export type PosClosingTax = { account_head: string; amount: number }
export type PosOpeningState = { name: string; status?: string; company?: string; pos_profile?: string; user?: string; period_start_date?: string; balance_details?: Array<{ mode_of_payment?: string; opening_amount?: number }> }
export type PosClosingSummary = { rows: Array<{ modeOfPayment: string; opening: number; expected: number; expectedTotal: number; captured: number; difference: number }>; netTotal: number; totalTaxes: number; grandTotal: number; totalQuantity: number; invoiceCount: number }

export type PosTotals = {
  subtotal: number
  subtotalWithoutTaxes: number
  discount: number
  taxes: PosTaxCalculation[]
  totalTaxes: number
  total: number
}

export type PosTaxCalculation = PosTaxRow & {
  amount: number
  total: number
  base: number
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function isChecked(value: unknown) {
  return value === true || value === 1 || value === '1'
}

export function lineTotal(line: PosCartLine) {
  const gross = line.qty * line.rate
  return roundMoney(gross * (1 - Math.max(0, Math.min(100, line.discountPercentage ?? 0)) / 100))
}

export function calculateTaxes(lines: PosCartLine[], rows: PosTaxRow[], netTotal = roundMoney(lines.reduce((sum, line) => sum + lineTotal(line), 0))): PosTaxCalculation[] {
  const quantity = lines.reduce((sum, line) => sum + line.qty, 0)
  const calculations: PosTaxCalculation[] = []
  let runningTotal = netTotal
  for (const row of rows) {
    const rate = Number(row.rate ?? 0)
    const type = row.charge_type ?? 'On Net Total'
    const referenceIndex = row.reference_row === undefined ? -1 : Number(row.reference_row) - 1
    const reference = referenceIndex >= 0 ? calculations[referenceIndex] : undefined
    const included = isChecked(row.included_in_print_rate)
    const base = type === 'Actual' ? 0 : type === 'On Item Quantity' ? quantity : type === 'On Previous Row Amount' ? (reference?.amount ?? 0) : type === 'On Previous Row Total' ? (reference?.total ?? runningTotal) : netTotal
    const rawAmount = type === 'Actual' ? Number(row.tax_amount ?? 0) : included && type !== 'On Item Quantity' && rate > -100 ? base - (base / (1 + rate / 100)) : type === 'On Item Quantity' ? quantity * rate : base * rate / 100
    const amount = roundMoney(rawAmount)
    const signedAmount = row.add_deduct_tax === 'Deduct' ? -amount : amount
    if (!included) runningTotal = roundMoney(runningTotal + signedAmount)
    calculations.push({ ...row, amount: signedAmount, total: runningTotal, base: roundMoney(base) })
  }
  return calculations
}

export function cartTotals(lines: PosCartLine[], taxRows: PosTaxRow[] = []): PosTotals {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.qty * line.rate, 0))
  const total = roundMoney(lines.reduce((sum, line) => sum + lineTotal(line), 0))
  const taxes = calculateTaxes(lines, taxRows, total)
  const totalTaxes = roundMoney(taxes.reduce((sum, tax) => sum + tax.amount, 0))
  const payableTaxes = roundMoney(taxes.filter((tax) => !isChecked(tax.included_in_print_rate)).reduce((sum, tax) => sum + tax.amount, 0))
  const finalTotal = roundMoney(total + payableTaxes)
  return { subtotal, subtotalWithoutTaxes: roundMoney(finalTotal - totalTaxes), discount: roundMoney(subtotal - total), taxes, totalTaxes, total: finalTotal }
}

export function validatePayments(payments: PosPaymentLine[], total: number) {
  if (!payments.length) throw new Error('Agrega al menos una forma de pago.')
  if (payments.some((payment) => !payment.modeOfPayment || !Number.isFinite(payment.amount) || payment.amount < 0)) throw new Error('Cada pago debe tener forma y cantidad válida.')
  const paid = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0))
  if (paid < roundMoney(total)) throw new Error(`Faltan ${formatMoney(roundMoney(total - paid))} por cobrar.`)
  return { paid, change: roundMoney(Math.max(0, paid - total)) }
}

export function formatMoney(value: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(value)
}

export function openingPayload(input: { profile: PosProfile; user: string; openingAt: string; balances: PosPaymentLine[] }) {
  if (!input.user) throw new Error('ERPNext no devolvió el usuario actual.')
  if (!validDate(input.openingAt)) throw new Error('La fecha de apertura no es válida.')
  if (!input.profile.name || !input.profile.company) throw new Error('El POS Profile no tiene empresa configurada.')
  if (!input.profile.warehouse) throw new Error('El POS Profile no tiene almacén configurado.')
  const balances = input.balances.map((line) => ({ modeOfPayment: line.modeOfPayment, amount: Number(line.amount) }))
  if (!balances.length) throw new Error('Agrega al menos una forma de pago.')
  if (balances.some((line) => !line.modeOfPayment || line.amount < 0 || !Number.isFinite(line.amount))) throw new Error('Captura fondos iniciales válidos.')
  return {
    doctype: 'POS Opening Entry',
    company: input.profile.company,
    pos_profile: input.profile.name,
    user: input.user,
    period_start_date: formatErpNextDateTime(input.openingAt),
    posting_date: input.openingAt.slice(0, 10),
    balance_details: balances.map((line) => ({ mode_of_payment: line.modeOfPayment, opening_amount: line.amount })),
  }
}

function formatErpNextDateTime(value: string) {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function salesInvoicePayload(input: { profile: PosProfile; customer: string; postingDate: string; postingTime: string; lines: PosCartLine[]; payments: PosPaymentLine[]; taxes?: PosTaxRow[]; posOpeningEntry?: string; invoiceMode?: PosInvoiceMode }) {
  const taxes = input.taxes ?? []
  const totals = cartTotals(input.lines, taxes)
  validatePayments(input.payments, totals.total)
  if (!input.customer.trim()) throw new Error('Selecciona un cliente.')
  if (!input.lines.length) throw new Error('Agrega al menos un producto.')
  if (!input.profile.company || !input.profile.warehouse) throw new Error('El POS Profile no tiene empresa y almacén completos.')
  return {
    doctype: input.invoiceMode ?? 'Sales Invoice',
    is_pos: 1,
    is_created_using_pos: 1,
    pos_profile: input.profile.name,
    pos_opening_entry: input.posOpeningEntry,
    company: input.profile.company,
    customer: input.customer,
    posting_date: input.postingDate,
    posting_time: input.postingTime,
    due_date: input.postingDate,
    set_warehouse: input.profile.warehouse,
    selling_price_list: input.profile.selling_price_list,
    tax_category: input.profile.tax_category,
    taxes_and_charges: input.profile.taxes_and_charges,
    update_stock: 1,
    items: input.lines.map((line) => ({
      item_code: line.itemCode,
      item_name: line.itemName,
      qty: line.qty,
      rate: line.rate,
      price_list_rate: line.priceListRate ?? line.rate,
      uom: line.uom,
      stock_uom: line.stockUom || line.uom,
      conversion_factor: line.conversionFactor || 1,
      weight_per_unit: line.weightPerUnit,
      weight_uom: line.weightUom,
      warehouse: line.warehouse || input.profile.warehouse,
      discount_percentage: line.discountPercentage || undefined,
    })),
    taxes: taxes.map((row, index) => ({ ...row, idx: index + 1, tax_amount: totals.taxes[index]?.amount ?? row.tax_amount ?? 0 })),
    payments: input.payments.map((payment) => ({ mode_of_payment: payment.modeOfPayment, amount: payment.amount })),
  }
}

export function draftInvoicePayload(input: { profile: PosProfile; customer: string; postingDate: string; postingTime: string; lines: PosCartLine[]; taxes?: PosTaxRow[]; posOpeningEntry?: string; invoiceMode?: PosInvoiceMode }) {
  if (!input.customer.trim()) throw new Error('Selecciona un cliente antes de guardar el carrito.')
  if (!input.lines.length) throw new Error('Agrega al menos un producto antes de guardar el carrito.')
  if (!input.profile.company || !input.profile.warehouse) throw new Error('El POS Profile no tiene empresa y almacén completos.')
  return {
    doctype: input.invoiceMode ?? 'Sales Invoice',
    is_pos: 1,
    is_created_using_pos: 1,
    pos_profile: input.profile.name,
    pos_opening_entry: input.posOpeningEntry,
    company: input.profile.company,
    customer: input.customer,
    posting_date: input.postingDate,
    posting_time: input.postingTime,
    due_date: input.postingDate,
    set_warehouse: input.profile.warehouse,
    selling_price_list: input.profile.selling_price_list,
    tax_category: input.profile.tax_category,
    taxes_and_charges: input.profile.taxes_and_charges,
    update_stock: 1,
    items: input.lines.map((line) => ({
      item_code: line.itemCode,
      item_name: line.itemName,
      qty: line.qty,
      rate: line.rate,
      price_list_rate: line.priceListRate ?? line.rate,
      uom: line.uom,
      stock_uom: line.stockUom || line.uom,
      conversion_factor: line.conversionFactor || 1,
      weight_per_unit: line.weightPerUnit,
      weight_uom: line.weightUom,
      warehouse: line.warehouse || input.profile.warehouse,
      discount_percentage: line.discountPercentage || undefined,
    })),
    taxes: (input.taxes ?? []).map((row, index) => ({ ...row, idx: index + 1, tax_amount: cartTotals(input.lines, input.taxes ?? []).taxes[index]?.amount ?? row.tax_amount ?? 0 })),
    payments: [],
  }
}

export function draftToCartLines(items: Array<{ item_code: string; item_name?: string; qty: number; rate: number; price_list_rate?: number; uom?: string; stock_uom?: string; conversion_factor?: number; weight_per_unit?: number; weight_uom?: string; warehouse?: string; discount_percentage?: number }>): PosCartLine[] {
  return items.map((item) => ({ itemCode: item.item_code, itemName: item.item_name || item.item_code, qty: Number(item.qty), rate: Number(item.rate), priceListRate: Number(item.price_list_rate ?? item.rate), rateOverride: Number(item.price_list_rate ?? item.rate) !== Number(item.rate), uom: item.uom, stockUom: item.stock_uom || item.uom, conversionFactor: Number(item.conversion_factor ?? 1), weightPerUnit: item.weight_per_unit, weightUom: item.weight_uom, warehouse: item.warehouse, discountPercentage: item.discount_percentage }))
}

export function closingPayload(input: { profile: PosProfile; user: string; openingEntry: string; periodStartAt: string; periodEndAt: string; closingDate: string; closingTime: string; openingBalances: PosPaymentLine[]; balances: PosPaymentLine[]; invoices: PosClosingInvoice[]; payments: PosClosingPayment[]; taxes: PosClosingTax[] }) {
  if (!input.openingEntry) throw new Error('No hay turno abierto.')
  assertUniqueModes(input.openingBalances)
  assertUniqueModes(input.balances)
  assertUniqueModes(input.payments)
  const summary = closingSummary(input)
  const paymentReconciliation = summary.rows.map((row) => ({ mode_of_payment: row.modeOfPayment, opening_amount: row.opening, expected_amount: row.expected, closing_amount: row.captured }))
  const salesInvoices = input.invoices.filter((invoice) => invoice.doctype === 'Sales Invoice').map((invoice) => ({ sales_invoice: invoice.name, posting_date: invoice.posting_date, grand_total: invoice.grand_total, customer: invoice.customer, is_return: invoice.is_return, return_against: invoice.return_against }))
  const posInvoices = input.invoices.filter((invoice) => invoice.doctype === 'POS Invoice').map((invoice) => ({ pos_invoice: invoice.name, posting_date: invoice.posting_date, grand_total: invoice.grand_total, customer: invoice.customer, is_return: invoice.is_return, return_against: invoice.return_against }))
  return {
    doctype: 'POS Closing Entry',
    company: input.profile.company,
    pos_profile: input.profile.name,
    user: input.user,
    pos_opening_entry: input.openingEntry,
    period_start_date: input.periodStartAt,
    period_end_date: input.periodEndAt,
    posting_date: input.closingDate,
    posting_time: input.closingTime,
    payment_reconciliation: paymentReconciliation,
    sales_invoices: salesInvoices,
    pos_invoices: posInvoices,
    taxes: input.taxes,
    net_total: summary.netTotal,
    total_taxes_and_charges: summary.totalTaxes,
    grand_total: summary.grandTotal,
    total_quantity: summary.totalQuantity,
  }
}

export function returnInvoicePayload(invoice: { name: string; customer: string; company: string; doctype?: PosInvoiceMode; pos_profile?: string; items: Array<{ item_code: string; item_name?: string; qty: number; rate: number; uom?: string; warehouse?: string }> }) {
  if (!invoice.name || !invoice.customer || !invoice.company || !invoice.items.length) throw new Error('La factura no tiene datos suficientes para devolverla.')
  return {
    doctype: invoice.doctype ?? 'Sales Invoice',
    is_return: 1,
    return_against: invoice.name,
    is_pos: 1,
    is_created_using_pos: 1,
    pos_profile: invoice.pos_profile,
    company: invoice.company,
    customer: invoice.customer,
    posting_date: new Date().toISOString().slice(0, 10),
    update_stock: 1,
    items: invoice.items.map((line) => ({ item_code: line.item_code, item_name: line.item_name, qty: -Math.abs(line.qty), rate: line.rate, uom: line.uom, warehouse: line.warehouse })),
  }
}

export function paymentLines(methods: PosPaymentMethod[], total = 0): PosPaymentLine[] {
  const first = methods.find((method) => method.default) ?? methods[0]
  return first ? [{ modeOfPayment: first.mode_of_payment, amount: total }] : []
}

export type PosOpeningAvailability = 'available' | 'profile-open' | 'user-open' | 'not-applicable' | 'disabled' | 'invalid'

function isDisabled(value: unknown) {
  return value === true || value === 1 || value === '1'
}

export function isPosProfileAvailableForUser(profile: PosProfile, user: string) {
  if (isDisabled(profile.disabled) || !profile.company || !profile.warehouse) return false
  const assignedUsers = profile.applicable_for_users ?? []
  return !assignedUsers.length || assignedUsers.some((row) => row.user === user)
}

export function openingAvailability(input: { profile: PosProfile; user: string; openings: PosOpeningEntry[] }) {
  const { profile, user, openings } = input
  if (isDisabled(profile.disabled)) return 'disabled' as const
  if (!profile.company || !profile.warehouse) return 'invalid' as const
  const assignedUsers = profile.applicable_for_users ?? []
  if (assignedUsers.length && !assignedUsers.some((row) => row.user === user)) return 'not-applicable' as const
  const open = openings.filter((entry) => entry.status === 'Open')
  if (open.some((entry) => entry.pos_profile === profile.name)) return 'profile-open' as const
  if (open.some((entry) => entry.user === user)) return 'user-open' as const
  return 'available' as const
}

export function validateOpeningRequest(input: { profile: PosProfile; user: string; openings: PosOpeningEntry[]; balances: PosPaymentLine[] }) {
  if (!input.user) throw new Error('ERPNext no devolvió el usuario actual.')
  const availability = openingAvailability(input)
  if (availability === 'disabled') throw new Error('El POS Profile está desactivado.')
  if (availability === 'invalid') throw new Error('El POS Profile debe tener empresa y almacén configurados.')
  if (availability === 'not-applicable') throw new Error('El POS Profile no está asignado al usuario actual.')
  if (availability === 'profile-open') throw new Error('Ya existe un turno abierto para este POS Profile.')
  if (availability === 'user-open') throw new Error('El usuario actual ya tiene un turno abierto.')
  assertUniqueModes(input.balances)
  if (!input.balances.length) throw new Error('Agrega al menos una forma de pago.')
  if (input.balances.some((line) => !line.modeOfPayment || !Number.isFinite(line.amount) || line.amount < 0)) throw new Error('Captura fondos iniciales válidos.')
}

function validDate(value: string) {
  return Boolean(value) && !Number.isNaN(Date.parse(value))
}

function amount(value: unknown, label: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} debe ser un importe finito y no negativo.`)
  return roundMoney(parsed)
}

function signedAmount(value: unknown, label: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} debe ser un importe finito.`)
  return roundMoney(parsed)
}

function assertUniqueModes(lines: Array<{ modeOfPayment?: string; mode_of_payment?: string }>) {
  const modes = lines.map((line) => line.modeOfPayment || line.mode_of_payment || '').filter(Boolean)
  if (new Set(modes).size !== modes.length) throw new Error('No puede haber métodos de pago duplicados.')
}

export function normalizeClosingResponse(data: { invoices?: Array<PosClosingInvoice & { doctype?: PosInvoiceMode }>; payments?: PosClosingPayment[]; taxes?: Array<{ account_head: string; amount?: number; tax_amount?: number }> } | null | undefined) {
  const invoices = (data?.invoices ?? []).map((invoice) => ({ ...invoice, doctype: invoice.doctype === 'POS Invoice' ? 'POS Invoice' as const : 'Sales Invoice' as const }))
  const payments = (data?.payments ?? []).map((payment) => ({ ...payment, amount: amount(payment.amount, `Pago de ${payment.mode_of_payment || 'método'}`) })).filter((payment) => Boolean(payment.mode_of_payment))
  const taxes = (data?.taxes ?? []).map((tax) => ({ account_head: tax.account_head, amount: signedAmount(tax.amount ?? tax.tax_amount, `Impuesto ${tax.account_head || ''}`) })).filter((tax) => Boolean(tax.account_head))
  return { invoices, payments, taxes }
}

export function validateClosingInput(input: { profile: PosProfile; user: string; opening: PosOpeningState; periodEndAt: string; balances: PosPaymentLine[]; invoices: PosClosingInvoice[]; payments: PosClosingPayment[]; cartLines?: PosCartLine[] }) {
  if (!input.opening?.name) throw new Error('No hay turno abierto.')
  if (input.opening.status && input.opening.status !== 'Open') throw new Error('El turno ya no está abierto en ERPNext.')
  if (input.opening.pos_profile && input.opening.pos_profile !== input.profile.name) throw new Error('El POS Profile del turno no coincide con el perfil seleccionado.')
  if (input.opening.company && input.opening.company !== input.profile.company) throw new Error('La empresa del turno no coincide con el POS Profile.')
  if (input.opening.user && input.opening.user !== input.user) throw new Error(`El usuario del turno (${input.opening.user}) no coincide con el usuario actual (${input.user}).`)
  if (!input.profile.name || !input.profile.company) throw new Error('El POS Profile no tiene empresa configurada.')
  if (!input.user || !validDate(input.opening.period_start_date ?? '') || !validDate(input.periodEndAt) || Date.parse(input.periodEndAt) < Date.parse(input.opening.period_start_date ?? '')) throw new Error('El periodo del cierre no es válido.')
  if (input.cartLines?.length) throw new Error('No puedes cerrar el turno con una venta pendiente en el carrito.')
  assertUniqueModes(input.balances)
  assertUniqueModes(input.payments)
  for (const line of input.balances) amount(line.amount, `Arqueo de ${line.modeOfPayment}`)
  for (const payment of input.payments) { if (!payment.mode_of_payment) throw new Error('Cada pago debe tener método de pago.'); amount(payment.amount, `Pago de ${payment.mode_of_payment}`) }
  for (const invoice of input.invoices) {
    if (!invoice.name) throw new Error('ERPNext devolvió una factura sin nombre.')
    for (const field of ['grand_total', 'net_total', 'total_qty', 'total_taxes_and_charges'] as const) if (invoice[field] !== undefined && !Number.isFinite(Number(invoice[field]))) throw new Error(`La factura ${invoice.name} tiene un importe inválido.`)
    if (invoice.docstatus !== undefined && invoice.docstatus !== 1) throw new Error(`La factura ${invoice.name} no está enviada.`)
    if (invoice.pos_profile && invoice.pos_profile !== input.profile.name) throw new Error(`La factura ${invoice.name} pertenece a otro POS Profile.`)
    if (invoice.owner && invoice.owner !== input.user) throw new Error(`La factura ${invoice.name} pertenece a otro usuario.`)
    if (invoice.consolidated_invoice || invoice.pos_closing_entry) throw new Error(`La factura ${invoice.name} ya está consolidada.`)
  }
}

export function closingSummary(input: { openingBalances: PosPaymentLine[]; balances: PosPaymentLine[]; payments: PosClosingPayment[]; invoices: PosClosingInvoice[]; taxes: PosClosingTax[] }): PosClosingSummary {
  const modes = [...new Set([...input.openingBalances.map((line) => line.modeOfPayment), ...input.balances.map((line) => line.modeOfPayment), ...input.payments.map((line) => line.mode_of_payment)].filter(Boolean))]
  const rows = modes.map((modeOfPayment) => {
    const opening = roundMoney(input.openingBalances.find((line) => line.modeOfPayment === modeOfPayment)?.amount ?? 0)
    const expected = roundMoney(input.payments.find((line) => line.mode_of_payment === modeOfPayment)?.amount ?? 0)
    const captured = roundMoney(input.balances.find((line) => line.modeOfPayment === modeOfPayment)?.amount ?? 0)
    return { modeOfPayment, opening, expected, expectedTotal: roundMoney(opening + expected), captured, difference: roundMoney(captured - opening - expected) }
  })
  return { rows, netTotal: roundMoney(input.invoices.reduce((sum, invoice) => sum + Number(invoice.net_total ?? 0), 0)), totalTaxes: roundMoney(input.taxes.reduce((sum, tax) => sum + tax.amount, 0)), grandTotal: roundMoney(input.invoices.reduce((sum, invoice) => sum + Number(invoice.grand_total ?? 0), 0)), totalQuantity: roundMoney(input.invoices.reduce((sum, invoice) => sum + Number(invoice.total_qty ?? 0), 0)), invoiceCount: input.invoices.length }
}
