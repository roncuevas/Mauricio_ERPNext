import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from './ui'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import { formatMoney } from '../lib/pos'
import type { PosCartLine } from '../lib/types'

export function PosPriceSheet({ line, currency, canEdit, open, onClose, onApply }: { line: PosCartLine | null; currency: string; canEdit: boolean; open: boolean; onClose: () => void; onApply: (rate: number) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const original = line?.priceListRate ?? line?.rate ?? 0
  const rate = Number(value)
  const difference = original > 0 && Number.isFinite(rate) ? ((rate - original) / original) * 100 : 0

  useEffect(() => {
    if (open && line) setValue(String(line.rate))
  }, [line, open])

  if (!line) return null
  return <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }}><SheetContent side="right" className="pos-price-sheet"><SheetHeader><SheetTitle>{t('pos.customPrice.title')}</SheetTitle><SheetDescription>{t('pos.customPrice.description', { itemName: line.itemName })}</SheetDescription></SheetHeader><div className="pos-price-sheet-body"><div className="pos-price-reference"><span>{t('pos.customPrice.listPrice')}</span><strong>{formatMoney(original, currency)}</strong></div><label className="field"><span className="field-label">{t('pos.customPrice.salePrice')}</span><Input autoFocus type="number" min="0.01" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} aria-label={t('pos.customPrice.customSalePrice')} disabled={!canEdit} /></label><p className="pos-price-difference" aria-live="polite">{Number.isFinite(rate) && rate > 0 ? t('pos.customPrice.difference', { value: `${difference >= 0 ? '+' : ''}${difference.toFixed(2)}` }) : t('pos.customPrice.positive')}</p></div><div className="pos-price-sheet-actions"><SheetClose asChild><Button type="button" variant="secondary" fullWidth>{t('common.cancel')}</Button></SheetClose><Button type="button" fullWidth onClick={() => onApply(rate)} disabled={!canEdit || !Number.isFinite(rate) || rate <= 0}>{t('pos.customPrice.apply')}</Button></div></SheetContent></Sheet>
}
