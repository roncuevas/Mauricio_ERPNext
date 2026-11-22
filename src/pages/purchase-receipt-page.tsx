import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Trash2 } from 'lucide-react'
import { Button, ButtonLink, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, IconButton, Input, Notice, PageHeader, Spinner } from '../components/ui'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '../components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Switch } from '../components/ui/switch'
import { EntityCombobox } from '../components/entity-combobox'
import { StockItemPicker } from '../components/stock-item-picker'
import { useStockItems } from '../components/use-stock-items'
import { createErpNextClient } from '../lib/erpnext'
import { purchaseReceiptPayload, purchaseUomOptions, suggestPurchaseRate, type RateSuggestion } from '../lib/purchase-receipt'
import { localPostingNow, refreshStockBins, saveAndSubmit, stockErrorMessage, stockReturnQuery } from '../lib/stock'
import { writeStockCache } from '../lib/stock-cache'
import { readSupplierCatalog } from '../lib/supplier-cache'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { queryKeys } from '../lib/query-keys'

type Client = ReturnType<typeof createErpNextClient>
/** `rate: null` follows the suggested cost; typing a value pins it. */
type ReceiptLine = { itemCode: string; qty: string; rejectedQty: string; uom: string; rate: string | null }

const quantity = (value: number) => value.toLocaleString('es-MX', { maximumFractionDigits: 3 })

