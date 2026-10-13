import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Notice, Spinner } from './ui'
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
  onSave: (values: UomEditorValues) => void
  onCancel: () => void
}

function normalizeConversions(conversions: ItemUom[], stockUom: string) {
  const seen = new Set<string>()
  return conversions.filter((row) => {
    const uom = row.uom.trim()
    if (!uom || uom === stockUom || seen.has(uom)) return false
    seen.add(uom)
    return Number(row.conversion_factor) > 0
  })
}

export function UomEditor({ itemName, itemLabel, values, uomOptions, busy, error, onSave, onCancel }: UomEditorProps) {
  const [stockUom, setStockUom] = useState(values.stockUom)
  const [salesUom, setSalesUom] = useState(values.salesUom)
  const [purchaseUom, setPurchaseUom] = useState(values.purchaseUom)
  const [conversions, setConversions] = useState(values.conversions)
  const [formError, setFormError] = useState('')
  const options = useMemo(() => Array.from(new Set([stockUom, salesUom, purchaseUom, ...uomOptions].filter(Boolean))).sort(), [purchaseUom, salesUom, stockUom, uomOptions])

  useEffect(() => {
    setStockUom(values.stockUom); setSalesUom(values.salesUom); setPurchaseUom(values.purchaseUom); setConversions(values.conversions)
  }, [values])

  function updateConversion(index: number, field: keyof ItemUom, value: string) {
    setConversions((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: field === 'conversion_factor' ? Number(value) : value } : row))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault(); setFormError('')
    if (!stockUom.trim()) { setFormError('La UOM de stock es obligatoria.'); return }
    const normalized = normalizeConversions(conversions, stockUom.trim())
    if (normalized.length !== conversions.filter((row) => row.uom.trim() || row.conversion_factor).length) { setFormError('Cada conversión debe tener una UOM distinta de stock y un factor mayor que cero.'); return }
    onSave({ stockUom: stockUom.trim(), salesUom: salesUom.trim(), purchaseUom: purchaseUom.trim(), conversions: normalized })
  }

  return <div className="card p-5"><div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-bold">Conversiones UOM</h2><p className="muted">{itemLabel || itemName} · {itemName}</p></div><Button type="button" variant="secondary" onClick={onCancel}>Cerrar</Button></div>{(error || formError) && <div className="mb-4"><Notice>{error || formError}</Notice></div>}<form className="space-y-6" onSubmit={submit}><div className="rounded-lg border border-blue-100 bg-blue-50 p-4"><p className="text-sm font-semibold text-blue-900">UOM base del producto</p><p className="mt-1 text-xs text-blue-700">Todos los factores se expresan contra la UOM de stock. Por ejemplo, 1 Bulto = 20 Kg.</p><div className="mt-4 grid gap-4 sm:grid-cols-3"><Field label="UOM de stock *"><Input list="uom-options" value={stockUom} onChange={(event) => setStockUom(event.target.value)} placeholder="Ej. Kg" required /></Field><Field label="UOM predeterminada de venta"><Input list="uom-options" value={salesUom} onChange={(event) => setSalesUom(event.target.value)} placeholder="Opcional" /></Field><Field label="UOM predeterminada de compra"><Input list="uom-options" value={purchaseUom} onChange={(event) => setPurchaseUom(event.target.value)} placeholder="Opcional" /></Field></div></div><div><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Presentaciones y conversiones</h3><p className="muted">Agrega las UOM alternativas que se pueden usar en el producto.</p></div><Button type="button" variant="secondary" onClick={() => setConversions((current) => [...current, { uom: '', conversion_factor: 1 }])}>Agregar UOM</Button></div>{conversions.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Este producto solo usa su UOM de stock.</div> : <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">UOM alternativa</th><th className="px-4 py-3">Factor contra stock</th><th className="px-4 py-3">Equivalencia</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{conversions.map((row, index) => <tr key={`${row.uom}-${index}`}><td className="px-4 py-3"><Input list="uom-options" value={row.uom} onChange={(event) => updateConversion(index, 'uom', event.target.value)} placeholder="Ej. Bulto" /></td><td className="px-4 py-3"><Input type="number" min="0.000001" step="any" value={row.conversion_factor} onChange={(event) => updateConversion(index, 'conversion_factor', event.target.value)} /></td><td className="px-4 py-3 text-slate-600">1 {row.uom || 'UOM'} = {row.conversion_factor || 0} {stockUom || 'stock'}</td><td className="px-4 py-3 text-right"><Button type="button" variant="danger" onClick={() => setConversions((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Quitar</Button></td></tr>)}</tbody></table></div>}</div><datalist id="uom-options">{options.map((option) => <option key={option} value={option} />)}</datalist><div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5"><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? <><Spinner /> <span className="ml-2">Guardando</span></> : 'Guardar UOM'}</Button></div></form></div>
}
