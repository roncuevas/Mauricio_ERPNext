import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck } from 'lucide-react'
import { Button, Field, Input, Spinner } from './ui'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { formatMoney } from '../lib/pos'
import { shortcutLabel } from '../lib/shortcuts'

export type CompletedSale = { name: string; customer: string; customerId: string; total?: number; paid?: number; change?: number; currency: string }

/** Post-sale summary, like ERPNext's order summary: receipt, email and a new order. */
export function PosSaleComplete({ sale, onPrint, onEmail, loadEmail, onNewOrder }: { sale: CompletedSale | null; onPrint: (name: string) => void; onEmail: (name: string, recipient: string) => Promise<void>; loadEmail: () => Promise<string>; onNewOrder: () => void }) {
  const { t } = useTranslation()
  const [emailOpen, setEmailOpen] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  function reset() { setEmailOpen(false); setRecipient(''); setSending(false); setStatus(null) }
  function close() { reset(); onNewOrder() }
  async function openEmail() {
    setEmailOpen(true); setStatus(null)
    if (!recipient) setRecipient(await loadEmail().catch(() => ''))
  }
  async function send(event: FormEvent) {
    event.preventDefault()
    if (!sale || !recipient.trim()) return
    setSending(true); setStatus(null)
    try { await onEmail(sale.name, recipient.trim()); setStatus({ tone: 'ok', text: t('pos.complete.emailSent', { email: recipient.trim() }) }); setEmailOpen(false) } catch (error) { setStatus({ tone: 'error', text: error instanceof Error ? error.message : t('pos.complete.emailError') }) } finally { setSending(false) }
  }
  // Ctrl/⌘+P prints the receipt (ERPNext shortcut) instead of the browser page.
  useEffect(() => {
    if (!sale) return
    const onKeyDown = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); onPrint(sale.name) } }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onPrint, sale])
  const money = (value: number) => formatMoney(value, sale?.currency)
  return <Dialog open={Boolean(sale)} onOpenChange={(open) => { if (!open) close() }}>
    <DialogContent className="pos-complete">
      <DialogHeader>
        <CircleCheck className="pos-complete-icon" aria-hidden="true" />
        <DialogTitle className="pos-complete-title">{t('pos.complete.title')}</DialogTitle>
        <DialogDescription>{sale?.name} · {sale?.customer}</DialogDescription>
      </DialogHeader>
      {sale?.total !== undefined && <dl className="pos-complete-figures">
        <div><dt>{t('pos.complete.total')}</dt><dd>{money(sale.total)}</dd></div>
        <div><dt>{t('pos.sales.received')}</dt><dd>{money(sale.paid ?? sale.total)}</dd></div>
        <div className="pos-complete-change"><dt>{t('pos.sales.change')}</dt><dd>{money(sale.change ?? 0)}</dd></div>
      </dl>}
      {emailOpen && <form className="pos-complete-email" onSubmit={send}><Field label={t('pos.complete.emailLabel')}><Input type="email" required autoFocus value={recipient} onChange={(event) => setRecipient(event.target.value)} /></Field><Button type="submit" variant="secondary" disabled={sending}>{sending ? <><Spinner /> {t('pos.complete.sending')}</> : t('pos.complete.send')}</Button></form>}
      {status && <p className="pos-complete-status" data-tone={status.tone} role="status">{status.text}</p>}
      <DialogFooter className="pos-complete-actions">
        <Button type="button" variant="secondary" onClick={() => sale && onPrint(sale.name)}>{t('pos.complete.print')}<kbd className="pos-kbd">{shortcutLabel('P')}</kbd></Button>
        {!emailOpen && <Button type="button" variant="secondary" onClick={() => void openEmail()}>{t('pos.complete.email')}</Button>}
        <Button type="button" autoFocus onClick={close}>{t('pos.complete.newOrder')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