export function PurchaseReceiptPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate(); const queryClient = useQueryClient(); const [searchParams] = useSearchParams(); const fieldId = useId()
  const { cache, items, itemsByName, warehouses, isLoading } = useStockItems(profileId)
  const suppliersQuery = useQuery({ queryKey: queryKeys.catalog.supplier(profileId), queryFn: () => readSupplierCatalog(profileId), staleTime: Infinity })
  const pricesQuery = useQuery(catalogQueryOptions.price(profileId))
  const suppliers = useMemo(() => (suppliersQuery.data?.suppliers ?? []).filter((supplier) => !supplier.disabled), [suppliersQuery.data?.suppliers])
  const prices = useMemo(() => pricesQuery.data?.prices ?? [], [pricesQuery.data?.prices])
  const money = (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: currency || 'MXN' })

  const [supplier, setSupplier] = useState(''); const [warehouseName, setWarehouseName] = useState(searchParams.get('warehouse') ?? '')
  const [deliveryNote, setDeliveryNote] = useState(''); const [lines, setLines] = useState<ReceiptLine[]>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [customPosting, setCustomPosting] = useState(false); const [posting, setPosting] = useState(localPostingNow)
  const [trackRejected, setTrackRejected] = useState(false); const [rejectedWarehouse, setRejectedWarehouse] = useState(''); const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [draftName, setDraftName] = useState('')
  const linesRef = useRef<HTMLDivElement>(null); const pendingFocus = useRef('')

  const warehouse = warehouses.find((candidate) => candidate.name === warehouseName)
  const company = warehouse?.company ?? ''
  const currency = cache?.companies.find((candidate) => candidate.name === company)?.default_currency ?? ''
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
    const input = linesRef.current?.querySelector<HTMLInputElement>(`[data-qty-input="${CSS.escape(itemCode)}"]`)
    if (input) { input.focus(); pendingFocus.current = '' }
  }, [lines])

  function addItem(itemCode: string) {
    pendingFocus.current = itemCode
    if (selected.has(itemCode)) { setLines((current) => [...current]); return }
    setLines((current) => [...current, { itemCode, qty: '', rejectedQty: '', uom: purchaseUomOptions(itemsByName.get(itemCode)).defaultUom, rate: null }])
  }

  const updateLine = (itemCode: string, patch: Partial<ReceiptLine>) => setLines((current) => current.map((line) => line.itemCode === itemCode ? { ...line, ...patch } : line))
  const backPath = `/stock${stockReturnQuery(searchParams) ? `?${stockReturnQuery(searchParams)}` : ''}`

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (!warehouse || !company || !cache) throw new Error(t('stockPage.missingCompany'))
      const payload = purchaseReceiptPayload({
        company, currency, supplier, warehouse: warehouse.name, rejectedWarehouse: trackRejected ? rejectedWarehouse : undefined,
        posting: customPosting ? posting : undefined, supplierDeliveryNote: deliveryNote, remarks,
        lines: ready.map((line) => {
          const details = lineDetails(line)
          return { itemCode: line.itemCode, itemName: details.label, qty: Number(line.qty) || 0, rejectedQty: trackRejected ? Number(line.rejectedQty) || 0 : 0, uom: details.uom.uom, stockUom: details.item?.stock_uom || details.uom.uom, conversionFactor: details.uom.conversionFactor, rate: details.rate.trim() === '' ? Number.NaN : Number(details.rate) }
        }),
      })
      const name = await saveAndSubmit(client, 'Purchase Receipt', payload, draftName, setDraftName)
      setDraftName('')
      const codes = ready.map((line) => line.itemCode)
      let next = await refreshStockBins(client, cache, warehouse.name, codes)
      if (trackRejected && rejectedWarehouse && ready.some((line) => Number(line.rejectedQty) > 0)) next = await refreshStockBins(client, next, rejectedWarehouse, codes)
      queryClient.setQueryData(queryKeys.catalog.stock(profileId), await writeStockCache(next))
      navigate(backPath, { state: { stockNotice: t('receiptPage.submitted', { name, count: ready.length, supplier }) } })
    } catch (reason) { setError(stockErrorMessage(reason)) } finally { setBusy(false) }
  }

  if (isLoading || suppliersQuery.isLoading) return <div className="p-6 muted"><Spinner /> {t('stockPage.loadingCatalog')}</div>
  if (!cache) return <section><PageHeader title={t('receiptPage.title')} /><Notice>{t('stockPage.downloadFirst')}</Notice><ButtonLink to="/stock" variant="secondary">{t('stockPage.backToStock')}</ButtonLink></section>

  return <section className="reconciliation-workspace">
    <PageHeader title={t('receiptPage.title')} description={t('receiptPage.description')} action={<ButtonLink to={backPath} variant="secondary">{t('stockPage.backToStock')}</ButtonLink>} />
    <form onSubmit={submit} className="reconciliation-form">
      <Card className="settings-card">
        <CardHeader><CardTitle as="h2">{t('receiptPage.receiveTitle')}</CardTitle><CardDescription>{t('receiptPage.receiveDescription')}</CardDescription></CardHeader>
        <CardContent className="reconciliation-content">
          <div className="receipt-header-fields">
            <Field>
              <FieldLabel>{t('receiptPage.supplier')}</FieldLabel>
              <EntityCombobox ariaLabel={t('receiptPage.supplier')} value={supplier} onValueChange={setSupplier} required placeholder={t('receiptPage.selectSupplier')} searchPlaceholder={t('receiptPage.searchSupplier')} options={suppliers.map((candidate) => ({ value: candidate.name, label: candidate.supplier_name || candidate.name, searchText: candidate.name }))} />
              {!suppliers.length && <FieldDescription>{t('receiptPage.noSuppliers')} <ButtonLink to="/suppliers" variant="secondary" size="compact">{t('receiptPage.openSuppliers')}</ButtonLink></FieldDescription>}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-warehouse`}>{t('receiptPage.warehouse')}</FieldLabel>
              <Select value={warehouseName || undefined} onValueChange={setWarehouseName} required>
                <SelectTrigger id={`${fieldId}-warehouse`} className="stock-select-trigger"><SelectValue placeholder={t('stockPage.warehousePlaceholder')} /></SelectTrigger>
                <SelectContent align="start">{warehouses.map((candidate) => <SelectItem key={candidate.name} value={candidate.name}>{candidate.warehouse_name || candidate.name}</SelectItem>)}</SelectContent>
              </Select>
              {company && <FieldDescription>{t('stockPage.companyOf', { company })}</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-note`}>{t('receiptPage.deliveryNote')}</FieldLabel>
              <Input id={`${fieldId}-note`} value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} placeholder={t('receiptPage.deliveryNotePlaceholder')} />
            </Field>
          </div>

          <StockItemPicker id={`${fieldId}-search`} items={items} disabled={!warehouseName} hint={t('receiptPage.pickerHint')} onAdd={addItem}
            describe={(item) => {
              if (selected.has(item.name)) return t('stockPage.alreadyAdded')
              const { options, defaultUom } = purchaseUomOptions(item)
              const uom = options.find((option) => option.uom === defaultUom) ?? options[0]
              const suggestion = uom ? suggestPurchaseRate(prices, item.name, uom, item.stock_uom || uom.uom, supplier, today) : null
              return suggestion ? `${money(suggestion.rate)} / ${uom.uom}` : t('receiptPage.noPrice')
            }} />

          {lines.length > 0 ? <div className={`reconciliation-lines receipt-lines${trackRejected ? ' has-rejected' : ''}`} ref={linesRef} role="list" aria-label={t('receiptPage.lines')}>
            <div className="reconciliation-line reconciliation-line-head" aria-hidden="true"><span>{t('stockPage.product')}</span><span>{t('receiptPage.accepted')}</span>{trackRejected && <span>{t('receiptPage.rejected')}</span>}<span>UOM</span><span>{t('receiptPage.unitCost')}</span><span>{t('receiptPage.amount')}</span><span /></div>
            {lines.map((line) => {
              const details = lineDetails(line)
              return <div key={line.itemCode} className="reconciliation-line" role="listitem">
                <div className="reconciliation-line-product"><strong>{details.label}</strong><small>{line.itemCode}{details.suggestion?.supplier ? ` · ${t('receiptPage.priceFrom', { supplier: details.suggestion.supplier })}` : ''}</small></div>
                <label className="reconciliation-line-count"><small>{t('receiptPage.accepted')}</small><Input data-qty-input={line.itemCode} type="number" inputMode="decimal" min="0" step="any" value={line.qty} onChange={(event) => updateLine(line.itemCode, { qty: event.target.value })} aria-label={t('receiptPage.qtyFor', { product: details.label })} /></label>
                {trackRejected && <label className="reconciliation-line-count"><small>{t('receiptPage.rejected')}</small><Input type="number" inputMode="decimal" min="0" step="any" value={line.rejectedQty} onChange={(event) => updateLine(line.itemCode, { rejectedQty: event.target.value })} aria-label={t('receiptPage.rejectedFor', { product: details.label })} /></label>}
                <label className="reconciliation-line-uom"><small>UOM</small>{details.options.length > 1
                  ? <Select value={details.uom.uom} onValueChange={(value) => updateLine(line.itemCode, { uom: value, rate: null })}><SelectTrigger className="stock-select-trigger" aria-label={t('receiptPage.uomFor', { product: details.label })}><SelectValue /></SelectTrigger><SelectContent>{details.options.map((option) => <SelectItem key={option.uom} value={option.uom}>{option.conversionFactor === 1 ? option.uom : `${option.uom} (×${quantity(option.conversionFactor)})`}</SelectItem>)}</SelectContent></Select>
                  : <span className="receipt-uom">{details.uom.uom || t('stockPage.noUom')}</span>}</label>
                <label className="reconciliation-line-valuation"><small>{t('receiptPage.unitCost')}</small><Input type="number" inputMode="decimal" min="0" step="any" value={details.rate} placeholder={t('receiptPage.costPlaceholder')} onChange={(event) => updateLine(line.itemCode, { rate: event.target.value })} aria-label={t('receiptPage.costFor', { product: details.label })} /></label>
                <div className="reconciliation-line-system"><small>{t('receiptPage.amount')}</small>{money(details.amount)}</div>
                <IconButton label={t('stockPage.removeProduct', { product: details.label })} type="button" icon={<Trash2 aria-hidden="true" />} onClick={() => setLines((current) => current.filter((candidate) => candidate.itemCode !== line.itemCode))} />
              </div>
            })}
          </div> : <p className="reconciliation-empty muted">{warehouseName ? t('receiptPage.noLines') : t('receiptPage.chooseWarehouseFirst')}</p>}
        </CardContent>
        {lines.length > 0 && <CardFooter className="reconciliation-summary" role="status">{t('receiptPage.summary', { count: ready.length, total: money(total) })}</CardFooter>}
      </Card>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} asChild>
        <Card className="settings-card reconciliation-advanced">
          <CardHeader>
            <CollapsibleTrigger asChild><button type="button" className="reconciliation-advanced-trigger"><span><CardTitle as="h2">{t('stockPage.advancedTitle')}</CardTitle><CardDescription>{t('receiptPage.advancedDescription')}</CardDescription></span><ChevronDown aria-hidden="true" /></button></CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent><FieldGroup className="settings-fields">
              <Field orientation="horizontal">
                <FieldContent><FieldLabel htmlFor={`${fieldId}-posting`}>{t('stockPage.customPosting')}</FieldLabel><FieldDescription>{t('stockPage.customPostingDescription')}</FieldDescription></FieldContent>
                <Switch id={`${fieldId}-posting`} checked={customPosting} onCheckedChange={(checked) => { setCustomPosting(checked); if (checked) setPosting(localPostingNow()) }} />
              </Field>
              {customPosting && <div className="reconciliation-posting">
                <Field><FieldLabel htmlFor={`${fieldId}-date`}>{t('stockPage.date')}</FieldLabel><Input id={`${fieldId}-date`} type="date" value={posting.date} max={today} onChange={(event) => setPosting((current) => ({ ...current, date: event.target.value }))} required /></Field>
                <Field><FieldLabel htmlFor={`${fieldId}-time`}>{t('stockPage.time')}</FieldLabel><Input id={`${fieldId}-time`} type="time" value={posting.time.slice(0, 5)} onChange={(event) => setPosting((current) => ({ ...current, time: `${event.target.value}:00` }))} required /></Field>
              </div>}
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
              <p className="muted text-sm">{t('receiptPage.purchaseOrderNote')}</p>
            </FieldGroup></CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {draftName && error && <Notice tone="warning">{t('stockPage.draftPending', { name: draftName })}</Notice>}
      {error && <Notice>{error}</Notice>}
      <div className="stock-form-actions">
        <ButtonLink to={backPath} variant="secondary">{t('stockPage.cancel')}</ButtonLink>
        <Button type="submit" loading={busy} disabled={busy || !warehouse || !supplier || !ready.length}>{busy ? t('stockPage.sending') : draftName ? t('stockPage.retrySubmit', { name: draftName }) : t('receiptPage.submit', { count: ready.length })}</Button>
      </div>
    </form>
  </section>
}
