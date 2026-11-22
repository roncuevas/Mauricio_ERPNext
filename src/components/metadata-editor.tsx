import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button, EntityCombobox, Field, Input, Notice, Spinner } from './ui'
import { Checkbox } from './ui/checkbox'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import type { ErpNextClient } from '../lib/erpnext'
import type { DocTypeField } from '../lib/types'
import { queryKeys } from '../lib/query-keys'
import { listAllDocuments } from '../lib/pagination'

type EditorValue = string | number | boolean
type EditorValues = Record<string, EditorValue>

type MetadataDocEditorProps = {
  client: ErpNextClient
  profileId?: string
  doctype: string
  name: string | null
  fields: DocTypeField[]
  initialValues?: Record<string, unknown>
  basicFieldNames?: string[]
  onClose: () => void
  onSaved?: (saved: Record<string, unknown>) => void | Promise<void>
}

const layoutFields = new Set(['Section Break', 'Column Break', 'Tab Break'])
const structuredFields = new Set(['Table', 'Table MultiSelect', 'JSON'])
const itemGroupFields = ['name', 'parent_item_group', 'is_group', 'lft', 'rgt']

type ItemGroup = { name: string; parent_item_group?: string; is_group?: number | boolean; lft?: number; rgt?: number }

function isNumeric(fieldtype?: string) { return ['Int', 'Float', 'Currency', 'Percent'].includes(fieldtype ?? '') }
function isLongText(fieldtype?: string) { return ['Small Text', 'Text', 'Long Text', 'Code', 'HTML'].includes(fieldtype ?? '') }
function isLocked(field: DocTypeField) { return Boolean(field.read_only || field.fieldname === 'name') }

function toEditorValue(field: DocTypeField, value: unknown): EditorValue {
  if (field.fieldtype === 'Check') return Boolean(value)
  if (structuredFields.has(field.fieldtype ?? '')) return typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2)
  if (value === null || value === undefined) return ''
  return isNumeric(field.fieldtype) ? Number(value) : String(value)
}

function parseValue(field: DocTypeField, value: EditorValue, translate: TFunction): unknown {
  if (structuredFields.has(field.fieldtype ?? '')) {
    if (!String(value).trim()) return field.fieldtype === 'JSON' ? {} : []
    try { return JSON.parse(String(value)) } catch { throw new Error(translate('metadataEditor.invalidJson', { field: field.label ?? field.fieldname })) }
  }
  if (field.fieldtype === 'Check') return value ? 1 : 0
  if (isNumeric(field.fieldtype)) return value === '' ? null : Number(value)
  return value
}

