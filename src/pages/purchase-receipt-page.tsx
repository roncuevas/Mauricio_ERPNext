import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { ButtonLink, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, IconButton, Input, Notice, PageHeader } from '../components/ui'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '../components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
import { Switch } from '../components/ui/switch'
import { EntityCombobox } from '../components/entity-combobox'
import { useConfirmDialog } from '../components/confirm-dialog'
import { ProductCellContent, ResponsiveCell, ResponsiveRow, ResponsiveTable, type ResponsiveColumn } from '../components/responsive-table'
import { AdvancedOptionsCard, ConfirmSummary, DraftRestoredNotice, LinesEmpty, PostingDateFields, StockSubmitBar } from '../components/stock-document'
import { StockItemPicker } from '../components/stock-item-picker'
import { useLineEntryKeys, useStockDraft } from '../components/use-stock-document'
import { useStockItems } from '../components/use-stock-items'
import { createErpNextClient } from '../lib/erpnext'
import { purchaseReceiptPayload, purchaseUomOptions, suggestPurchaseRate, type RateSuggestion } from '../lib/purchase-receipt'
import { localPostingNow, refreshStockBins, saveAndSubmit, stockErrorMessage, stockBackPath } from '../lib/stock'
import { writeStockCache } from '../lib/stock-cache'
import { readSupplierCatalog } from '../lib/supplier-cache'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { queryKeys } from '../lib/query-keys'

type Client = ReturnType<typeof createErpNextClient>
/** `rate: null` follows the suggested cost; typing a value pins it. */
type ReceiptLine = { itemCode: string; qty: string; rejectedQty: string; uom: string; rate: string | null }
type ReceiptDraft = { supplier: string; warehouseName: string; deliveryNote: string; lines: ReceiptLine[] }

const quantity = (value: number) => value.toLocaleString('es-MX', { maximumFractionDigits: 3 })

