import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog'
import { Button, Field, Input } from './ui'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from './ui/sheet'
import type { PosClosingSummary } from '../lib/pos'
import type { PosPaymentLine, PosPaymentMethod } from '../lib/types'

export function PosCustomerPicker({ enabled, value, search, customers, onSearch, onSelect, onCreate }: { enabled: boolean; value: string; search: string; customers: Array<{ name: string; customer_name?: string }>; onSearch: (value: string) => void; onSelect: (name: string) => void; onCreate?: () => void }) {
  const { t } = useTranslation()
  const matches = customers.filter((item) => `${item.name} ${item.customer_name ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0, 8)
  return <Popover open={Boolean(enabled && search)}><Field label={t('pos.customer.label')}><PopoverAnchor asChild><Input data-pos-customer-search value={search || value} onChange={(event) => onSearch(event.target.value)} placeholder={t('pos.customer.placeholder')} disabled={!enabled} aria-label={t('pos.customer.search')} /></PopoverAnchor></Field><PopoverContent className="pos-customer-results w-[var(--radix-popover-trigger-width)]" align="start"><Command><CommandInput placeholder={t('pos.customer.search')} value={search} onValueChange={onSearch} aria-label={t('pos.customer.filter')} /><CommandList><CommandEmpty>{t('pos.customer.empty')}</CommandEmpty><CommandGroup>{matches.map((item) => <CommandItem key={item.name} value={`${item.name} ${item.customer_name ?? ''}`} onSelect={() => onSelect(item.name)}>{item.customer_name || item.name}</CommandItem>)}</CommandGroup></CommandList></Command>{onCreate && <Button type="button" variant="secondary" size="compact" fullWidth onClick={onCreate}>{t('posExtra.createCustomer')}</Button>}</PopoverContent></Popover>
}

export function PosCustomerCreateSheet({ open, busy, error, onOpenChange, onCreate }: { open: boolean; busy: boolean; error?: string; onOpenChange: (open: boolean) => void; onCreate: (name: string, mobile: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || busy) return
    await onCreate(name.trim(), mobile.trim())
  }
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right"><SheetHeader><SheetTitle>{t('posExtra.createCustomer')}</SheetTitle><SheetDescription>{t('pos.customer.placeholder')}</SheetDescription></SheetHeader><form className="grid gap-4 p-4" onSubmit={submit}><Field label={t('posExtra.customerName')}><Input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={t('posExtra.mobileOptional')}><Input type="tel" autoComplete="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} /></Field>{error && <p role="alert" className="notice notice-error">{error}</p>}<Button type="submit" disabled={busy || !name.trim()}>{busy ? t('posExtra.saving') : t('posExtra.createCustomer')}</Button></form></SheetContent></Sheet>
}

type PosAuxiliaryActionsProps = {
  showHistory: boolean
  onToggleHistory: () => void
  onOpenDrafts: () => void
  onOpenLocalCarts: () => void
  onOpenQuotations?: () => void
  historyDisabled?: boolean
  draftsDisabled?: boolean
  localCartsDisabled?: boolean
  onShowProducts?: () => void
  onShowCart?: () => void
  onToggleContext?: () => void
  contextOpen?: boolean
}

export function PosAuxiliaryActions({ showHistory, onToggleHistory, onOpenDrafts, onOpenLocalCarts, onOpenQuotations, historyDisabled, draftsDisabled, localCartsDisabled, onShowProducts, onShowCart, onToggleContext, contextOpen }: PosAuxiliaryActionsProps) {
  const { t } = useTranslation()
  return <>
    {onShowProducts && onShowCart && <>
      <DropdownMenuItem onSelect={onShowProducts}>{t('pos.mobile.showProducts')}</DropdownMenuItem>
      <DropdownMenuItem onSelect={onShowCart}>{t('pos.mobile.showCart')}</DropdownMenuItem>
      <DropdownMenuSeparator />
    </>}
    <DropdownMenuItem disabled={historyDisabled} onSelect={onToggleHistory}>{showHistory ? t('posPage.hideHistory') : t('posPage.history')}</DropdownMenuItem>
    <DropdownMenuItem className="pos-more-action" disabled={draftsDisabled} onSelect={onOpenDrafts}><span>{t('pos.drafts.title')}</span><small>{t('pos.drafts.scope')}</small></DropdownMenuItem>
    <DropdownMenuItem className="pos-more-action" disabled={localCartsDisabled} onSelect={onOpenLocalCarts}><span>{t('pos.localCarts.title')}</span><small>{t('pos.localCarts.scope')}</small></DropdownMenuItem>
    {onOpenQuotations && <DropdownMenuItem onSelect={onOpenQuotations}>{t('posPage.quotes')}</DropdownMenuItem>}
    {onToggleContext && <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onToggleContext}>{contextOpen ? t('pos.mobile.hideContext') : t('pos.mobile.showContext')}</DropdownMenuItem>
    </>}
  </>
}

export function PosMobileTabs({ value, count, fixed, showHistory, onChange, onToggleHistory, onOpenDrafts, onOpenQuotations, onOpenLocalCarts, draftsDisabled, localCartsDisabled }: { value: 'products' | 'cart'; count: number; fixed: boolean; showHistory: boolean; onChange: (value: 'products' | 'cart') => void; onToggleHistory: () => void; onOpenDrafts: () => void; onOpenQuotations?: () => void; onOpenLocalCarts: () => void; draftsDisabled: boolean; localCartsDisabled: boolean }) {
  const { t } = useTranslation()
  const [contextOpen, setContextOpen] = useState(false)
  return <div className={`pos-mobile-tabs${fixed ? ' is-fixed' : ''}`} data-context-open={contextOpen || undefined}><Tabs value={value} onValueChange={(next) => onChange(next as 'products' | 'cart')}><TabsList aria-label={t('pos.mobile.view')}><TabsTrigger value="products">{t('common.products')}</TabsTrigger><TabsTrigger value="cart">{t('pos.mobile.cart')}{count > 0 && <span>{count}</span>}</TabsTrigger></TabsList></Tabs><DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" size="compact" aria-label={t('pos.mobile.moreActions')}>{t('pos.mobile.moreActions')}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><PosAuxiliaryActions showHistory={showHistory} onToggleHistory={onToggleHistory} onOpenDrafts={onOpenDrafts} onOpenLocalCarts={onOpenLocalCarts} onOpenQuotations={onOpenQuotations} draftsDisabled={draftsDisabled} localCartsDisabled={localCartsDisabled} onShowProducts={() => onChange('products')} onShowCart={() => onChange('cart')} onToggleContext={() => setContextOpen((current) => !current)} contextOpen={contextOpen} /></DropdownMenuContent></DropdownMenu></div>
}

export function PosClosingPanel({ open, paymentMethods, balances, summary, recovery: _recovery, busy, error, onChange, onSubmit, onClose, onOpenChange }: { open?: boolean; paymentMethods: PosPaymentMethod[]; balances: PosPaymentLine[]; summary?: PosClosingSummary; recovery?: { name: string; status?: string } | null; busy: boolean; error?: string; onChange: (next: PosPaymentLine[]) => void; onSubmit?: () => void; onClose?: () => void; onOpenChange?: (open: boolean) => void }) {
  const { t } = useTranslation()
  const submit = onSubmit ?? onClose ?? (() => undefined)
  const hasDifference = Boolean(summary?.rows.some((row) => Math.abs(row.difference) >= 0.005))
  const invoiceLabel = summary?.invoiceCount === 1 ? t('pos.closing.invoice') : t('pos.closing.invoices')
  return <TooltipProvider><Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="pos-closing-sheet"><SheetHeader className="pos-closing-sheet-header"><div className="pos-closing-title"><span className="pos-sheet-kicker">{t('pos.closing.shiftClose')}</span><div className="pos-closing-title-row"><SheetTitle>{t('pos.closing.countTitle')}</SheetTitle><span className={`pos-closing-status${hasDifference ? ' is-warning' : ''}`}>{hasDifference ? t('pos.closing.reviewDifference') : t('pos.closing.ready')}</span></div><SheetDescription>{t('pos.closing.description')}</SheetDescription></div><SheetClose asChild><Button type="button" variant="secondary" size="compact">{t('pos.closing.closePanel')}</Button></SheetClose></SheetHeader><div className="pos-closing-sheet-body"><div className="pos-closing-help" aria-label={t('pos.closing.countHelp')}><Tooltip><TooltipTrigger asChild><button type="button" className="pos-tooltip">{t('pos.closing.openingBalance')}</button></TooltipTrigger><TooltipContent>{t('pos.closing.openingBalanceHelp')}</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><button type="button" className="pos-tooltip">{t('pos.closing.countTitle')}</button></TooltipTrigger><TooltipContent>{t('pos.closing.countHelpText')}</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><button type="button" className="pos-tooltip">{t('pos.closing.paymentMethods')}</button></TooltipTrigger><TooltipContent>{t('pos.closing.paymentMethodsHelp')}</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><button type="button" className="pos-tooltip">{t('pos.closing.expectedDifference')}</button></TooltipTrigger><TooltipContent>{t('pos.closing.expectedDifferenceHelp')}</TooltipContent></Tooltip></div>{summary && <section aria-label={t('pos.closing.summary')} className="pos-closing-summary" aria-live="polite"><div className="pos-closing-summary-heading"><div><span className="pos-closing-label">{t('pos.closing.serverSummary')}</span><strong>{summary.invoiceCount} {invoiceLabel}</strong></div><div className="pos-closing-total"><span>{t('common.total')}</span><strong>{summary.grandTotal.toFixed(2)}</strong></div></div><div className="pos-closing-summary-rows">{summary.rows.map((row) => <div className="pos-closing-summary-row" key={row.modeOfPayment}><strong>{row.modeOfPayment}</strong><div><span><small>{t('pos.closing.expected')}</small>{row.expectedTotal.toFixed(2)}</span><span><small>{t('pos.closing.captured')}</small>{row.captured.toFixed(2)}</span><span className={Math.abs(row.difference) >= 0.005 ? 'is-warning' : ''}><small>{t('pos.closing.difference')}</small>{row.difference.toFixed(2)}</span></div></div>)}</div><div className="pos-closing-summary-meta"><span>{t('pos.closing.net')} {summary.netTotal.toFixed(2)}</span><span>{t('pos.closing.taxes')} {summary.totalTaxes.toFixed(2)}</span></div></section>}<section aria-label={t('pos.closing.capture')} className="pos-closing-capture"><div className="pos-closing-section-heading"><div><span className="pos-closing-label">{t('pos.closing.countedMoney')}</span><p>{t('pos.closing.countDescription')}</p></div><span className="pos-closing-required">{t('pos.closing.required')}</span></div><div className="pos-closing-fields">{paymentMethods.map((method) => <div className="pos-closing-field" key={method.mode_of_payment}><Field label={method.mode_of_payment}><Input aria-label={t('pos.closing.countFor', { method: method.mode_of_payment })} type="number" min="0" step="0.01" value={balances.find((line) => line.modeOfPayment === method.mode_of_payment)?.amount ?? 0} onChange={(event) => onChange(paymentMethods.map((candidate) => ({ modeOfPayment: candidate.mode_of_payment, amount: candidate.mode_of_payment === method.mode_of_payment ? Number(event.target.value) : balances.find((line) => line.modeOfPayment === candidate.mode_of_payment)?.amount ?? 0 })))} /></Field><span>{t('pos.closing.countedAtClose')}</span></div>)}</div></section>{error && <p role="alert" className="notice notice-warning pos-closing-error">{error}</p>}</div><SheetFooter className="pos-closing-sheet-footer"><p className="muted">{t('pos.closing.differenceConfirmation')}</p><AlertDialog><AlertDialogTrigger asChild><Button variant="danger" fullWidth disabled={busy}>{busy ? t('pos.closing.closing') : t('pos.closing.closeShift')}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('pos.closing.confirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('pos.closing.confirmDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel asChild><Button variant="secondary">{t('common.cancel')}</Button></AlertDialogCancel><AlertDialogAction asChild><Button variant="danger" onClick={submit}>{t('pos.closing.confirmAction')}</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></SheetFooter></SheetContent></Sheet></TooltipProvider>
}
