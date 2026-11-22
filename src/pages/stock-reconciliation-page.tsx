import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PackagePlus, Trash2 } from 'lucide-react'
import { Badge, Button, ButtonLink, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, IconButton, Input, Notice, PageHeader } from '../components/ui'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '../components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
import { Switch } from '../components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group'
import { EntityCombobox } from '../components/entity-combobox'
import { useConfirmDialog } from '../components/confirm-dialog'
import { ProductCellContent, ResponsiveCell, ResponsiveRow, ResponsiveTable, type ResponsiveColumn } from '../components/responsive-table'
import { AdvancedOptionsCard, ConfirmSummary, DraftRestoredNotice, LinesEmpty, PostingDateFields, StockSubmitBar } from '../components/stock-document'
import { StockItemPicker } from '../components/stock-item-picker'
import { useLineEntryKeys, useStockDraft } from '../components/use-stock-document'
import { useStockItems } from '../components/use-stock-items'
import { createErpNextClient } from '../lib/erpnext'
import { isOpeningEntryError, localPostingNow, reconciliationDifference, reconciliationPayload, refreshStockBins, saveAndSubmit, stockErrorMessage, stockReturnQuery, type StockReconciliationPurpose } from '../lib/stock'
import { writeStockCache } from '../lib/stock-cache'
import { queryKeys } from '../lib/query-keys'

type Client = ReturnType<typeof createErpNextClient>
type CountLine = { itemCode: string; counted: string; valuationRate: string }
type CountDraft = { warehouseName: string; purpose: StockReconciliationPurpose; lines: CountLine[] }
type Account = { name: string; account_name?: string; root_type?: string; account_type?: string }
type CostCenter = { name: string; cost_center_name?: string }

const quantity = (value: number) => value.toLocaleString('es-MX', { maximumFractionDigits: 3 })
const signed = (value: number) => `${value > 0 ? '+' : ''}${quantity(value)}`

