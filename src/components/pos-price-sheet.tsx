import { useEffect, useState } from 'react'
import { Button, Input } from './ui'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import { formatMoney } from '../lib/pos'
import type { PosCartLine } from '../lib/types'

export function PosPriceSheet({ line, currency, canEdit, open, onClose, onApply }: { line: PosCartLine | null; currency: string; canEdit: boolean; open: boolean; onClose: () => void; onApply: (rate: number) => void }) {
  const [value, setValue] = useState('')
  const original = line?.priceListRate ?? line?.rate ?? 0
  const rate = Number(value)
  const difference = original > 0 && Number.isFinite(rate) ? ((rate - original) / original) * 100 : 0

  useEffect(() => {
    if (open && line) setValue(String(line.rate))
  }, [line, open])

  if (!line) return null
  return <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }}><SheetContent side="right" className="pos-price-sheet"><SheetHeader><SheetTitle>Precio personalizado</SheetTitle><SheetDescription>{line.itemName}. El precio original permanece como referencia de la lista.</SheetDescription></SheetHeader><div className="pos-price-sheet-body"><div className="pos-price-reference"><span>Precio de lista</span><strong>{formatMoney(original, currency)}</strong></div><label className="field"><span className="field-label">Precio de venta</span><Input autoFocus type="number" min="0.01" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} aria-label="Precio de venta personalizado" disabled={!canEdit} /></label><p className="pos-price-difference" aria-live="polite">{Number.isFinite(rate) && rate > 0 ? `${difference >= 0 ? '+' : ''}${difference.toFixed(2)}% frente al precio de lista` : 'Captura un precio mayor que cero.'}</p></div><div className="pos-price-sheet-actions"><SheetClose asChild><Button type="button" variant="secondary" fullWidth>Cancelar</Button></SheetClose><Button type="button" fullWidth onClick={() => onApply(rate)} disabled={!canEdit || !Number.isFinite(rate) || rate <= 0}>Aplicar precio</Button></div></SheetContent></Sheet>
}