function MetadataField({ field, value, disabled, labelOverride, requiredOverride, itemGroups, itemGroupsLoading, itemGroupsError, onRetryItemGroups, onChange }: { field: DocTypeField; value: EditorValue; disabled: boolean; labelOverride?: string; requiredOverride?: boolean; itemGroups?: Array<{ value: string; label: string; depth: number }>; itemGroupsLoading?: boolean; itemGroupsError?: boolean; onRetryItemGroups?: () => void; onChange: (value: EditorValue) => void }) {
  const { t } = useTranslation()
  const required = Boolean((field.reqd || requiredOverride) && !disabled)
  const label = `${labelOverride ?? field.label ?? field.fieldname}${required ? ' *' : ''}`
  if (layoutFields.has(field.fieldtype ?? '')) return field.fieldtype === 'Column Break' ? null : <div className="sm:col-span-2 border-b border-slate-200 pb-2 pt-3 text-sm font-bold text-slate-700">{field.label ?? field.fieldname}</div>
  if (field.fieldtype === 'Check') return <label className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-60' : ''}`}><Checkbox checked={Boolean(value)} disabled={disabled} onCheckedChange={(checked) => onChange(checked === true)} />{label}{field.hidden ? ` (${t('metadataEditor.hidden')})` : ''}</label>
  if (field.fieldtype === 'Select') return <Field label={label}><Select value={String(value) || undefined} disabled={disabled} required={Boolean(field.reqd && !disabled)} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue placeholder={t('metadataEditor.selectPlaceholder')} /></SelectTrigger><SelectContent align="start">{(field.options ?? '').split('\n').filter(Boolean).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></Field>
  if (field.fieldtype === 'Link' && field.options === 'Item Group') return <Field label={label}><EntityCombobox value={String(value)} onValueChange={onChange} options={itemGroups ?? []} placeholder={t('metadataEditor.selectItemGroup')} searchPlaceholder={t('metadataEditor.searchItemGroup')} emptyMessage={t('metadataEditor.noItemGroups')} ariaLabel={label} disabled={disabled || Boolean(itemGroupsError)} loading={Boolean(itemGroupsLoading)} required={required} />{itemGroupsError && <div className="mt-2 flex items-center gap-2 text-sm text-[var(--color-danger)]"><span>{t('metadataEditor.itemGroupLoadError')}</span><Button type="button" size="compact" variant="secondary" onClick={onRetryItemGroups}>{t('common.retry')}</Button></div>}</Field>
  if (structuredFields.has(field.fieldtype ?? '') || isLongText(field.fieldtype)) return <label className={`field sm:col-span-2 ${disabled ? 'opacity-60' : ''}`}><span className="field-label">{label}{field.hidden ? ` (${t('metadataEditor.hidden')})` : ''}</span><Textarea className="min-h-24 py-2 font-mono text-xs" value={String(value)} disabled={disabled} required={Boolean(field.reqd && !disabled)} onChange={(event) => onChange(event.target.value)} />{field.options && <span className="text-xs text-slate-500">{field.options}</span>}</label>
  const inputType = field.fieldtype === 'Date' ? 'date' : field.fieldtype === 'Datetime' ? 'datetime-local' : field.fieldtype === 'Time' ? 'time' : field.fieldtype === 'Check' ? 'checkbox' : field.fieldtype === 'Email' ? 'email' : field.fieldtype === 'Phone' ? 'tel' : isNumeric(field.fieldtype) ? 'number' : 'text'
  return <Field label={`${label}${field.hidden ? ` (${t('metadataEditor.hidden')})` : ''}`}><Input type={inputType} step={isNumeric(field.fieldtype) ? 'any' : undefined} value={String(value)} disabled={disabled} required={Boolean(field.reqd && !disabled)} onChange={(event) => onChange(isNumeric(field.fieldtype) ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} /></Field>
}

export function MetadataDocEditor({ client, profileId = client.profileId, doctype, name, fields, initialValues = {}, basicFieldNames, onClose, onSaved }: MetadataDocEditorProps) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: queryKeys.metadata.document(profileId, doctype, name), queryFn: () => client.getDocument<Record<string, unknown>>(doctype, name!), enabled: Boolean(name) })
  const itemGroupsQuery = useQuery({ queryKey: queryKeys.metadata.list(profileId, 'Item Group', itemGroupFields), queryFn: () => listAllDocuments<ItemGroup>(client, 'Item Group', { fields: itemGroupFields, orderBy: 'lft asc' }), enabled: doctype === 'Item' && fields.some((field) => field.fieldname === 'item_group' && field.fieldtype === 'Link' && field.options === 'Item Group'), staleTime: 5 * 60 * 1000 })
  const [form, setForm] = useState<EditorValues>({})
  const [initialized, setInitialized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const itemGroupOptions = useMemo(() => {
    const groups = itemGroupsQuery.data ?? []
    const byName = new Map(groups.map((group) => [group.name, group]))
    return groups.filter((group) => group.is_group === 0 || group.is_group === false).map((group) => {
      let depth = 0
      let parent = group.parent_item_group
      const visited = new Set<string>()
      while (parent && byName.has(parent) && !visited.has(parent)) {
        visited.add(parent)
        depth += 1
        parent = byName.get(parent)?.parent_item_group
      }
      return { value: group.name, label: group.name, depth }
    })
  }, [itemGroupsQuery.data])
  const basicLabels: Record<string, string> = {
    item_code: t('metadataEditor.itemCode'),
    item_name: t('metadataEditor.itemName'),
    item_group: t('metadataEditor.itemGroup'),
    stock_uom: t('metadataEditor.stockUom'),
  }

  useEffect(() => {
    if (initialized || (name && !query.data)) return
    const source = name ? query.data ?? {} : initialValues
    setForm(Object.fromEntries(fields.filter((field) => field.fieldname).map((field) => [field.fieldname, toEditorValue(field, source[field.fieldname])]))); setInitialized(true)
  }, [fields, initialized, initialValues, name, query.data])

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (basicFieldNames?.includes('item_group') && !String(form.item_group ?? '').trim()) throw new Error(t('metadataEditor.itemGroupRequired'))
      const data = Object.fromEntries(editableFields.filter((field) => !isLocked(field) && !layoutFields.has(field.fieldtype ?? '')).map((field) => [field.fieldname, parseValue(field, form[field.fieldname] ?? '', t)]))
      const saved = name ? await client.updateDocument<Record<string, unknown>>(doctype, name, data) : await client.createDocument<Record<string, unknown>>(doctype, data)
      await onSaved?.(name ? { ...saved, name } : saved); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('metadataEditor.saveError')); if (basicFieldNames) setAdvancedOpen(true) } finally { setBusy(false) }
  }

  const editableFields = fields.filter((field) => field.fieldname)
  const basicFieldSet = new Set(basicFieldNames ?? [])
  const basicFields = basicFieldNames ? editableFields.filter((field) => basicFieldSet.has(field.fieldname) || field.reqd) : editableFields
  const basicFieldNamesSet = new Set(basicFields.map((field) => field.fieldname))
  const advancedFields = basicFieldNames ? editableFields.filter((field) => !basicFieldNamesSet.has(field.fieldname)) : []
  const renderField = (field: DocTypeField) => <MetadataField key={field.fieldname} field={field} value={form[field.fieldname] ?? ''} disabled={isLocked(field)} labelOverride={basicFieldSet.has(field.fieldname) ? basicLabels[field.fieldname] : undefined} requiredOverride={basicFieldSet.has(field.fieldname) && field.fieldname === 'item_group'} itemGroups={itemGroupOptions} itemGroupsLoading={itemGroupsQuery.isPending} itemGroupsError={itemGroupsQuery.isError} onRetryItemGroups={() => void itemGroupsQuery.refetch()} onChange={(value) => setForm({ ...form, [field.fieldname]: value })} />

  return <div className="card mb-5 p-5"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">{name ? `${doctype}: ${name}` : t('metadataEditor.newDocument', { doctype })}</h2>{!(basicFieldNames && !name) && <p className="muted">{t('metadataEditor.description')}</p>}</div><Button variant="secondary" onClick={onClose}>{t('metadataEditor.close')}</Button></div>{basicFieldNames && <p className="muted mb-4">{t('metadataEditor.basicDescription')}</p>}{error && <div className="mb-4"><Notice>{error}</Notice></div>}{query.isError && <div className="mb-4"><Notice>{query.error.message}</Notice></div>}{query.isPending && !initialized ? <Spinner /> : <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>{basicFields.map(renderField)}{basicFieldNames && advancedFields.length > 0 && <details className="group sm:col-span-2 border-t border-slate-200 pt-4" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}><summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"><span>{t('metadataEditor.advancedMode')}</span><ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><p className="muted mt-2">{t('metadataEditor.advancedDescription')}</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{advancedFields.map(renderField)}</div></details>}<div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? <Spinner /> : t('metadataEditor.save')}</Button></div></form>}</div>
}
