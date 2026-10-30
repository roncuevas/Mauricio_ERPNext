import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'
import { Button, Checkbox, Field, Input, Notice, Spinner } from './ui'
import { CheckboxIndicator } from './ui/checkbox'
import { rebaseUomConversions } from '../lib/uom-conversions'
import type { ItemUom } from '../lib/types'

export type UomEditorValues = {
  stockUom: string
  salesUom: string
  purchaseUom: string
  conversions: ItemUom[]
}

type UomEditorProps = {
  itemName: string
  itemLabel?: string
  values: UomEditorValues
  uomOptions: string[]
  busy: boolean
  error: string
  onRetryConversions?: () => void
  onSave: (values: UomEditorValues) => void
  onCancel: () => void
}

function normalizeConversions(conversions: ItemUom[], stockUom: string) {
  const seen = new Set<string>()
  return conversions.filter((row) => {
    const uom = row.uom.trim()
    if (!uom || uom === stockUom || seen.has(uom)) return false
    seen.add(uom)
    return Number.isFinite(Number(row.conversion_factor)) && Number(row.conversion_factor) > 0
  })
}

export function UomEditor({ itemName, itemLabel, values, uomOptions, busy, error, onRetryConversions, onSave, onCancel }: UomEditorProps) {
  const { t } = useTranslation()
  const acknowledgementId = useId()
  const dirty = useRef(false)
  const [stockUom, setStockUom] = useState(values.stockUom)
  const [stockUomInput, setStockUomInput] = useState(values.stockUom)
  const [salesUom, setSalesUom] = useState(values.salesUom)
  const [purchaseUom, setPurchaseUom] = useState(values.purchaseUom)
  const [conversions, setConversions] = useState(values.conversions)
  const [formError, setFormError] = useState('')
  const [pendingValues, setPendingValues] = useState<UomEditorValues | null>(null)
  const [confirmBaseChange, setConfirmBaseChange] = useState(false)
  const [acknowledgedBaseChange, setAcknowledgedBaseChange] = useState(false)
  const options = useMemo(() => Array.from(new Set([stockUom, salesUom, purchaseUom, ...uomOptions].filter(Boolean))).sort(), [purchaseUom, salesUom, stockUom, uomOptions])

  useEffect(() => {
    if (dirty.current) return
    setStockUom(values.stockUom)
    setStockUomInput(values.stockUom)
    setSalesUom(values.salesUom)
    setPurchaseUom(values.purchaseUom)
    setConversions(values.conversions)
  }, [values])

  function updateConversion(index: number, field: keyof ItemUom, value: string) {
    dirty.current = true
    setConversions((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: field === 'conversion_factor' ? Number(value) : value } : row))
  }

  function commitStockUomChange() {
    setFormError('')
    const nextStockUom = stockUomInput.trim()
    if (!nextStockUom || nextStockUom === stockUom) return
    const nextConversions = rebaseUomConversions(stockUom, nextStockUom, conversions)
    if (!nextConversions) {
      setFormError(t('uomEditor.stockUomNeedsConversion', { uom: nextStockUom }))
      setStockUomInput(stockUom)
      return
    }
    dirty.current = true
    setStockUom(nextStockUom)
    setStockUomInput(nextStockUom)
    setConversions(nextConversions)
  }

  function saveValues(next: UomEditorValues) {
    if (next.stockUom !== values.stockUom) {
      setPendingValues(next)
      setAcknowledgedBaseChange(false)
      setConfirmBaseChange(true)
      return
    }
    onSave(next)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setFormError('')
    if (!stockUom.trim()) { setFormError(t('uomEditor.requiredStock')); return }
    const normalized = normalizeConversions(conversions, stockUom.trim())
    if (normalized.length !== conversions.filter((row) => row.uom.trim() || row.conversion_factor).length) { setFormError(t('uomEditor.invalidConversion')); return }
    saveValues({ stockUom: stockUom.trim(), salesUom: salesUom.trim(), purchaseUom: purchaseUom.trim(), conversions: normalized })
  }

  return <div className="card p-5">
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="text-lg font-bold">{t('uomEditor.title')}</h2><p className="muted">{itemLabel || itemName} · {itemName}</p></div>
      <Button type="button" variant="secondary" onClick={onCancel}>{t('uomEditor.close')}</Button>
    </div>
    {(error || formError) && <div className="mb-4"><Notice tone={onRetryConversions ? 'warning' : 'error'}><div className="space-y-3"><p>{error || formError}</p>{onRetryConversions && <Button type="button" variant="danger" disabled={busy} onClick={onRetryConversions}>{t('editorsPage.retryUomConversions')}</Button>}</div></Notice></div>}
    <form className="space-y-6" onSubmit={submit}>
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm font-semibold text-blue-900">{t('uomEditor.baseTitle')}</p>
        <p className="mt-1 text-xs text-blue-700">{t('uomEditor.baseDescription')}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label={t('uomEditor.stockUom')}><Input list="uom-options" value={stockUomInput} disabled={Boolean(onRetryConversions)} onChange={(event) => { dirty.current = true; setStockUomInput(event.target.value) }} onBlur={commitStockUomChange} placeholder={t('uomEditor.stockPlaceholder')} required /></Field>
          <Field label={t('uomEditor.salesUom')}><Input list="uom-options" value={salesUom} disabled={Boolean(onRetryConversions)} onChange={(event) => { dirty.current = true; setSalesUom(event.target.value) }} placeholder={t('uomEditor.optional')} /></Field>
          <Field label={t('uomEditor.purchaseUom')}><Input list="uom-options" value={purchaseUom} disabled={Boolean(onRetryConversions)} onChange={(event) => { dirty.current = true; setPurchaseUom(event.target.value) }} placeholder={t('uomEditor.optional')} /></Field>
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h3 className="font-semibold text-slate-900">{t('uomEditor.presentationsTitle')}</h3><p className="muted">{t('uomEditor.presentationsDescription')}</p></div>
          <Button type="button" variant="secondary" disabled={Boolean(onRetryConversions)} onClick={() => { dirty.current = true; setConversions((current) => [...current, { uom: '', conversion_factor: 1 }]) }}>{t('uomEditor.addUom')}</Button>
        </div>
        {conversions.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{t('uomEditor.onlyStock')}</div> : <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">{t('uomEditor.alternativeUom')}</th><th className="px-4 py-3">{t('uomEditor.factor')}</th><th className="px-4 py-3">{t('uomEditor.equivalence')}</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-slate-100">{conversions.map((row, index) => <tr key={`${row.uom}-${index}`}>
              <td className="px-4 py-3"><Input list="uom-options" value={row.uom} disabled={Boolean(onRetryConversions)} onChange={(event) => updateConversion(index, 'uom', event.target.value)} placeholder={t('uomEditor.uomPlaceholder')} /></td>
              <td className="px-4 py-3"><Input type="number" min="0.000001" step="any" value={row.conversion_factor} disabled={Boolean(onRetryConversions)} onChange={(event) => updateConversion(index, 'conversion_factor', event.target.value)} /></td>
              <td className="px-4 py-3 text-slate-600">1 {row.uom || t('uomEditor.uomFallback')} = {row.conversion_factor || 0} {stockUom || t('uomEditor.stockFallback')}</td>
              <td className="px-4 py-3 text-right"><Button type="button" variant="danger" disabled={Boolean(onRetryConversions)} onClick={() => { dirty.current = true; setConversions((current) => current.filter((_, rowIndex) => rowIndex !== index)) }}>{t('uomEditor.remove')}</Button></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
      <datalist id="uom-options">{options.map((option) => <option key={option} value={option} />)}</datalist>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5">
        <Button type="button" variant="secondary" onClick={onCancel}>{t('uomEditor.cancel')}</Button>
        <Button type="submit" disabled={busy || Boolean(onRetryConversions)}>{busy ? <><Spinner /> <span className="ml-2">{t('uomEditor.saving')}</span></> : t('uomEditor.save')}</Button>
      </div>
    </form>
    <AlertDialog open={confirmBaseChange} onOpenChange={(open) => { setConfirmBaseChange(open); if (!open) { setPendingValues(null); setAcknowledgedBaseChange(false) } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('uomEditor.stockUomChangeTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('uomEditor.stockUomChangeDescription', { item: itemLabel || itemName, from: values.stockUom, to: pendingValues?.stockUom ?? stockUom })}</AlertDialogDescription>
        </AlertDialogHeader>
        <Notice tone="warning"><div className="space-y-1"><p>{t('uomEditor.stockUomChangeWarning')}</p><p>{t('uomEditor.stockUomChangeHistorical')}</p><p>{t('uomEditor.stockUomChangePrices')}</p></div></Notice>
        <p className="text-sm font-semibold">{t('uomEditor.reviewConversions')}</p>
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-slate-50 p-3 text-sm">{(pendingValues?.conversions ?? []).map((row) => <li key={row.uom}>1 {row.uom} = {row.conversion_factor} {pendingValues?.stockUom}</li>)}</ul>
        <label htmlFor={acknowledgementId} className="flex cursor-pointer items-start gap-3 rounded-md border border-amber-200 p-3 text-sm">
          <Checkbox id={acknowledgementId} checked={acknowledgedBaseChange} onCheckedChange={(checked) => setAcknowledgedBaseChange(checked === true)}><CheckboxIndicator /></Checkbox>
          <span>{t('uomEditor.stockUomAcknowledgement')}</span>
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel asChild><Button type="button" variant="secondary">{t('uomEditor.cancel')}</Button></AlertDialogCancel>
          <AlertDialogAction asChild><Button type="button" variant="danger" disabled={busy || !acknowledgedBaseChange} onClick={() => { if (!pendingValues || !acknowledgedBaseChange) return; onSave(pendingValues); setConfirmBaseChange(false); setPendingValues(null); setAcknowledgedBaseChange(false) }}>{t('uomEditor.confirmStockUomChange')}</Button></AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
