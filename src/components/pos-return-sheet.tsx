import { useTranslation } from 'react-i18next'
import { Button, Field, Input } from './ui'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import { formatMoney } from '../lib/pos'
import type { PosReturnDocument } from '../lib/types'

export function PosReturnSheet({ invoice, remaining, quantities, open, busy, error, currency, onChange, onClose, onSubmit }: { invoice: PosReturnDocument | null; remaining: number[]; quantities: number[]; open: boolean; busy: boolean; error?: string; currency: string; onChange: (index: number, quantity: number) => void; onClose: () => void; onSubmit: () => void }) {
  const { t } = useTranslation()
  if (!invoice) return null
  return <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }}><SheetContent side="right" className="pos-return-sheet"><SheetHeader><SheetTitle>{t('posExtra.partialReturn')} · {invoice.name}</SheetTitle><SheetDescription>{invoice.customer}</SheetDescription></SheetHeader><div className="pos-return-lines">{invoice.items.map((line, index) => <div className="pos-return-line" key={line.name || `${line.item_code}-${line.uom}-${index}`}><div><strong>{line.item_name || line.item_code}</strong><small>{line.item_code} · {line.uom || 'UOM'} · {formatMoney(line.rate, currency)}</small><small>{t('posExtra.returnRemaining', { qty: remaining[index] })}</small></div><Field label={t('posExtra.quantityToReturn')}><Input type="number" min="0" max={remaining[index]} step="any" value={quantities[index] ?? 0} onChange={(event) => onChange(index, Number(event.target.value))} disabled={!remaining[index] || busy} /></Field></div>)}</div>{error && <p className="notice notice-error" role="alert">{error}</p>}<Button type="button" fullWidth onClick={onSubmit} disabled={busy || !quantities.some((quantity) => quantity > 0)}>{busy ? t('posExtra.returning') : t('posExtra.confirmReturn')}</Button></SheetContent></Sheet>
}
