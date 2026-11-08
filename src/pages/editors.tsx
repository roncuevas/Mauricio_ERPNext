import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MetadataDocEditor } from '../components/metadata-editor'
import { Button, ButtonLink, Notice, PageHeader, Spinner } from '../components/ui'
import { UomEditor, type UomEditorValues } from '../components/uom-editor'
import { createErpNextClient } from '../lib/erpnext'
import { patchItemCatalog, readItemCatalog, writeItemCatalog } from '../lib/item-cache'
import { patchVariantCatalog, readVariantCatalog } from '../lib/variant-cache'
import { readUomCatalog, writeUomCatalog } from '../lib/uom-cache'
import { syncUomCatalog, UOM_CACHE_TTL_MS } from '../lib/catalog-sync'
import { buildItemUomRows, itemUomRowsMatch } from '../lib/uom-conversions'
import type { CachedItem, VariantItem } from '../lib/types'
import { queryKeys } from '../lib/query-keys'

type Client = ReturnType<typeof createErpNextClient>

export function VariantEditorPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const { name } = useParams<{ name: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isNew = !name || name === 'new'
  return <section><PageHeader title={isNew ? t("editorsPage.newVariant") : t("editorsPage.editProduct")} description={isNew ? t("editorsPage.variantDescriptionNew") : t("editorsPage.variantDescriptionEdit", { name })} action={!isNew && name ? <ButtonLink variant="secondary" to={`/items/${encodeURIComponent(name)}/uoms`}>{t("editorsPage.configureUom")}</ButtonLink> : undefined} /><VariantEditor client={client} profileId={profileId} name={isNew ? null : name} initialTemplate={searchParams.get('template') ?? ''} onClose={() => navigate('/variants')} /></section>
}

function VariantEditor({ client, profileId, name, initialTemplate, onClose }: { client: Client; profileId: string; name: string | null; initialTemplate: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const meta = useQuery({ queryKey: queryKeys.metadata.doctype(profileId, 'Item'), queryFn: () => client.getDocTypeMeta('Item') })
  async function updateVariantCache(saved: Record<string, unknown>) {
    const savedName = String(saved.name ?? name ?? '')
    const cache = await readVariantCatalog(profileId)
    if (!cache || !savedName) return
    const previous = cache.items.find((item) => item.name === savedName)
    const next = await patchVariantCatalog(profileId, { ...previous, ...saved, name: savedName } as VariantItem)
    if (next) queryClient.setQueryData(queryKeys.catalog.variant(profileId), next)
  }
  if (meta.isError) return <Notice>{meta.error.message}</Notice>
  if (meta.isPending) return <Spinner />
  return <MetadataDocEditor client={client} profileId={profileId} doctype="Item" name={name} initialValues={{ variant_of: initialTemplate, has_variants: 0 }} onClose={onClose} onSaved={updateVariantCache} fields={meta.data.fields} />
}

export function ItemEditorPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const isNew = !name || name === 'new'
  const queryClient = useQueryClient()
  const createdItemRef = useRef<CachedItem | null>(null)
  const [createdItem, setCreatedItem] = useState<CachedItem | null>(null)
  const meta = useQuery({ queryKey: queryKeys.metadata.doctype(profileId, 'Item'), queryFn: () => client.getDocTypeMeta('Item') })
  const basicFieldNames = ['item_code', 'item_name', 'item_group', 'stock_uom']

  if (createdItem) return <section><PageHeader title={t('editorsPage.createdTitle')} description={t('editorsPage.createdDescription', { name: createdItem.item_name || createdItem.name })} /><div className="card flex flex-wrap items-center justify-between gap-4 p-5"><div><strong>{createdItem.item_name || createdItem.name}</strong><p className="muted">{createdItem.name}</p></div><div className="flex flex-wrap gap-2"><ButtonLink to={`/prices/manage/${encodeURIComponent(createdItem.name)}?returnTo=%2Fitems`}>{t('editorsPage.addPrice')}</ButtonLink><ButtonLink variant="secondary" to="/items">{t('editorsPage.backToProducts')}</ButtonLink></div></div></section>

  return <section><PageHeader title={isNew ? t("editorsPage.newProduct") : t("editorsPage.editProduct")} description={isNew ? t("editorsPage.productDescriptionNew") : t("editorsPage.productDescriptionEdit", { name })} action={!isNew && name ? <ButtonLink variant="secondary" to={`/items/${encodeURIComponent(name)}/uoms`}>{t("editorsPage.configureUom")}</ButtonLink> : undefined} />{meta.isError && <Notice>{meta.error.message}</Notice>}{meta.isPending ? <Spinner /> : <MetadataDocEditor client={client} profileId={profileId} doctype="Item" name={isNew ? null : name} fields={meta.data?.fields ?? []} basicFieldNames={isNew ? basicFieldNames : undefined} onClose={() => { if (isNew && createdItemRef.current) { setCreatedItem(createdItemRef.current); return } navigate('/items') }} onSaved={async (saved) => {
    const savedName = String(saved.name ?? name ?? '')
    if (!savedName) return
    const savedItem = { ...saved, name: savedName } as CachedItem
    if (isNew) createdItemRef.current = savedItem
    const currentItems = await readItemCatalog(profileId)
    const nextItems = currentItems
      ? { ...currentItems, updatedAt: new Date().toISOString(), locallyModified: true, items: [...currentItems.items.filter((item) => item.name !== savedName), savedItem] }
      : null
    if (nextItems) {
      await writeItemCatalog(nextItems)
      queryClient.setQueryData(queryKeys.catalog.item(profileId), nextItems)
    }
    queryClient.setQueryData(queryKeys.item.detail(profileId, savedName), savedItem)
    const currentVariants = await readVariantCatalog(profileId)
    if (currentVariants) {
      const previous = currentVariants.items.find((item) => item.name === savedName)
      const nextVariants = await patchVariantCatalog(profileId, { ...previous, ...savedItem, name: savedName } as VariantItem)
      if (nextVariants) queryClient.setQueryData(queryKeys.catalog.variant(profileId), nextVariants)
    } else await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.variant(profileId) })
  }} />}</section>
}