export function PurchaseReceiptPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate(); const queryClient = useQueryClient(); const [searchParams] = useSearchParams(); const fieldId = useId()
  const { cache, items, itemsByName, warehouses, isLoading } = useStockItems(profileId)
  const { confirm, dialog } = useConfirmDialog()
  const suppliersQuery = useQuery({ queryKey: queryKeys.catalog.supplier(profileId), queryFn: () => readSupplierCatalog(profileId), staleTime: Infinity })
  const pricesQuery = useQuery(catalogQueryOptions.price(profileId))
  const suppliers = useMemo(() => (suppliersQuery.data?.suppliers ?? []).filter((supplier) => !supplier.disabled), [suppliersQuery.data?.suppliers])
  const prices = useMemo(() => pricesQuery.data?.prices ?? [], [pricesQuery.data?.prices])

  const warehouseParam = searchParams.get('warehouse') ?? ''; const itemParam = searchParams.get('item') ?? ''
  const initialDraft = useCallback((): ReceiptDraft => ({ supplier: '', warehouseName: warehouseParam, deliveryNote: '', lines: [] }), [warehouseParam])
  // A product opened from Pendientes joins a saved receipt of the same warehouse; a receipt of another warehouse is not mixed in.
  const { draft, update, clear, restored, dismissRestored } = useStockDraft<ReceiptDraft>(`mauricio:${profileId}:draft:purchase-receipt`, initialDraft, (saved) => !warehouseParam || saved.warehouseName === warehouseParam)
  const { supplier, warehouseName, deliveryNote, lines } = draft

  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [customPosting, setCustomPosting] = useState(false); const [posting, setPosting] = useState(localPostingNow)
  const [trackRejected, setTrackRejected] = useState(false); const [rejectedWarehouse, setRejectedWarehouse] = useState(''); const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [draftName, setDraftName] = useState('')
  const tableRef = useRef<HTMLDivElement>(null); const pickerRef = useRef<HTMLInputElement>(null); const pendingFocus = useRef('')

  const warehouse = warehouses.find((candidate) => candidate.name === warehouseName)
  const company = warehouse?.company ?? ''
  const currency = cache?.companies.find((candidate) => candidate.name === company)?.default_currency ?? ''
  const money = (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: currency || 'MXN' })
  const supplierLabel = suppliers.find((candidate) => candidate.name === supplier)?.supplier_name || supplier
  const today = localPostingNow().date
  const selected = useMemo(() => new Set(lines.map((line) => line.itemCode)), [lines])

  const lineDetails = (line: ReceiptLine) => {
    const item = itemsByName.get(line.itemCode)
    const { options } = purchaseUomOptions(item)
    const uom = options.find((option) => option.uom === line.uom) ?? options[0] ?? { uom: line.uom, conversionFactor: 1 }
    const suggestion: RateSuggestion | null = suggestPurchaseRate(prices, line.itemCode, uom, item?.stock_uom || uom.uom, supplier, today)
    const rate = line.rate ?? (suggestion ? String(Math.round(suggestion.rate * 100) / 100) : '')
    const amount = (Number(line.qty) || 0) * (Number(rate) || 0)
    return { item, label: item?.item_name || line.itemCode, options, uom, suggestion, rate, amount }
  }
  const total = lines.reduce((sum, line) => sum + lineDetails(line).amount, 0)
  const ready = lines.filter((line) => Number(line.qty) > 0 || (trackRejected && Number(line.rejectedQty) > 0))

  useEffect(() => {
    const itemCode = pendingFocus.current
    if (!itemCode) return
    const input = tableRef.current?.querySelector<HTMLInputElement>(`[data-qty-input="${CSS.escape(itemCode)}"]`)
    if (input) { input.focus(); pendingFocus.current = '' }
  }, [lines])

  function addItem(itemCode: string) {
    pendingFocus.current = itemCode
    update((current) => ({ lines: current.lines.some((line) => line.itemCode === itemCode) ? [...current.lines] : [...current.lines, { itemCode, qty: '', rejectedQty: '', uom: purchaseUomOptions(itemsByName.get(itemCode)).defaultUom, rate: null }] }))
  }

  // Add the requested product once the stock catalog can resolve its purchase UOM.
  const itemParamAdded = useRef(false)
  useEffect(() => {
    if (!itemParam || itemParamAdded.current || !itemsByName.has(itemParam)) return
    itemParamAdded.current = true
    addItem(itemParam)
  // addItem only depends on itemsByName, which this effect already tracks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemParam, itemsByName])

  const updateLine = (itemCode: string, patch: Partial<ReceiptLine>) => update((current) => ({ lines: current.lines.map((line) => line.itemCode === itemCode ? { ...line, ...patch } : line) }))
  const lineKeys = useLineEntryKeys({ items, pickerRef, onScan: addItem })
  const backPath = stockBackPath(searchParams)
  const backLabel = backPath.startsWith('/pendientes') ? t('pricesPage.backToPending') : t('stockPage.backToStock')

  async function submit() {
    setError('')
    let payload: ReturnType<typeof purchaseReceiptPayload>
    try {
      if (!warehouse || !company || !cache) throw new Error(t('stockPage.missingCompany'))
      payload = purchaseReceiptPayload({
        company, currency, supplier, warehouse: warehouse.name, rejectedWarehouse: trackRejected ? rejectedWarehouse : undefined,
        posting: customPosting ? posting : undefined, supplierDeliveryNote: deliveryNote, remarks,
        lines: ready.map((line) => {
          const details = lineDetails(line)
          return { itemCode: line.itemCode, itemName: details.label, qty: Number(line.qty) || 0, rejectedQty: trackRejected ? Number(line.rejectedQty) || 0 : 0, uom: details.uom.uom, stockUom: details.item?.stock_uom || details.uom.uom, conversionFactor: details.uom.conversionFactor, rate: details.rate.trim() === '' ? Number.NaN : Number(details.rate) }
        }),
      })
    } catch (reason) { setError(stockErrorMessage(reason)); return }

    const readyTotal = ready.reduce((sum, line) => sum + lineDetails(line).amount, 0)
    const ok = await confirm({
      title: t('receiptPage.confirmTitle', { supplier: supplierLabel }),
      description: t('receiptPage.confirmDescription', { count: ready.length, warehouse: warehouse.warehouse_name || warehouse.name }),
      content: <ConfirmSummary rows={ready.map((line) => {
        const details = lineDetails(line)
        return { key: line.itemCode, label: details.label, value: `${quantity(Number(line.qty) || 0)} ${details.uom.uom} × ${money(Number(details.rate) || 0)}` }
      })} total={t('receiptPage.confirmTotal', { total: money(readyTotal) })} />,
      confirmLabel: t('receiptPage.submit', { count: ready.length }),
    })
    if (!ok) return

    setBusy(true)
    try {
      const name = await saveAndSubmit(client, 'Purchase Receipt', payload, draftName, setDraftName)
      setDraftName('')
      const codes = ready.map((line) => line.itemCode)
      let next = await refreshStockBins(client, cache, warehouse.name, codes)
      if (trackRejected && rejectedWarehouse && ready.some((line) => Number(line.rejectedQty) > 0)) next = await refreshStockBins(client, next, rejectedWarehouse, codes)
      queryClient.setQueryData(queryKeys.catalog.stock(profileId), await writeStockCache(next))
      clear()
      navigate(backPath, { state: { stockNotice: t('receiptPage.submitted', { name, count: ready.length, supplier: supplierLabel }), stockDocument: { doctype: 'Purchase Receipt', name } } })
    } catch (reason) { setError(stockErrorMessage(reason)) } finally { setBusy(false) }
  }

  const header = <PageHeader title={t('receiptPage.title')} description={t('receiptPage.description')} action={<ButtonLink to={backPath} variant="secondary">{backLabel}</ButtonLink>} />
  if (isLoading || suppliersQuery.isLoading) return <section className="stock-document">{header}<div className="stock-document-loading" aria-busy="true" aria-label={t('stockPage.loadingCatalog')}><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-32 w-full" /></div></section>
  if (!cache) return <section className="stock-document">{header}<Notice tone="info">{t('stockPage.downloadFirst')}</Notice></section>

  const columns: ResponsiveColumn[] = [
    { id: 'product', label: t('stockPage.product') },
    { id: 'qty', label: t('receiptPage.accepted'), className: 'stock-col-input' },
    ...(trackRejected ? [{ id: 'rejected', label: t('receiptPage.rejected'), className: 'stock-col-input' }] : []),
    { id: 'uom', label: t('receiptPage.uom'), className: 'stock-col-uom' },
    { id: 'rate', label: t('receiptPage.unitCost'), className: 'stock-col-input' },
    { id: 'amount', label: t('receiptPage.amount'), align: 'end' },
    { id: 'actions', label: t('stockPage.actions'), hidden: true, className: 'stock-col-actions' },
  ]

  return <section className="stock-document">
    {header}
    {dialog}
    <form onSubmit={(event) => event.preventDefault()} className="stock-document-form" noValidate>
      {restored && <DraftRestoredNotice onDiscard={clear} onDismiss={dismissRestored} />}
      <Card className="settings-card">
        <CardHeader><CardTitle as="h2">{t('receiptPage.receiveTitle')}</CardTitle><CardDescription>{t('receiptPage.receiveDescription')}</CardDescription></CardHeader>
        <CardContent className="stock-document-content">
          <div className="stock-document-fields">
            <Field>
              <FieldLabel>{t('receiptPage.supplier')}</FieldLabel>
              <EntityCombobox ariaLabel={t('receiptPage.supplier')} value={supplier} onValueChange={(value) => update({ supplier: value })} required placeholder={t('receiptPage.selectSupplier')} searchPlaceholder={t('receiptPage.searchSupplier')} options={suppliers.map((candidate) => ({ value: candidate.name, label: candidate.supplier_name || candidate.name, searchText: candidate.name }))} />
              {!suppliers.length && <FieldDescription>{t('receiptPage.noSuppliers')} <ButtonLink to="/suppliers" variant="secondary" size="compact">{t('receiptPage.openSuppliers')}</ButtonLink></FieldDescription>}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-warehouse`}>{t('receiptPage.warehouse')}</FieldLabel>
              <Select value={warehouseName || undefined} onValueChange={(value) => update({ warehouseName: value })}>
                <SelectTrigger id={`${fieldId}-warehouse`} className="stock-select-trigger"><SelectValue placeholder={t('stockPage.warehousePlaceholder')} /></SelectTrigger>
                <SelectContent align="start">{warehouses.map((candidate) => <SelectItem key={candidate.name} value={candidate.name}>{candidate.warehouse_name || candidate.name}</SelectItem>)}</SelectContent>
              </Select>
              {company && <FieldDescription>{t('stockPage.companyOf', { company })}</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-note`}>{t('receiptPage.deliveryNote')}</FieldLabel>
              <Input id={`${fieldId}-note`} value={deliveryNote} onChange={(event) => update({ deliveryNote: event.target.value })} placeholder={t('receiptPage.deliveryNotePlaceholder')} />
            </Field>
          </div>

          <StockItemPicker id={`${fieldId}-search`} inputRef={pickerRef} items={items} disabled={!warehouseName} hint={t('receiptPage.pickerHint')} onAdd={addItem}
            describe={(item) => {
              if (selected.has(item.name)) return t('stockPage.alreadyAdded')
              const { options, defaultUom } = purchaseUomOptions(item)
              const uom = options.find((option) => option.uom === defaultUom) ?? options[0]
              const suggestion = uom ? suggestPurchaseRate(prices, item.name, uom, item.stock_uom || uom.uom, supplier, today) : null
              return suggestion ? `${money(suggestion.rate)} / ${uom.uom}` : t('receiptPage.noPrice')
            }} />

          {lines.length > 0 ? <div ref={tableRef}><ResponsiveTable label={t('receiptPage.lines')} columns={columns}>
            {lines.map((line) => {
              const details = lineDetails(line)
              return <ResponsiveRow key={line.itemCode}>
                <ResponsiveCell role="primary"><ProductCellContent name={details.label} code={line.itemCode} detail={details.suggestion?.supplier ? t('receiptPage.priceFrom', { supplier: details.suggestion.supplier }) : undefined} /></ResponsiveCell>
                <ResponsiveCell label={t('receiptPage.accepted')}><Input data-qty-input={line.itemCode} type="number" inputMode="decimal" min="0" step="any" value={line.qty} onChange={(event) => updateLine(line.itemCode, { qty: event.target.value })} aria-label={t('receiptPage.qtyFor', { product: details.label })} {...lineKeys((value) => updateLine(line.itemCode, { qty: value }))} /></ResponsiveCell>
                {trackRejected && <ResponsiveCell label={t('receiptPage.rejected')}><Input type="number" inputMode="decimal" min="0" step="any" value={line.rejectedQty} onChange={(event) => updateLine(line.itemCode, { rejectedQty: event.target.value })} aria-label={t('receiptPage.rejectedFor', { product: details.label })} {...lineKeys((value) => updateLine(line.itemCode, { rejectedQty: value }))} /></ResponsiveCell>}
                <ResponsiveCell label={t('receiptPage.uom')}>{details.options.length > 1
                  ? <Select value={details.uom.uom} onValueChange={(value) => updateLine(line.itemCode, { uom: value, rate: null })}><SelectTrigger className="stock-select-trigger" aria-label={t('receiptPage.uomFor', { product: details.label })}><SelectValue /></SelectTrigger><SelectContent>{details.options.map((option) => <SelectItem key={option.uom} value={option.uom}>{option.conversionFactor === 1 ? option.uom : `${option.uom} (×${quantity(option.conversionFactor)})`}</SelectItem>)}</SelectContent></Select>
                  : <span className="stock-static-value">{details.uom.uom || t('stockPage.noUom')}</span>}</ResponsiveCell>
                <ResponsiveCell label={t('receiptPage.unitCost')}><Input type="number" inputMode="decimal" min="0" step="any" value={details.rate} placeholder={t('receiptPage.costPlaceholder')} onChange={(event) => updateLine(line.itemCode, { rate: event.target.value })} aria-label={t('receiptPage.costFor', { product: details.label })} {...lineKeys((value) => updateLine(line.itemCode, { rate: value }))} /></ResponsiveCell>
                <ResponsiveCell label={t('receiptPage.amount')} align="end" role="emphasis">{money(details.amount)}</ResponsiveCell>
                <ResponsiveCell role="actions"><IconButton label={t('stockPage.removeProduct', { product: details.label })} type="button" icon={<Trash2 aria-hidden="true" />} onClick={() => update((current) => ({ lines: current.lines.filter((candidate) => candidate.itemCode !== line.itemCode) }))} /></ResponsiveCell>
              </ResponsiveRow>
            })}
          </ResponsiveTable></div> : <LinesEmpty title={t(warehouseName ? 'receiptPage.noLinesTitle' : 'receiptPage.chooseWarehouseTitle')} description={t(warehouseName ? 'receiptPage.noLines' : 'receiptPage.chooseWarehouseFirst')} />}
        </CardContent>
        {lines.length > 0 && <CardFooter className="stock-document-summary"><span>{t('receiptPage.summary', { count: ready.length })}</span><strong>{t('receiptPage.total', { total: money(total) })}</strong></CardFooter>}
      </Card>

      <AdvancedOptionsCard open={advancedOpen} onOpenChange={setAdvancedOpen} description={t('receiptPage.advancedDescription')}>
        <FieldGroup className="settings-fields">
          <PostingDateFields id={fieldId} enabled={customPosting} onEnabledChange={setCustomPosting} posting={posting} onPostingChange={setPosting} />
          <Field orientation="horizontal">
            <FieldContent><FieldLabel htmlFor={`${fieldId}-rejected`}>{t('receiptPage.trackRejected')}</FieldLabel><FieldDescription>{t('receiptPage.trackRejectedDescription')}</FieldDescription></FieldContent>
            <Switch id={`${fieldId}-rejected`} checked={trackRejected} onCheckedChange={setTrackRejected} />
          </Field>
          {trackRejected && <Field orientation="responsive">
            <FieldContent><FieldLabel htmlFor={`${fieldId}-rejected-warehouse`}>{t('receiptPage.rejectedWarehouse')}</FieldLabel><FieldDescription>{t('receiptPage.rejectedWarehouseDescription')}</FieldDescription></FieldContent>
            <Select value={rejectedWarehouse || undefined} onValueChange={setRejectedWarehouse}>
              <SelectTrigger id={`${fieldId}-rejected-warehouse`} className="settings-control"><SelectValue placeholder={t('stockPage.warehousePlaceholder')} /></SelectTrigger>
              <SelectContent>{warehouses.filter((candidate) => candidate.name !== warehouseName && (!company || candidate.company === company)).map((candidate) => <SelectItem key={candidate.name} value={candidate.name}>{candidate.warehouse_name || candidate.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>}
          <Field>
            <FieldLabel htmlFor={`${fieldId}-notes`}>{t('stockPage.notes')}</FieldLabel>
            <Input id={`${fieldId}-notes`} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder={t('stockPage.notesPlaceholder')} />
          </Field>
          <FieldDescription>{t('receiptPage.purchaseOrderNote')}</FieldDescription>
        </FieldGroup>
      </AdvancedOptionsCard>

      {draftName && error && <Notice tone="warning">{t('stockPage.draftPending', { name: draftName })}</Notice>}
      {error && <Notice>{error}</Notice>}
      <StockSubmitBar backPath={backPath} busy={busy} disabled={!warehouse || !supplier || !ready.length} onSubmit={submit} label={draftName ? t('stockPage.retrySubmit', { name: draftName }) : t('receiptPage.submit', { count: ready.length })} />
    </form>
  </section>
}
