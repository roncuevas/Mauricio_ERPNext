import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Field, Input, Notice, Select, Spinner } from './ui'
import type { ErpNextClient } from '../lib/erpnext'
import type { DocTypeField } from '../lib/types'

type EditorValue = string | number | boolean
type EditorValues = Record<string, EditorValue>

type MetadataDocEditorProps = {
  client: ErpNextClient
  doctype: string
  name: string | null
  fields: DocTypeField[]
  initialValues?: Record<string, unknown>
  onClose: () => void
  onSaved?: (saved: Record<string, unknown>) => void | Promise<void>
}

const layoutFields = new Set(['Section Break', 'Column Break', 'Tab Break'])
const structuredFields = new Set(['Table', 'Table MultiSelect', 'JSON'])

function isNumeric(fieldtype?: string) { return ['Int', 'Float', 'Currency', 'Percent'].includes(fieldtype ?? '') }
function isLongText(fieldtype?: string) { return ['Small Text', 'Text', 'Long Text', 'Code', 'HTML'].includes(fieldtype ?? '') }
function isLocked(field: DocTypeField) { return Boolean(field.read_only || field.fieldname === 'name') }

function toEditorValue(field: DocTypeField, value: unknown): EditorValue {
  if (field.fieldtype === 'Check') return Boolean(value)
  if (structuredFields.has(field.fieldtype ?? '')) return typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2)
  if (value === null || value === undefined) return ''
  return isNumeric(field.fieldtype) ? Number(value) : String(value)
}

function parseValue(field: DocTypeField, value: EditorValue): unknown {
  if (structuredFields.has(field.fieldtype ?? '')) {
    if (!String(value).trim()) return field.fieldtype === 'JSON' ? {} : []
    try { return JSON.parse(String(value)) } catch { throw new Error(`El campo ${field.label ?? field.fieldname} debe contener JSON válido.`) }
  }
  if (field.fieldtype === 'Check') return value ? 1 : 0
  if (isNumeric(field.fieldtype)) return value === '' ? null : Number(value)
  return value
}

function MetadataField({ field, value, disabled, onChange }: { field: DocTypeField; value: EditorValue; disabled: boolean; onChange: (value: EditorValue) => void }) {
  const label = `${field.label ?? field.fieldname}${field.reqd && !disabled ? ' *' : ''}`
  if (layoutFields.has(field.fieldtype ?? '')) return field.fieldtype === 'Column Break' ? null : <div className="sm:col-span-2 border-b border-slate-200 pb-2 pt-3 text-sm font-bold text-slate-700">{field.label ?? field.fieldname}</div>
  if (field.fieldtype === 'Check') return <label className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-60' : ''}`}><input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}{field.hidden ? ' (oculto)' : ''}</label>
  if (field.fieldtype === 'Select') return <Field label={label}><Select value={String(value)} disabled={disabled} required={Boolean(field.reqd && !disabled)} onChange={(event) => onChange(event.target.value)}><option value="">Selecciona…</option>{(field.options ?? '').split('\n').filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}</Select></Field>
  if (structuredFields.has(field.fieldtype ?? '') || isLongText(field.fieldtype)) return <label className={`field sm:col-span-2 ${disabled ? 'opacity-60' : ''}`}><span className="field-label">{label}{field.hidden ? ' (oculto)' : ''}</span><textarea className="control min-h-24 py-2 font-mono text-xs" value={String(value)} disabled={disabled} required={Boolean(field.reqd && !disabled)} onChange={(event) => onChange(event.target.value)} />{field.options && <span className="text-xs text-slate-500">{field.options}</span>}</label>
  const inputType = field.fieldtype === 'Date' ? 'date' : field.fieldtype === 'Datetime' ? 'datetime-local' : field.fieldtype === 'Time' ? 'time' : field.fieldtype === 'Check' ? 'checkbox' : field.fieldtype === 'Email' ? 'email' : field.fieldtype === 'Phone' ? 'tel' : isNumeric(field.fieldtype) ? 'number' : 'text'
  return <Field label={`${label}${field.hidden ? ' (oculto)' : ''}`}><Input type={inputType} step={isNumeric(field.fieldtype) ? 'any' : undefined} value={String(value)} disabled={disabled} required={Boolean(field.reqd && !disabled)} onChange={(event) => onChange(isNumeric(field.fieldtype) ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} /></Field>
}

export function MetadataDocEditor({ client, doctype, name, fields, initialValues = {}, onClose, onSaved }: MetadataDocEditorProps) {
  const query = useQuery({ queryKey: ['metadata-editor', doctype, name], queryFn: () => client.getDocument<Record<string, unknown>>(doctype, name!), enabled: Boolean(name) })
  const [form, setForm] = useState<EditorValues>({})
  const [initialized, setInitialized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialized || (name && !query.data)) return
    const source = name ? query.data ?? {} : initialValues
    setForm(Object.fromEntries(fields.filter((field) => field.fieldname).map((field) => [field.fieldname, toEditorValue(field, source[field.fieldname])]))); setInitialized(true)
  }, [fields, initialized, initialValues, name, query.data])

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const data = Object.fromEntries(fields.filter((field) => field.fieldname && !isLocked(field) && !layoutFields.has(field.fieldtype ?? '')).map((field) => [field.fieldname, parseValue(field, form[field.fieldname] ?? '')]))
      const saved = name ? await client.updateDocument<Record<string, unknown>>(doctype, name, data) : await client.createDocument<Record<string, unknown>>(doctype, data)
      await onSaved?.(name ? { ...saved, name } : saved); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el documento.') } finally { setBusy(false) }
  }

  return <div className="card mb-5 p-5"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">{name ? `${doctype}: ${name}` : `Nuevo ${doctype}`}</h2><p className="muted">Formulario generado desde el metadata de ERPNext. Los campos de solo lectura se muestran bloqueados.</p></div><Button variant="secondary" onClick={onClose}>Cerrar</Button></div>{error && <div className="mb-4"><Notice>{error}</Notice></div>}{query.isError && <div className="mb-4"><Notice>{query.error.message}</Notice></div>}{query.isPending && !initialized ? <Spinner /> : <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>{fields.filter((field) => field.fieldname).map((field) => <MetadataField key={field.fieldname} field={field} value={form[field.fieldname] ?? ''} disabled={isLocked(field)} onChange={(value) => setForm({ ...form, [field.fieldname]: value })} />)}<div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? <Spinner /> : 'Guardar documento'}</Button></div></form>}</div>
}
