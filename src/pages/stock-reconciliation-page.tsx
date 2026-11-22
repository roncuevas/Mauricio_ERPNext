import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, PackagePlus, Trash2 } from 'lucide-react'
import { Badge, Button, ButtonLink, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, IconButton, Input, Notice, PageHeader, Spinner } from '../components/ui'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '../components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Switch } from '../components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group'
import { EntityCombobox } from '../components/entity-combobox'
import { createErpNextClient } from '../lib/erpnext'
import { StockItemPicker } from '../components/stock-item-picker'
import { useStockItems } from '../components/use-stock-items'
import { isOpeningEntryError, localPostingNow, reconciliationDifference, reconciliationPayload, refreshStockBins, saveAndSubmit, stockErrorMessage, stockReturnQuery, type StockReconciliationPurpose } from '../lib/stock'
import { writeStockCache } from '../lib/stock-cache'
import { queryKeys } from '../lib/query-keys'

type Client = ReturnType<typeof createErpNextClient>
type CountLine = { itemCode: string; counted: string; valuationRate: string }
type Account = { name: string; account_name?: string; root_type?: string; account_type?: string }
type CostCenter = { name: string; cost_center_name?: string }

const quantity = (value: number) => value.toLocaleString('es-MX', { maximumFractionDigits: 3 })

