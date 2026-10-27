import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, IconButton, Input, Notice, Spinner } from './ui'
import { formatMoney, lineTotal, cartTotals } from '../lib/pos'
import type { PosCartLine, PosPaymentLine, PosPaymentMethod, PosSaleSummary, PosTaxRow } from '../lib/types'

function money(value: number, currency = 'MXN') { return formatMoney(value, currency) }
function formatFactor(value: number) { return Number.isInteger(value) ? String(value) : value.toLocaleString('es-MX', { maximumFractionDigits: 6 }) }
function formatWeight(value: string | number, unit: string) {
  const number = Number(String(value).replace(',', '.'))
  return Number.isFinite(number) ? `${number.toLocaleString('es-MX', { maximumFractionDigits: 2 })} ${unit}`.trim() : `${value} ${unit}`.trim()
}
function cartWeight(line: PosCartLine) {
  if (Number(line.weightPerUnit ?? 0) > 0) return formatWeight(line.weightPerUnit ?? 0, line.weightUom || '')
  const match = line.itemName.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(kg|g|mg|lb|oz|ml|l)\s*$/i)
  return match ? formatWeight(match[1], match[2]) : ''
}
function cartItemName(line: PosCartLine) {
  const weight = cartWeight(line)
  if (!weight) return line.itemName
  const escapedWeight = weight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return line.itemName.replace(new RegExp(`\\s*(?:[-–—|/]\\s*)?${escapedWeight}\\s*$`, 'i'), '').trim() || line.itemName
}

export function PosPayments({ methods, payments, total, currency, onChange }: { methods: PosPaymentMethod[]; payments: PosPaymentLine[]; total: number; currency: string; onChange: (payments: PosPaymentLine[]) => void }) {
  const { t } = useTranslation()
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const change = Math.max(0, paid - total)
  return <section className="pos-payment card"><div className="pos-section-heading"><div><h2>{t('pos.sales.payment')}</h2><span>{t('pos.sales.mixedPayment')}</span></div><strong className="pos-payment-total">{money(total, currency)}</strong></div><div className="pos-payment-lines">{methods.map((method) => { const current = payments.find((payment) => payment.modeOfPayment === method.mode_of_payment)?.amount ?? 0; return <Field key={method.mode_of_payment} label={method.mode_of_payment}><Input type="number" min="0" step="0.01" value={current} onChange={(event) => onChange(methods.map((candidate) => candidate.mode_of_payment === method.mode_of_payment ? { modeOfPayment: method.mode_of_payment, amount: Number(event.target.value) } : { modeOfPayment: candidate.mode_of_payment, amount: payments.find((payment) => payment.modeOfPayment === candidate.mode_of_payment)?.amount ?? 0 }))} /></Field> })}</div><div className="pos-payment-summary"><span>{t('pos.sales.received')} <b>{money(paid, currency)}</b></span><span>{t('pos.sales.change')} <b>{money(change, currency)}</b></span></div></section>
}

export function PosSaleHistory({ sales, loading, error, currency, onRefresh, onReturn }: { sales: PosSaleSummary[]; loading: boolean; error?: string; currency: string; onRefresh: () => void; onReturn: (name: string) => void }) {
  const { t } = useTranslation()
  return <section className="pos-history card"><div className="pos-section-heading"><div><h2>{t('pos.sales.shiftSales')}</h2><span>{t('pos.sales.confirmedInvoices', { count: sales.length })}</span></div><Button variant="secondary" size="compact" onClick={onRefresh}>{t('common.refresh')}</Button></div>{error && <Notice>{error}</Notice>}{loading ? <Spinner /> : <div className="pos-history-list">{sales.map((invoice) => <div key={invoice.name}><strong>{invoice.name}</strong><span>{invoice.customer || t('pos.sales.genericCustomer')}</span><b>{money(Number(invoice.grand_total ?? 0), currency)}</b><Button variant="secondary" size="compact" onClick={() => onReturn(invoice.name)}>{t('pos.sales.return')}</Button></div>)}{!sales.length && <p className="muted">{t('pos.sales.noConfirmedSales')}</p>}</div>}</section>
}

