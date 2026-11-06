import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'
import { Button, Field, Input, Notice, Spinner } from './ui'
import { catalogErrorMessage } from './catalog-guidance'
import { bulkPriceSnapshotMatches, exportBulkPriceCsv, makeFixedPriceChanges, makePercentagePriceChanges, parseBulkPriceCsv, type BulkPriceChange } from '../lib/bulk-pricing'
import { patchItemPriceCatalog } from '../lib/price-cache'
import type { ItemPrice, ItemPriceCatalogCache } from '../lib/types'
import { queryKeys } from '../lib/query-keys'
import { createErpNextClient } from '../lib/erpnext'
import { useQueryClient } from '@tanstack/react-query'

type Client = ReturnType<typeof createErpNextClient>
type Operation = 'fixed' | 'percent' | 'csv'
type Preview = { operation: Operation; changes: BulkPriceChange[] }
type BulkResult = { updated: number; failures: Array<{ name: string; reason: string }> }

function displayRate(rate: number, locale: string) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 8 }).format(rate)
}

export function PriceBulkToolbar({ client, profileId, prices, selectedPrices, onSelectAll, onClearSelection, onSelectionFinished, onRefresh }: {
  client: Client
  profileId: string
  prices: ItemPrice[]
  selectedPrices: ItemPrice[]
  onSelectAll: () => void
  onClearSelection: () => void
  onSelectionFinished: (names: string[]) => void
  onRefresh: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [operation, setOperation] = useState<Exclude<Operation, 'csv'> | null>(null)
  const [amount, setAmount] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [inputError, setInputError] = useState('')
  const [isApplying, setIsApplying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<BulkResult | null>(null)
  const currencySet = new Set(selectedPrices.map((price) => price.currency || 'MXN'))
  const hasMixedCurrencies = currencySet.size > 1

  function startOperation(next: Exclude<Operation, 'csv'>) {
    setOperation(next)
    setAmount('')
    setInputError('')
    setResult(null)
  }

  function prepareNumericPreview(event: React.FormEvent) {
    event.preventDefault()
    const value = Number(amount)
    if (!amount.trim() || !Number.isFinite(value) || value < 0 && operation === 'fixed') {
      setInputError(t('bulkPricing.invalidFixed'))
      return
    }
    if (operation === 'percent' && value <= -100) {
      setInputError(t('bulkPricing.invalidPercent'))
      return
    }
    if (!selectedPrices.length) return
    const changes = operation === 'fixed' ? makeFixedPriceChanges(selectedPrices, value) : makePercentagePriceChanges(selectedPrices, value)
    if (!changes.length) { setInputError(t('bulkPricing.noChanges')); return }
    setInputError('')
    setPreview({ operation: operation ?? 'fixed', changes })
  }

  async function readImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setInputError('')
    setResult(null)
    if (file.size > 10 * 1024 * 1024) { setInputError(t('bulkPricing.fileTooLarge')); return }
    try {
      const parsed = parseBulkPriceCsv(await file.text(), prices)
      if (parsed.errors.length) { setInputError(parsed.errors.slice(0, 12).join(' ')); return }
      if (!parsed.changes.length) { setInputError(t('bulkPricing.noChanges')); return }
      setOperation(null)
      setPreview({ operation: 'csv', changes: parsed.changes })
    } catch {
      setInputError(t('bulkPricing.csvReadError'))
    }
  }

  function exportSelected() {
    const blob = new Blob([exportBulkPriceCsv(selectedPrices)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `erpnext-item-prices-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function applyPreview() {
    if (!preview || isApplying) return
    setIsApplying(true)
    setProgress(0)
    setInputError('')
    const failures: BulkResult['failures'] = []
    let updated = 0
    const failedNames = new Set<string>()

    for (const [index, change] of preview.changes.entries()) {
      setProgress(index + 1)
      let current: ItemPrice
      try {
        current = await client.getDocument<ItemPrice>('Item Price', change.price.name)
        if (!bulkPriceSnapshotMatches(change.price, current)) {
          failures.push({ name: change.price.name, reason: t('bulkPricing.changed') })
          failedNames.add(change.price.name)
          continue
        }

        try {
          await client.updateDocument<Record<string, unknown>>('Item Price', change.price.name, { price_list_rate: change.nextRate })
        } catch (updateError) {
          let observed: ItemPrice
          try { observed = await client.getDocument<ItemPrice>('Item Price', change.price.name) }
          catch { throw updateError }
          const actualRate = Number(observed.price_list_rate ?? 0)
          if (actualRate !== change.nextRate) throw new Error(t('bulkPricing.conflict'))
        }

        const verified = await client.getDocument<ItemPrice>('Item Price', change.price.name)
        const actualRate = Number(verified.price_list_rate ?? 0)
        const expectedRate = change.nextRate
        const updatedPrice = { ...change.price, ...verified, price_list_rate: actualRate }
        let cacheError = false
        try {
          const cache = await patchItemPriceCatalog(profileId, updatedPrice)
          if (cache) queryClient.setQueryData(queryKeys.catalog.price(profileId), cache)
          else cacheError = true
        } catch { cacheError = true }
        if (cacheError) {
          queryClient.setQueryData<ItemPriceCatalogCache>(queryKeys.catalog.price(profileId), (cache) => cache && ({ ...cache, prices: cache.prices.map((price) => price.name === updatedPrice.name ? updatedPrice : price) }))
          failures.push({ name: change.price.name, reason: t('pricesPage.cacheUpdateError') })
          failedNames.add(change.price.name)
        } else if (actualRate !== expectedRate) {
          failures.push({ name: change.price.name, reason: t('bulkPricing.serverAdjusted', { value: displayRate(actualRate, i18n.language) }) })
          failedNames.add(change.price.name)
        } else updated += 1
      } catch (error) {
        failures.push({ name: change.price.name, reason: catalogErrorMessage(error, t) })
        failedNames.add(change.price.name)
      }
    }

    setPreview(null)
    setOperation(null)
    setResult({ updated, failures })
    onSelectionFinished(Array.from(failedNames))
    setIsApplying(false)
  }

  return <section className="bulk-pricing-toolbar" aria-label={t('bulkPricing.title')}>
    <div className="flex flex-wrap items-center gap-2">
      <strong>{t('bulkPricing.selectionCount', { count: selectedPrices.length })}</strong>
      <Button type="button" size="compact" variant="secondary" onClick={onSelectAll} disabled={prices.length === selectedPrices.length || isApplying}>{t('bulkPricing.selectAll', { count: prices.length })}</Button>
      <Button type="button" size="compact" variant="secondary" onClick={() => startOperation('fixed')} disabled={!selectedPrices.length || hasMixedCurrencies || isApplying}>{t('bulkPricing.setFixed')}</Button>
      <Button type="button" size="compact" variant="secondary" onClick={() => startOperation('percent')} disabled={!selectedPrices.length || isApplying}>{t('bulkPricing.applyPercent')}</Button>
      <Button type="button" size="compact" variant="secondary" onClick={exportSelected} disabled={!selectedPrices.length || isApplying}>{t('bulkPricing.export')}</Button>
      <Button type="button" size="compact" variant="secondary" onClick={() => fileInput.current?.click()} disabled={isApplying}>{t('bulkPricing.import')}</Button>
      <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" aria-label={t('bulkPricing.import')} onChange={readImportFile} />
      <Button type="button" size="compact" variant="secondary" onClick={onClearSelection} disabled={!selectedPrices.length || isApplying}>{t('bulkPricing.clearSelection')}</Button>
    </div>
    {hasMixedCurrencies && selectedPrices.length > 0 && <p className="mt-2 text-sm text-[var(--color-muted)]">{t('bulkPricing.mixedCurrencies')}</p>}
    {operation && <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={prepareNumericPreview}>
      <Field label={operation === 'fixed' ? t('bulkPricing.fixedRate') : t('bulkPricing.percentChange')}><Input autoFocus type="number" min={operation === 'fixed' ? '0' : undefined} step="any" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
      <Button type="submit" disabled={!selectedPrices.length || isApplying}>{t('bulkPricing.preview')}</Button>
      <Button type="button" variant="secondary" onClick={() => { setOperation(null); setInputError('') }}>{t('common.cancel')}</Button>
    </form>}
    {inputError && <div className="mt-3"><Notice>{inputError}</Notice></div>}
    {isApplying && <div className="mt-3" role="status" aria-live="polite"><Notice tone="info"><span className="flex items-center gap-2"><Spinner />{t('bulkPricing.progress', { current: progress, total: preview?.changes.length ?? 0 })}</span></Notice></div>}
    {result && <div className="mt-3"><Notice tone={result.failures.length ? 'warning' : 'info'}><div className="grid gap-2"><strong>{t('bulkPricing.result', { updated: result.updated, failed: result.failures.length })}</strong>{result.failures.length > 0 && <><ul className="bulk-pricing-failures">{result.failures.slice(0, 10).map((failure) => <li key={failure.name}><strong>{failure.name}:</strong> {failure.reason}</li>)}</ul>{result.failures.length > 10 && <span>{t('bulkPricing.moreFailures', { count: result.failures.length - 10 })}</span>}<Button className="w-fit" type="button" size="compact" variant="secondary" onClick={onRefresh}>{t('pricesPage.refresh')}</Button></>}</div></Notice></div>}

    <AlertDialog open={Boolean(preview)} onOpenChange={(open) => { if (!open && !isApplying) setPreview(null) }}>
      <AlertDialogContent className="bulk-pricing-dialog">
        <AlertDialogHeader><AlertDialogTitle>{t(preview?.operation === 'csv' ? 'bulkPricing.importPreviewTitle' : 'bulkPricing.previewTitle')}</AlertDialogTitle><AlertDialogDescription>{t('bulkPricing.previewDescription', { count: preview?.changes.length ?? 0 })}</AlertDialogDescription></AlertDialogHeader>
        <div className="bulk-pricing-preview-list" role="region" aria-label={t('bulkPricing.previewList')} tabIndex={0}>
          <ul>{preview?.changes.slice(0, 50).map(({ price, nextRate }) => <li key={price.name}><strong>{price.item_code || price.name}</strong><span>{price.price_list} · {price.currency || 'MXN'} · {price.uom || '—'}</span><span>{displayRate(Number(price.price_list_rate ?? 0), i18n.language)} → {displayRate(nextRate, i18n.language)}</span></li>)}</ul>
          {(preview?.changes.length ?? 0) > 50 && <p>{t('bulkPricing.previewMore', { count: (preview?.changes.length ?? 0) - 50 })}</p>}
        </div>
        <AlertDialogFooter><AlertDialogCancel asChild><Button type="button" variant="secondary" disabled={isApplying}>{t('common.cancel')}</Button></AlertDialogCancel><AlertDialogAction asChild><Button type="button" onClick={(event) => { event.preventDefault(); void applyPreview() }} disabled={isApplying}>{isApplying ? <><Spinner />{t('bulkPricing.saving')}</> : t('bulkPricing.confirm', { count: preview?.changes.length ?? 0 })}</Button></AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
}