export function StockReconciliationPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate(); const queryClient = useQueryClient(); const [searchParams] = useSearchParams(); const fieldId = useId()
  const { cache, items, itemsByName, warehouses, isLoading } = useStockItems(profileId)

  const [warehouseName, setWarehouseName] = useState(searchParams.get('itemWarehouse') ?? searchParams.get('warehouse') ?? '')
  const [lines, setLines] = useState<CountLine[]>(() => { const item = searchParams.get('item'); return item ? [{ itemCode: item, counted: '', valuationRate: '' }] : [] })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [purpose, setPurpose] = useState<StockReconciliationPurpose>('Stock Reconciliation')
  const [customPosting, setCustomPosting] = useState(false); const [posting, setPosting] = useState(localPostingNow)
  const [showValuation, setShowValuation] = useState(false); const [allowZeroValuation, setAllowZeroValuation] = useState(false)
  const [expenseAccount, setExpenseAccount] = useState(''); const [costCenter, setCostCenter] = useState(''); const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [openingRequired, setOpeningRequired] = useState(false); const [draftName, setDraftName] = useState('')
  const linesRef = useRef<HTMLDivElement>(null); const pendingFocus = useRef(searchParams.get('item') ?? '')

  const warehouse = warehouses.find((candidate) => candidate.name === warehouseName)
  const company = warehouse?.company ?? ''
  const systemQty = useMemo(() => new Map((cache?.bins ?? []).filter((bin) => bin.warehouse === warehouseName).map((bin) => [bin.item_code, Number(bin.actual_qty ?? 0)])), [cache?.bins, warehouseName])
  const selected = useMemo(() => new Set(lines.map((line) => line.itemCode)), [lines])
  const counted = lines.filter((line) => line.counted.trim() !== '')
  const changed = counted.filter((line) => reconciliationDifference(systemQty.get(line.itemCode) ?? 0, line.counted) !== 0)

  // Account and cost center lists are only needed for advanced options (or to preselect the opening account); download them on demand.
  const accountsQuery = useQuery({ queryKey: ['stock-reconciliation-accounts', profileId, company], enabled: (advancedOpen || purpose === 'Opening Stock') && Boolean(company), staleTime: Infinity, queryFn: async () => (await client.listDocuments<Account>('Account', { fields: ['name', 'account_name', 'root_type', 'account_type'], filters: [['company', '=', company], ['is_group', '=', 0], ['account_type', '!=', 'Stock']], orderBy: 'name asc', pageLength: 1000 })).data })
  const costCentersQuery = useQuery({ queryKey: ['stock-reconciliation-cost-centers', profileId, company], enabled: advancedOpen && Boolean(company), staleTime: Infinity, queryFn: async () => (await client.listDocuments<CostCenter>('Cost Center', { fields: ['name', 'cost_center_name'], filters: [['company', '=', company], ['is_group', '=', 0]], orderBy: 'name asc', pageLength: 500 })).data })
  const accounts = useMemo(() => (accountsQuery.data ?? []).filter((account) => purpose !== 'Opening Stock' || account.root_type === 'Asset' || account.root_type === 'Liability'), [accountsQuery.data, purpose])

  useEffect(() => {
    if (purpose !== 'Opening Stock' || expenseAccount) return
    const temporary = accounts.find((account) => account.account_type === 'Temporary')
    if (temporary) setExpenseAccount(temporary.name)
  }, [accounts, expenseAccount, purpose])

  useEffect(() => {
    const itemCode = pendingFocus.current
    if (!itemCode) return
    const input = linesRef.current?.querySelector<HTMLInputElement>(`[data-count-input="${CSS.escape(itemCode)}"]`)
    if (input) { input.focus(); pendingFocus.current = '' }
  }, [lines])

  function addItem(itemCode: string) {
    pendingFocus.current = itemCode
    if (selected.has(itemCode)) { setLines((current) => [...current]); return }
    setLines((current) => [...current, { itemCode, counted: '', valuationRate: '' }])
  }

  function addWarehouseItems() {
    const additions = [...systemQty.entries()].filter(([itemCode, qty]) => qty !== 0 && itemsByName.has(itemCode) && !selected.has(itemCode)).map(([itemCode]) => ({ itemCode, counted: '', valuationRate: '' }))
    setLines((current) => [...current, ...additions])
  }

  const updateLine = (itemCode: string, patch: Partial<CountLine>) => setLines((current) => current.map((line) => line.itemCode === itemCode ? { ...line, ...patch } : line))
  const backPath = `/stock${stockReturnQuery(searchParams) ? `?${stockReturnQuery(searchParams)}` : ''}`

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setOpeningRequired(false); setBusy(true)
    try {
      if (!warehouse || !company || !cache) throw new Error(t('stockPage.missingCompany'))
      const payload = reconciliationPayload({
        company, warehouse: warehouse.name, purpose, remarks, expenseAccount, costCenter, allowZeroValuationRate: allowZeroValuation,
        posting: customPosting ? posting : undefined,
        lines: counted.map((line) => ({ itemCode: line.itemCode, qty: Number(line.counted), valuationRate: showValuation && line.valuationRate.trim() !== '' ? Number(line.valuationRate) : undefined })),
      })
      const name = await saveAndSubmit(client, 'Stock Reconciliation', payload, draftName, setDraftName)
      setDraftName('')
      const next = await writeStockCache(await refreshStockBins(client, cache, warehouse.name, counted.map((line) => line.itemCode)))
      queryClient.setQueryData(queryKeys.catalog.stock(profileId), next)
      navigate(backPath, { state: { stockNotice: t('stockPage.reconciliationSubmitted', { name, count: counted.length }) } })
    } catch (reason) { setError(stockErrorMessage(reason)); setOpeningRequired(purpose !== 'Opening Stock' && isOpeningEntryError(reason)) } finally { setBusy(false) }
  }

  if (isLoading) return <div className="p-6 muted"><Spinner /> {t('stockPage.loadingCatalog')}</div>
  if (!cache) return <section><PageHeader title={t('stockPage.reconcile')} /><Notice>{t('stockPage.downloadFirst')}</Notice><ButtonLink to="/stock" variant="secondary">{t('stockPage.backToStock')}</ButtonLink></section>

  return <section className="reconciliation-workspace">
    <PageHeader title={t('stockPage.reconcile')} description={t('stockPage.reconciliationDescription')} action={<ButtonLink to={backPath} variant="secondary">{t('stockPage.backToStock')}</ButtonLink>} />
    <form onSubmit={submit} className="reconciliation-form">
      <Card className="settings-card">
        <CardHeader><CardTitle as="h2">{t('stockPage.countTitle')}</CardTitle><CardDescription>{t('stockPage.countDescription')}</CardDescription></CardHeader>
        <CardContent className="reconciliation-content">
          <Field>
            <FieldLabel id={`${fieldId}-purpose`}>{t('stockPage.purpose')}</FieldLabel>
            <ToggleGroup type="single" className="segmented-control reconciliation-purpose" aria-labelledby={`${fieldId}-purpose`} value={purpose} onValueChange={(value) => { if (value && value !== purpose) { setPurpose(value as StockReconciliationPurpose); setExpenseAccount(''); setOpeningRequired(false) } }}>
              <ToggleGroupItem value="Stock Reconciliation">{t('stockPage.purposeReconciliation')}</ToggleGroupItem>
              <ToggleGroupItem value="Opening Stock">{t('stockPage.purposeOpening')}</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>{t(purpose === 'Opening Stock' ? 'stockPage.purposeOpeningDescription' : 'stockPage.purposeReconciliationDescription')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${fieldId}-warehouse`}>{t('stockPage.warehouse')}</FieldLabel>
            <Select value={warehouseName || undefined} onValueChange={(value) => { setWarehouseName(value); setExpenseAccount(''); setCostCenter('') }} required>
              <SelectTrigger id={`${fieldId}-warehouse`} className="stock-select-trigger"><SelectValue placeholder={t('stockPage.warehousePlaceholder')} /></SelectTrigger>
              <SelectContent align="start">{warehouses.map((candidate) => <SelectItem key={candidate.name} value={candidate.name}>{candidate.warehouse_name || candidate.name}</SelectItem>)}</SelectContent>
            </Select>
            {company && <FieldDescription>{t('stockPage.companyOf', { company })}</FieldDescription>}
          </Field>

          <StockItemPicker id={`${fieldId}-search`} items={items} disabled={!warehouseName} hint={t('stockPage.reconciliationHint')} onAdd={addItem}
            describe={(item) => selected.has(item.name) ? t('stockPage.alreadyAdded') : t('stockPage.systemQty', { qty: quantity(systemQty.get(item.name) ?? 0) })}
            action={<Button type="button" variant="secondary" onClick={addWarehouseItems} disabled={!warehouseName || !systemQty.size}><PackagePlus aria-hidden="true" />{t('stockPage.loadWarehouseItems')}</Button>} />

          {lines.length > 0 ? <div className={`reconciliation-lines${showValuation ? ' has-valuation' : ''}`} ref={linesRef} role="list" aria-label={t('stockPage.productsToReconcile')}>
            <div className="reconciliation-line reconciliation-line-head" aria-hidden="true"><span>{t('stockPage.product')}</span><span>{t('stockPage.system')}</span><span>{t('stockPage.counted')}</span><span>{t('stockPage.difference')}</span>{showValuation && <span>{t('stockPage.valuation')}</span>}<span /></div>
            {lines.map((line) => {
              const item = itemsByName.get(line.itemCode); const label = item?.item_name || line.itemCode
              const system = systemQty.get(line.itemCode) ?? 0; const difference = reconciliationDifference(system, line.counted)
              return <div key={line.itemCode} className="reconciliation-line" role="listitem">
                <div className="reconciliation-line-product"><strong>{label}</strong><small>{line.itemCode} · {item?.stock_uom || t('stockPage.noUom')}</small></div>
                <div className="reconciliation-line-system"><small>{t('stockPage.system')}</small>{quantity(system)}</div>
                <label className="reconciliation-line-count"><small>{t('stockPage.counted')}</small><Input data-count-input={line.itemCode} type="number" inputMode="decimal" min="0" step="any" value={line.counted} placeholder={quantity(system)} onChange={(event) => updateLine(line.itemCode, { counted: event.target.value })} aria-label={t('stockPage.countedFor', { product: label })} /></label>
                <div className="reconciliation-line-difference"><small>{t('stockPage.difference')}</small><Badge tone={difference === null || difference === 0 ? 'neutral' : difference > 0 ? 'success' : 'danger'}>{difference === null ? t('stockPage.pending') : difference === 0 ? t('stockPage.noChange') : `${difference > 0 ? '+' : ''}${quantity(difference)}`}</Badge></div>
                {showValuation && <label className="reconciliation-line-valuation"><small>{t('stockPage.valuation')}</small><Input type="number" inputMode="decimal" min="0" step="any" value={line.valuationRate} placeholder={t('stockPage.keepValuation')} onChange={(event) => updateLine(line.itemCode, { valuationRate: event.target.value })} aria-label={t('stockPage.valuationFor', { product: label })} /></label>}
                <IconButton label={t('stockPage.removeProduct', { product: label })} type="button" icon={<Trash2 aria-hidden="true" />} onClick={() => setLines((current) => current.filter((candidate) => candidate.itemCode !== line.itemCode))} />
              </div>
            })}
          </div> : <p className="reconciliation-empty muted">{warehouseName ? t('stockPage.noLines') : t('stockPage.chooseWarehouseFirst')}</p>}
        </CardContent>
        {lines.length > 0 && <CardFooter className="reconciliation-summary" role="status">{t('stockPage.countSummary', { counted: counted.length, changed: changed.length, pending: lines.length - counted.length })}</CardFooter>}
      </Card>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} asChild>
        <Card className="settings-card reconciliation-advanced">
          <CardHeader>
            <CollapsibleTrigger asChild><button type="button" className="reconciliation-advanced-trigger"><span><CardTitle as="h2">{t('stockPage.advancedTitle')}</CardTitle><CardDescription>{t('stockPage.advancedDescription')}</CardDescription></span><ChevronDown aria-hidden="true" /></button></CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent><FieldGroup className="settings-fields">
              <Field orientation="horizontal">
                <FieldContent><FieldLabel htmlFor={`${fieldId}-posting`}>{t('stockPage.customPosting')}</FieldLabel><FieldDescription>{t('stockPage.customPostingDescription')}</FieldDescription></FieldContent>
                <Switch id={`${fieldId}-posting`} checked={customPosting} onCheckedChange={(checked) => { setCustomPosting(checked); if (checked) setPosting(localPostingNow()) }} />
              </Field>
              {customPosting && <div className="reconciliation-posting">
                <Field><FieldLabel htmlFor={`${fieldId}-date`}>{t('stockPage.date')}</FieldLabel><Input id={`${fieldId}-date`} type="date" value={posting.date} max={localPostingNow().date} onChange={(event) => setPosting((current) => ({ ...current, date: event.target.value }))} required /></Field>
                <Field><FieldLabel htmlFor={`${fieldId}-time`}>{t('stockPage.time')}</FieldLabel><Input id={`${fieldId}-time`} type="time" value={posting.time.slice(0, 5)} onChange={(event) => setPosting((current) => ({ ...current, time: `${event.target.value}:00` }))} required /></Field>
              </div>}
              <Field orientation="horizontal">
                <FieldContent><FieldLabel htmlFor={`${fieldId}-valuation`}>{t('stockPage.showValuation')}</FieldLabel><FieldDescription>{t('stockPage.showValuationDescription')}</FieldDescription></FieldContent>
                <Switch id={`${fieldId}-valuation`} checked={showValuation} onCheckedChange={setShowValuation} />
              </Field>
              {showValuation && <Field orientation="horizontal">
                <FieldContent><FieldLabel htmlFor={`${fieldId}-zero`}>{t('stockPage.allowZeroValuation')}</FieldLabel><FieldDescription>{t('stockPage.allowZeroValuationDescription')}</FieldDescription></FieldContent>
                <Switch id={`${fieldId}-zero`} checked={allowZeroValuation} onCheckedChange={setAllowZeroValuation} />
              </Field>}
              <Field orientation="responsive">
                <FieldContent><FieldLabel>{t('stockPage.differenceAccount')}</FieldLabel><FieldDescription>{t(purpose === 'Opening Stock' ? 'stockPage.differenceAccountOpening' : 'stockPage.differenceAccountDescription')}</FieldDescription></FieldContent>
                <EntityCombobox className="settings-control" ariaLabel={t('stockPage.differenceAccount')} value={expenseAccount} onValueChange={setExpenseAccount} loading={accountsQuery.isFetching} disabled={!company} allowClear clearLabel={t('stockPage.companyDefault')} placeholder={t('stockPage.companyDefault')} searchPlaceholder={t('stockPage.searchAccount')} options={accounts.map((account) => ({ value: account.name, label: account.account_name || account.name, searchText: account.name, meta: account.root_type }))} />
              </Field>
              <Field orientation="responsive">
                <FieldContent><FieldLabel>{t('stockPage.costCenter')}</FieldLabel><FieldDescription>{t('stockPage.costCenterDescription')}</FieldDescription></FieldContent>
                <EntityCombobox className="settings-control" ariaLabel={t('stockPage.costCenter')} value={costCenter} onValueChange={setCostCenter} loading={costCentersQuery.isFetching} disabled={!company} allowClear clearLabel={t('stockPage.companyDefault')} placeholder={t('stockPage.companyDefault')} searchPlaceholder={t('stockPage.searchCostCenter')} options={(costCentersQuery.data ?? []).map((center) => ({ value: center.name, label: center.cost_center_name || center.name, searchText: center.name }))} />
              </Field>
              {(accountsQuery.isError || costCentersQuery.isError) && <Notice>{stockErrorMessage(accountsQuery.error ?? costCentersQuery.error)}</Notice>}
              <Field>
                <FieldLabel htmlFor={`${fieldId}-notes`}>{t('stockPage.notes')}</FieldLabel>
                <Input id={`${fieldId}-notes`} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder={t('stockPage.notesPlaceholder')} />
              </Field>
            </FieldGroup></CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {draftName && error && <Notice tone="warning">{t('stockPage.draftPending', { name: draftName })}</Notice>}
      {error && <Notice>{error}{openingRequired && <div className="mt-2"><Button type="button" variant="secondary" size="compact" onClick={() => { setPurpose('Opening Stock'); setExpenseAccount(''); setAdvancedOpen(true); setOpeningRequired(false); setError('') }}>{t('stockPage.useOpeningStock')}</Button></div>}</Notice>}
      <div className="stock-form-actions">
        <ButtonLink to={backPath} variant="secondary">{t('stockPage.cancel')}</ButtonLink>
        <Button type="submit" loading={busy} disabled={busy || !warehouse || !counted.length}>{busy ? t('stockPage.sending') : draftName ? t('stockPage.retrySubmit', { name: draftName }) : t('stockPage.confirmReconciliation', { count: counted.length })}</Button>
      </div>
    </form>
  </section>
}