export function StockReconciliationPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate(); const queryClient = useQueryClient(); const [searchParams] = useSearchParams(); const fieldId = useId()
  const { cache, items, itemsByName, warehouses, isLoading } = useStockItems(profileId)
  const { confirm, dialog } = useConfirmDialog()

  const itemParam = searchParams.get('item') ?? ''; const warehouseParam = searchParams.get('itemWarehouse') ?? searchParams.get('warehouse') ?? ''
  const initialDraft = useCallback((): CountDraft => ({ warehouseName: warehouseParam, purpose: 'Stock Reconciliation', lines: itemParam ? [{ itemCode: itemParam, counted: '', valuationRate: '' }] : [] }), [itemParam, warehouseParam])
  // A product opened from "Ajustar" joins a saved count of the same warehouse; a count of another warehouse is not mixed in.
  const { draft, update, clear, restored, dismissRestored } = useStockDraft<CountDraft>(`mauricio:${profileId}:draft:stock-reconciliation`, initialDraft, (saved) => !warehouseParam || saved.warehouseName === warehouseParam)
  const { warehouseName, purpose, lines } = draft

  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [customPosting, setCustomPosting] = useState(false); const [posting, setPosting] = useState(localPostingNow)
  const [showValuation, setShowValuation] = useState(false); const [allowZeroValuation, setAllowZeroValuation] = useState(false)
  const [expenseAccount, setExpenseAccount] = useState(''); const [costCenter, setCostCenter] = useState(''); const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [openingRequired, setOpeningRequired] = useState(false); const [draftName, setDraftName] = useState('')
  const tableRef = useRef<HTMLDivElement>(null); const pickerRef = useRef<HTMLInputElement>(null); const pendingFocus = useRef(itemParam)

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

  // "Ajustar" on a product that is not yet in the restored count adds it.
  useEffect(() => {
    if (itemParam && restored) update((current) => current.lines.some((line) => line.itemCode === itemParam) ? {} : { lines: [...current.lines, { itemCode: itemParam, counted: '', valuationRate: '' }] })
  }, [itemParam, restored, update])

  useEffect(() => {
    const itemCode = pendingFocus.current
    if (!itemCode) return
    const input = tableRef.current?.querySelector<HTMLInputElement>(`[data-count-input="${CSS.escape(itemCode)}"]`)
    if (input) { input.focus(); pendingFocus.current = '' }
  }, [lines])

  function addItem(itemCode: string) {
    pendingFocus.current = itemCode
    update((current) => ({ lines: current.lines.some((line) => line.itemCode === itemCode) ? [...current.lines] : [...current.lines, { itemCode, counted: '', valuationRate: '' }] }))
  }

  function addWarehouseItems() {
    update((current) => {
      const present = new Set(current.lines.map((line) => line.itemCode))
      const additions = [...systemQty.entries()].filter(([itemCode, qty]) => qty !== 0 && itemsByName.has(itemCode) && !present.has(itemCode)).map(([itemCode]) => ({ itemCode, counted: '', valuationRate: '' }))
      return { lines: [...current.lines, ...additions] }
    })
  }

  const updateLine = (itemCode: string, patch: Partial<CountLine>) => update((current) => ({ lines: current.lines.map((line) => line.itemCode === itemCode ? { ...line, ...patch } : line) }))
  const lineKeys = useLineEntryKeys({ items, pickerRef, onScan: addItem })
  const backPath = `/stock${stockReturnQuery(searchParams) ? `?${stockReturnQuery(searchParams)}` : ''}`

  async function submit() {
    setError(''); setOpeningRequired(false)
    let payload: ReturnType<typeof reconciliationPayload>
    try {
      if (!warehouse || !company || !cache) throw new Error(t('stockPage.missingCompany'))
      payload = reconciliationPayload({
        company, warehouse: warehouse.name, purpose, remarks, expenseAccount, costCenter, allowZeroValuationRate: allowZeroValuation,
        posting: customPosting ? posting : undefined,
        lines: counted.map((line) => ({ itemCode: line.itemCode, qty: Number(line.counted), valuationRate: showValuation && line.valuationRate.trim() !== '' ? Number(line.valuationRate) : undefined })),
      })
    } catch (reason) { setError(stockErrorMessage(reason)); return }

    const label = warehouse.warehouse_name || warehouse.name
    const ok = await confirm({
      title: t(purpose === 'Opening Stock' ? 'stockPage.confirmOpeningTitle' : 'stockPage.confirmReconciliationTitle'),
      description: t('stockPage.confirmReconciliationDescription', { count: counted.length, warehouse: label }),
      content: <ConfirmSummary rows={counted.map((line) => {
        const system = systemQty.get(line.itemCode) ?? 0; const difference = reconciliationDifference(system, line.counted) ?? 0
        return { key: line.itemCode, label: itemsByName.get(line.itemCode)?.item_name || line.itemCode, value: `${quantity(system)} → ${quantity(Number(line.counted))} (${difference === 0 ? t('stockPage.noChange') : signed(difference)})` }
      })} total={t('stockPage.confirmChanged', { count: changed.length })} />,
      confirmLabel: t('stockPage.confirmReconciliation', { count: counted.length }),
    })
    if (!ok) return

    setBusy(true)
    try {
      const name = await saveAndSubmit(client, 'Stock Reconciliation', payload, draftName, setDraftName)
      setDraftName('')
      const next = await writeStockCache(await refreshStockBins(client, cache, warehouse.name, counted.map((line) => line.itemCode)))
      queryClient.setQueryData(queryKeys.catalog.stock(profileId), next)
      clear()
      navigate(backPath, { state: { stockNotice: t('stockPage.reconciliationSubmitted', { name, count: counted.length }), stockDocument: { doctype: 'Stock Reconciliation', name } } })
    } catch (reason) { setError(stockErrorMessage(reason)); setOpeningRequired(purpose !== 'Opening Stock' && isOpeningEntryError(reason)) } finally { setBusy(false) }
  }

  const header = <PageHeader title={t('stockPage.reconciliationTitle')} description={t('stockPage.reconciliationDescription')} action={<ButtonLink to={backPath} variant="secondary">{t('stockPage.backToStock')}</ButtonLink>} />
  if (isLoading) return <section className="stock-document">{header}<div className="stock-document-loading" aria-busy="true" aria-label={t('stockPage.loadingCatalog')}><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-32 w-full" /></div></section>
  if (!cache) return <section className="stock-document">{header}<Notice tone="info">{t('stockPage.downloadFirst')}</Notice></section>

  const columns: ResponsiveColumn[] = [
    { id: 'product', label: t('stockPage.product') },
    { id: 'system', label: t('stockPage.system'), align: 'end' },
    { id: 'counted', label: t('stockPage.counted'), className: 'stock-col-input' },
    { id: 'difference', label: t('stockPage.difference') },
    ...(showValuation ? [{ id: 'valuation', label: t('stockPage.valuation'), className: 'stock-col-input' }] : []),
    { id: 'actions', label: t('stockPage.actions'), hidden: true, className: 'stock-col-actions' },
  ]

  return <section className="stock-document">
    {header}
    {dialog}
    <form onSubmit={(event) => event.preventDefault()} className="stock-document-form" noValidate>
      {restored && <DraftRestoredNotice onDiscard={clear} onDismiss={dismissRestored} />}
      <Card className="settings-card">
        <CardHeader><CardTitle as="h2">{t('stockPage.countTitle')}</CardTitle><CardDescription>{t('stockPage.countDescription')}</CardDescription></CardHeader>
        <CardContent className="stock-document-content">
          <Field>
            <FieldLabel id={`${fieldId}-purpose`}>{t('stockPage.purpose')}</FieldLabel>
            <ToggleGroup type="single" className="segmented-control stock-purpose" aria-labelledby={`${fieldId}-purpose`} value={purpose} onValueChange={(value) => { if (value && value !== purpose) { update({ purpose: value as StockReconciliationPurpose }); setExpenseAccount(''); setOpeningRequired(false) } }}>
              <ToggleGroupItem value="Stock Reconciliation">{t('stockPage.purposeReconciliation')}</ToggleGroupItem>
              <ToggleGroupItem value="Opening Stock">{t('stockPage.purposeOpening')}</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>{t(purpose === 'Opening Stock' ? 'stockPage.purposeOpeningDescription' : 'stockPage.purposeReconciliationDescription')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${fieldId}-warehouse`}>{t('stockPage.warehouse')}</FieldLabel>
            <Select value={warehouseName || undefined} onValueChange={(value) => { update({ warehouseName: value }); setExpenseAccount(''); setCostCenter('') }}>
              <SelectTrigger id={`${fieldId}-warehouse`} className="stock-select-trigger"><SelectValue placeholder={t('stockPage.warehousePlaceholder')} /></SelectTrigger>
              <SelectContent align="start">{warehouses.map((candidate) => <SelectItem key={candidate.name} value={candidate.name}>{candidate.warehouse_name || candidate.name}</SelectItem>)}</SelectContent>
            </Select>
            {company && <FieldDescription>{t('stockPage.companyOf', { company })}</FieldDescription>}
          </Field>

          <StockItemPicker id={`${fieldId}-search`} inputRef={pickerRef} items={items} disabled={!warehouseName} hint={t('stockPage.reconciliationHint')} onAdd={addItem}
            describe={(item) => selected.has(item.name) ? t('stockPage.alreadyAdded') : t('stockPage.systemQty', { qty: quantity(systemQty.get(item.name) ?? 0) })}
            action={<Button type="button" variant="secondary" onClick={addWarehouseItems} disabled={!warehouseName || !systemQty.size}><PackagePlus aria-hidden="true" />{t('stockPage.loadWarehouseItems')}</Button>} />

          {lines.length > 0 ? <div ref={tableRef}><ResponsiveTable label={t('stockPage.productsToReconcile')} columns={columns}>
            {lines.map((line) => {
              const item = itemsByName.get(line.itemCode); const label = item?.item_name || line.itemCode
              const system = systemQty.get(line.itemCode) ?? 0; const difference = reconciliationDifference(system, line.counted)
              return <ResponsiveRow key={line.itemCode}>
                <ResponsiveCell role="primary"><ProductCellContent name={label} code={line.itemCode} detail={item?.stock_uom || t('stockPage.noUom')} /></ResponsiveCell>
                <ResponsiveCell label={t('stockPage.system')} align="end">{quantity(system)}</ResponsiveCell>
                <ResponsiveCell label={t('stockPage.counted')}><Input data-count-input={line.itemCode} type="number" inputMode="decimal" min="0" step="any" value={line.counted} placeholder={t('stockPage.countPlaceholder')} onChange={(event) => updateLine(line.itemCode, { counted: event.target.value })} aria-label={t('stockPage.countedFor', { product: label })} {...lineKeys((value) => updateLine(line.itemCode, { counted: value }))} /></ResponsiveCell>
                <ResponsiveCell label={t('stockPage.difference')}><Badge tone={difference === null || difference === 0 ? 'neutral' : difference > 0 ? 'success' : 'danger'} className="stock-difference">{difference === null ? t('stockPage.pending') : difference === 0 ? t('stockPage.noChange') : signed(difference)}</Badge></ResponsiveCell>
                {showValuation && <ResponsiveCell label={t('stockPage.valuation')}><Input type="number" inputMode="decimal" min="0" step="any" value={line.valuationRate} placeholder={t('stockPage.keepValuation')} onChange={(event) => updateLine(line.itemCode, { valuationRate: event.target.value })} aria-label={t('stockPage.valuationFor', { product: label })} {...lineKeys((value) => updateLine(line.itemCode, { valuationRate: value }))} /></ResponsiveCell>}
                <ResponsiveCell role="actions"><IconButton label={t('stockPage.removeProduct', { product: label })} type="button" icon={<Trash2 aria-hidden="true" />} onClick={() => update((current) => ({ lines: current.lines.filter((candidate) => candidate.itemCode !== line.itemCode) }))} /></ResponsiveCell>
              </ResponsiveRow>
            })}
          </ResponsiveTable></div> : <LinesEmpty title={t(warehouseName ? 'stockPage.noLinesTitle' : 'stockPage.chooseWarehouseTitle')} description={t(warehouseName ? 'stockPage.noLines' : 'stockPage.chooseWarehouseFirst')} />}
        </CardContent>
        {lines.length > 0 && <CardFooter className="stock-document-summary">{t('stockPage.countSummary', { counted: counted.length, count: lines.length, changed: changed.length })}</CardFooter>}
      </Card>

      <AdvancedOptionsCard open={advancedOpen} onOpenChange={setAdvancedOpen} description={t('stockPage.advancedDescription')}>
        <FieldGroup className="settings-fields">
          <PostingDateFields id={fieldId} enabled={customPosting} onEnabledChange={setCustomPosting} posting={posting} onPostingChange={setPosting} />
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
        </FieldGroup>
      </AdvancedOptionsCard>

      {draftName && error && <Notice tone="warning">{t('stockPage.draftPending', { name: draftName })}</Notice>}
      {error && <Notice><p>{error}</p>{openingRequired && <Button type="button" variant="secondary" size="compact" className="mt-2" onClick={() => { update({ purpose: 'Opening Stock' }); setExpenseAccount(''); setAdvancedOpen(true); setOpeningRequired(false); setError('') }}>{t('stockPage.useOpeningStock')}</Button>}</Notice>}
      <StockSubmitBar backPath={backPath} busy={busy} disabled={!warehouse || !counted.length} onSubmit={submit} label={draftName ? t('stockPage.retrySubmit', { name: draftName }) : t('stockPage.confirmReconciliation', { count: counted.length })} />
    </form>
  </section>
}