function readUomValues(document: Record<string, unknown>): UomEditorValues {
  const stockUom = String(document.stock_uom ?? '')
  const rawUoms = Array.isArray(document.uoms) ? document.uoms : []
  const conversions = rawUoms.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const entry = row as Record<string, unknown>
    const uom = String(entry.uom ?? '')
    const conversionFactor = Number(entry.conversion_factor ?? 0)
    return uom && uom !== stockUom ? [{ uom, conversion_factor: conversionFactor }] : []
  })
  return { stockUom, salesUom: String(document.sales_uom ?? ''), purchaseUom: String(document.purchase_uom ?? ''), conversions }
}

export function UomEditorPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const { name } = useParams<{ name: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const requestedReturnTo = searchParams.get('returnTo')
  const productPath = `/items/${encodeURIComponent(name ?? '')}`
  const returnTo = requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : productPath
  const item = useQuery({ queryKey: queryKeys.item.detail(profileId, name ?? ''), queryFn: () => client.getDocument<Record<string, unknown>>('Item', name!), enabled: Boolean(name), staleTime: 5 * 60 * 1000 })
  const uoms = useQuery({ queryKey: queryKeys.uom.options(profileId), queryFn: async () => { const cached = await readUomCatalog(profileId); const next = await syncUomCatalog(client, profileId, cached); if (next !== cached) await writeUomCatalog(next); return next.uoms }, staleTime: UOM_CACHE_TTL_MS, gcTime: UOM_CACHE_TTL_MS * 2 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [pendingConversions, setPendingConversions] = useState<UomEditorValues | null>(null)
  const values = useMemo(() => item.data ? readUomValues(item.data) : null, [item.data])

  async function updateLocalCaches(document: Record<string, unknown>) {
    const savedName = String(document.name ?? name)
    const savedItem = { ...document, name: savedName }
    const itemCache = await patchItemCatalog(profileId, savedItem as CachedItem)
    const variantCache = await patchVariantCatalog(profileId, savedItem as VariantItem)
    if (itemCache) queryClient.setQueryData(queryKeys.catalog.item(profileId), itemCache)
    if (variantCache) queryClient.setQueryData(queryKeys.catalog.variant(profileId), variantCache)
    queryClient.setQueryData(queryKeys.item.detail(profileId, savedName), savedItem)
    await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.item(profileId) })
    await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.variant(profileId) })
    return savedItem
  }

  async function readAndCacheItem() {
    if (!name) throw new Error(t('editorsPage.uomMissingProduct'))
    const persisted = await client.getDocument<Record<string, unknown>>('Item', name)
    await updateLocalCaches(persisted)
    return persisted
  }

  function finishSave() {
    setPendingConversions(null)
    setRecoveryError('')
    navigate(returnTo)
  }

  async function retryConversions() {
    if (!name || !pendingConversions) return
    setBusy(true)
    setRecoveryError('')
    setError('')
    const expectedRows = buildItemUomRows(pendingConversions.stockUom, pendingConversions.conversions)
    try {
      let persisted = await readAndCacheItem()
      if (String(persisted.stock_uom ?? '') !== pendingConversions.stockUom) {
        setPendingConversions(null)
        setError(t('editorsPage.uomRecoveryConflict'))
        return
      }
      if (itemUomRowsMatch(persisted, expectedRows)) {
        finishSave()
        return
      }
      const resetRows = buildItemUomRows(pendingConversions.stockUom, [])
      if (!itemUomRowsMatch(persisted, resetRows)) {
        setPendingConversions(null)
        setError(t('editorsPage.uomRecoveryConflict'))
        return
      }

      await client.updateDocument<Record<string, unknown>>('Item', name, { uoms: expectedRows })
      persisted = await readAndCacheItem()
      if (String(persisted.stock_uom ?? '') !== pendingConversions.stockUom || !itemUomRowsMatch(persisted, expectedRows)) {
        throw new Error(t('editorsPage.uomConversionsVerificationFailed'))
      }
      finishSave()
    } catch (reason) {
      const details = reason instanceof Error ? reason.message : t('editorsPage.saveUomError')
      try {
        const persisted = await readAndCacheItem()
        if (String(persisted.stock_uom ?? '') !== pendingConversions.stockUom) {
          setPendingConversions(null)
          setError(t('editorsPage.uomRecoveryConflict'))
          return
        }
        if (itemUomRowsMatch(persisted, expectedRows)) {
          finishSave()
          return
        }
        if (!itemUomRowsMatch(persisted, buildItemUomRows(pendingConversions.stockUom, []))) {
          setPendingConversions(null)
          setError(t('editorsPage.uomRecoveryConflict'))
          return
        }
      } catch { /* Keep recovery available when ERPNext cannot be read back. */ }
      setRecoveryError(t('editorsPage.uomConversionsRetryFailed', { error: details }))
    } finally {
      setBusy(false)
    }
  }

  async function save(next: UomEditorValues) {
    if (!name) return
    setBusy(true)
    setError('')
    setRecoveryError('')
    const stockUomChanged = next.stockUom !== values?.stockUom
    const defaults = { sales_uom: next.salesUom || null, purchase_uom: next.purchaseUom || null }

    try {
      if (stockUomChanged) {
        const current = await client.getDocument<Record<string, unknown>>('Item', name)
        if (String(current.stock_uom ?? '') !== values?.stockUom) {
          await updateLocalCaches(current)
          setError(t('editorsPage.uomStockChangedRemotely'))
          return
        }

        const expectedRows = buildItemUomRows(next.stockUom, next.conversions)
        setPendingConversions(next)
        try {
          await client.updateDocument<Record<string, unknown>>('Item', name, { stock_uom: next.stockUom, ...defaults })
        } catch (reason) {
          try {
            const persisted = await readAndCacheItem()
            if (String(persisted.stock_uom ?? '') === next.stockUom) {
              setRecoveryError(t('editorsPage.uomConversionsSavePartial', { error: reason instanceof Error ? reason.message : t('editorsPage.saveUomError') }))
              return
            }
          } catch { /* The update may have reached ERPNext; retry will first verify the persisted base UOM. */ }
          setPendingConversions(null)
          throw reason
        }

        let persisted: Record<string, unknown>
        try {
          persisted = await readAndCacheItem()
        } catch (reason) {
          setRecoveryError(t('editorsPage.uomConversionsSavePartial', { error: reason instanceof Error ? reason.message : t('editorsPage.saveUomError') }))
          return
        }
        if (String(persisted.stock_uom ?? '') !== next.stockUom) {
          setPendingConversions(null)
          setError(t('editorsPage.uomRecoveryConflict'))
          return
        }

        try {
          await client.updateDocument<Record<string, unknown>>('Item', name, { uoms: expectedRows })
          persisted = await readAndCacheItem()
        } catch (reason) {
          const details = reason instanceof Error ? reason.message : t('editorsPage.saveUomError')
          try {
            persisted = await readAndCacheItem()
            if (String(persisted.stock_uom ?? '') === next.stockUom && itemUomRowsMatch(persisted, expectedRows)) {
              finishSave()
              return
            }
          } catch { /* Leave the retry action available when the persisted state is unknown. */ }
          setRecoveryError(t('editorsPage.uomConversionsSavePartial', { error: details }))
          return
        }

        if (String(persisted.stock_uom ?? '') !== next.stockUom || !itemUomRowsMatch(persisted, expectedRows)) {
          setRecoveryError(t('editorsPage.uomConversionsVerificationFailed'))
          return
        }
        finishSave()
        return
      }

      const saved = await client.updateDocument<Record<string, unknown>>('Item', name, { stock_uom: next.stockUom, ...defaults, uoms: next.conversions })
      let persisted: Record<string, unknown> = { ...saved, name }
      try { persisted = await client.getDocument<Record<string, unknown>>('Item', name) } catch { /* Use ERPNext's successful update response to refresh local caches. */ }
      await updateLocalCaches(persisted)
      navigate(returnTo)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('editorsPage.saveUomError'))
    } finally {
      setBusy(false)
    }
  }

  if (!name) return <Notice>{t("editorsPage.uomMissingProduct")}</Notice>
  if (item.isError) return <Notice>{item.error.message}</Notice>
  if (item.isPending || !values) return <Spinner />
  return <section><PageHeader title={t("editorsPage.uomTitle")} description={t("editorsPage.uomDescription")} action={<Button variant="secondary" onClick={() => navigate(returnTo)}>{t("editorsPage.backToProduct")}</Button>} /><UomEditor itemName={name} itemLabel={String(item.data.item_name ?? '')} values={values} uomOptions={uoms.data ?? []} busy={busy} error={recoveryError || error || (uoms.isError ? t("editorsPage.uomSuggestionsError", { error: uoms.error.message }) : '')} onRetryConversions={pendingConversions ? retryConversions : undefined} onSave={save} onCancel={() => navigate(returnTo)} /></section>
}