export function PosCart({ lines, taxRows, currency, canEditRate, onChange, onRemove, onEditPrice }: { lines: PosCartLine[]; taxRows: PosTaxRow[]; currency: string; canEditRate: boolean; onChange: (index: number, patch: Partial<PosCartLine>) => void; onRemove: (index: number) => void; onEditPrice: (index: number) => void }) {
  const { t } = useTranslation()
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const totals = cartTotals(lines, taxRows)
  const copyCart = async () => {
    const text = lines.map((line) => {
      const uom = line.uom || line.stockUom || 'UOM'
      const weight = cartWeight(line) || '—'
      const presentation = weight === '—' ? uom : `${uom} · ${weight}`
      return `${line.qty}x ${cartItemName(line)}, ${presentation}, ${money(line.rate, currency)}`
    }).join('\n')
    try { await navigator.clipboard.writeText(text); setCopyStatus('copied'); window.setTimeout(() => setCopyStatus('idle'), 1800) } catch { setCopyStatus('error'); window.setTimeout(() => setCopyStatus('idle'), 2500) }
  }
  return <section className="pos-cart card"><div className="pos-section-heading"><div><h2>{t('pos.sales.currentSale')}</h2><span>{t('pos.sales.linesTotal', { count: lines.length, total: money(totals.total, currency) })}</span></div><div className="pos-cart-heading-actions"><IconButton type="button" className="pos-cart-copy" label="Copiar carrito" title={copyStatus === 'error' ? t('connection.clipboardError') : copyStatus === 'copied' ? t('connection.shareCopied') : 'Copiar carrito'} onClick={copyCart} disabled={!lines.length} icon={copyStatus === 'copied' ? '✓' : '⧉'} /><span className="pos-hint">{t('pos.sales.activeShift')}</span></div></div>{!lines.length ? <div className="pos-empty">{t('pos.sales.addProducts')}</div> : <div className="pos-cart-lines">{lines.map((line, index) => { const uom = line.uom || line.stockUom || 'UOM'; const stockUom = line.stockUom || uom; const factor = line.conversionFactor || 1; const weight = cartWeight(line); const displayName = cartItemName(line); return <div className="pos-cart-line" key={line.itemCode + '-' + line.uom}><div className="pos-cart-line-info"><strong>{displayName}</strong><div className="pos-cart-uom"><span className="pos-cart-uom-badge">{t('pos.sales.uomLabel')} {uom}</span>{weight && <span className="pos-cart-weight-badge">{t('catalog.table.weight')}: {weight}</span>}{factor !== 1 && <span className="pos-cart-uom-conversion">1 {uom} = {formatFactor(factor)} {stockUom}</span>}</div><small>{line.itemCode} · {money(line.rate, currency)} {t('pos.sales.each')}{line.rateOverride ? ` · ${t('pos.sales.listPrice')} ${money(line.priceListRate ?? line.rate, currency)}` : ''}</small>{line.rateOverride && <span className="pos-custom-rate-badge">{t('pos.sales.customPrice')}</span>}{canEditRate && <button type="button" className="pos-edit-price" onClick={() => onEditPrice(index)} aria-label={t('pos.sales.editPriceFor', { name: displayName })}>{t('pos.sales.editPrice')}</button>}</div><Input aria-label={t('pos.sales.quantityFor', { name: displayName, uom })} type="number" min="0.001" step="any" value={line.qty} onChange={(event) => onChange(index, { qty: Number(event.target.value) })} /><strong>{money(lineTotal(line), currency)}</strong><button type="button" className="pos-remove" onClick={() => onRemove(index)} aria-label={t('pos.sales.remove', { name: displayName })} title={t('pos.sales.remove', { name: displayName })}>×</button></div> })}</div>}<div className="pos-totals"><span>{t('pos.sales.subtotal')} <b>{money(totals.subtotal, currency)}</b></span><span>{t('pos.sales.discount')} <b>-{money(totals.discount, currency)}</b></span>{taxRows.length > 0 ? <div className="pos-tax-breakdown" aria-label={t('pos.sales.taxBreakdown')}><span className="pos-tax-title">{t('pos.sales.taxes')}</span>{totals.taxes.map((tax, index) => <span key={(tax.account_head || tax.description || 'tax') + '-' + index}><span>{tax.description || tax.account_head || `${t('pos.sales.tax')} ${index + 1}`}{tax.rate ? ` (${tax.rate}%)` : ''}</span><b>{money(tax.amount, currency)}</b></span>)}<span className="pos-tax-total"><span>{t('pos.sales.totalTaxes')}</span><b>{money(totals.totalTaxes, currency)}</b></span></div> : <span className="pos-tax-empty">{t('pos.sales.noTaxes')}</span>}<span className="pos-total">{t('pos.sales.provisionalTotal')} <b>{money(totals.total, currency)}</b></span></div></section>
}
