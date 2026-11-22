import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, CircleAlert, ImageOff, ImagePlus, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, Badge, Button, ButtonLink, Input, PageHeader, SearchButton, Spinner } from '../components/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { PendingImageEditor } from '../components/pending-image-editor'
import { CatalogErrorNotice } from '../components/catalog-guidance'
import { createErpNextClient } from '../lib/erpnext'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { queryKeys } from '../lib/query-keys'
import { findLowMarginPrices, findPendingItems, type PendingPriceKind } from '../lib/pending-items'
import { readPendingPreferences } from '../lib/pending-preferences'
import { runManagedCacheRefresh } from '../lib/cache-manager'
import { rankProductSearch } from '../lib/search'
import { patchItemCatalog } from '../lib/item-cache'
import { patchVariantCatalog } from '../lib/variant-cache'
import type { ItemCatalogCache, ItemPrice, VariantCatalogCache, VariantItem } from '../lib/types'

type Client = ReturnType<typeof createErpNextClient>
type PendingTab = 'prices' | 'templates' | 'margin' | 'images'

function priceManagementUrl(itemCode: string, price: ItemPrice | undefined, kind: PendingPriceKind, priceList: string) {
  const params = new URLSearchParams({ returnTo: '/pendientes', kind, priceList })
  if (price) params.set('price', price.name)
  if (price?.uom) params.set('uom', price.uom)
  return `/prices/manage/${encodeURIComponent(itemCode)}?${params.toString()}`
}

export function PendingPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<PendingTab>('prices')
  const [imageItem, setImageItem] = useState<VariantItem | null>(null)
  const [refreshMessage, setRefreshMessage] = useState('')
  const [imageSaveMessage, setImageSaveMessage] = useState('')
  const [templateImageItem, setTemplateImageItem] = useState<string | null>(null)
  const preferences = readPendingPreferences(profileId)
  const variants = useQuery(catalogQueryOptions.variant(profileId))
  const prices = useQuery(catalogQueryOptions.price(profileId))
  const itemCatalog = useQuery(catalogQueryOptions.item(profileId))
  const refresh = useMutation({
    mutationFn: async () => {
      const context = { client, profileId, date: new Date().toISOString().slice(0, 10) }
      for (const [index, id] of (['variants', 'prices', 'priceLists'] as const).entries()) {
        setRefreshMessage(t('pendingPage.refreshProgress', { current: index + 1, total: 3 }))
        await runManagedCacheRefresh(id, context)
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog.variant(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog.price(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.prices.lists(profileId) }),
      ])
      setRefreshMessage(t('pendingPage.refreshComplete'))
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog.variant(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog.price(profileId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.prices.lists(profileId) }),
      ])
      setRefreshMessage('')
    },
  })
  const pending = useMemo(() => findPendingItems(variants.data?.items ?? [], prices.data?.prices ?? [], { buying: preferences.buyingPriceList, selling: preferences.sellingPriceList }), [preferences.buyingPriceList, preferences.sellingPriceList, prices.data?.prices, variants.data?.items])
  const lowMargins = useMemo(() => findLowMarginPrices(variants.data?.items ?? [], prices.data?.prices ?? [], preferences.lowMarginThreshold), [preferences.lowMarginThreshold, prices.data?.prices, variants.data?.items])
  const itemTagsByName = useMemo(() => new Map((itemCatalog.data?.items ?? []).map((item) => [item.name, item.tags ?? []])), [itemCatalog.data?.items])
  const searchableItem = (item: VariantItem) => ({ ...item, tags: item.tags ?? itemTagsByName.get(item.name) })
  const filteredPending = rankProductSearch(pending, search, ({ item }) => searchableItem(item))
  const filteredTemplates = filteredPending.filter(({ kind }) => kind === 'template')
  const filteredPrices = filteredPending.filter(({ kind }) => kind !== 'template')
  const filteredMargins = rankProductSearch(lowMargins, search, ({ item }) => searchableItem(item))
  const missing = (kind: PendingPriceKind) => t(kind === 'buying' ? 'pendingPage.buying' : 'pendingPage.selling')
  const dateLabel = (date?: string) => date ? new Date(date).toLocaleString() : t('pendingPage.notUpdated')
  const notReady = variants.isPending || prices.isPending
  const formatPrice = (price: ItemPrice) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: price.currency || 'MXN', maximumFractionDigits: 2 }).format(Number(price.price_list_rate ?? 0))
  const missingImageItems = useMemo(() => {
    const items = variants.data?.items ?? []
    const itemsWithVariants = new Set(items.filter((item) => item.has_variants === true || item.has_variants === 1 || String(item.has_variants) === '1').map((item) => item.name))
    items.forEach((item) => { if (item.variant_of) itemsWithVariants.add(item.variant_of) })
    return items.filter((item) => !item.image?.trim()).map((item) => ({
      item,
      kind: item.variant_of ? 'variant' as const : itemsWithVariants.has(item.name) ? 'template' as const : 'item' as const,
    }))
  }, [variants.data?.items])
  const itemsByName = useMemo(() => new Map((variants.data?.items ?? []).map((item) => [item.name, item])), [variants.data?.items])
  const imagesReady = variants.data?.imageFieldLoaded === true
  const filteredMissingImages = rankProductSearch(missingImageItems, search, ({ item }) => searchableItem(item))
  const activeCount = activeTab === 'prices' ? filteredPrices.length : activeTab === 'templates' ? filteredTemplates.length : activeTab === 'margin' ? filteredMargins.length : imagesReady ? filteredMissingImages.length : 0

  async function updateImageCache(item: VariantItem, imageUrl: string) {
    const updatedItem = { ...item, image: imageUrl }
    const writes = await Promise.allSettled([patchItemCatalog(profileId, updatedItem), patchVariantCatalog(profileId, updatedItem)])
    queryClient.setQueryData<ItemCatalogCache | null>(queryKeys.catalog.item(profileId), (cache) => cache ? { ...cache, locallyModified: true, items: cache.items.map((candidate) => candidate.name === item.name ? { ...candidate, image: imageUrl } : candidate) } : cache)
    queryClient.setQueryData<VariantCatalogCache | null>(queryKeys.catalog.variant(profileId), (cache) => cache ? { ...cache, locallyModified: true, items: cache.items.map((candidate) => candidate.name === item.name ? { ...candidate, image: imageUrl } : candidate) } : cache)
    return writes.some((result) => result.status === 'rejected')
  }

  async function saveItemImage(imageUrl: string) {
    if (!imageItem) return
    const cacheFailed = await updateImageCache(imageItem, imageUrl)
    setImageSaveMessage(cacheFailed ? t('pendingPage.imageSavedCacheWarning') : t('pendingPage.imageSaved'))
  }

  async function assignTemplateImage(item: VariantItem, template: VariantItem) {
    if (!template.image || templateImageItem) return
    setTemplateImageItem(item.name)
    setImageSaveMessage('')
    try {
      const savedImage = await client.setItemImage(item.name, template.image)
      const cacheFailed = await updateImageCache(item, savedImage)
      setImageSaveMessage(cacheFailed ? t('pendingPage.imageSavedCacheWarning') : t('pendingPage.imageSaved'))
    } catch (error) {
      setImageSaveMessage(error instanceof Error ? error.message : t('pendingPage.imageSaveError'))
    } finally {
      setTemplateImageItem(null)
    }
  }

  return <section className="pending-workspace">
    <PageHeader title={t('pendingPage.title')} description={t('pendingPage.description')} action={<Button type="button" variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}><RefreshCw className={`mr-2 size-4${refresh.isPending ? ' animate-spin' : ''}`} aria-hidden="true" />{refresh.isPending ? t('pendingPage.refreshing') : t('pendingPage.refresh')}</Button>} />
    <div className="pending-status-bar">
      <div><strong>{t('pendingPage.priceLists')}</strong><span>{t('pendingPage.priceListsSummary', { buyingLabel: t('pendingPage.buyingList'), buying: preferences.buyingPriceList, sellingLabel: t('pendingPage.sellingList'), selling: preferences.sellingPriceList })}</span></div>
      <span>{t('pendingPage.updated', { variants: dateLabel(variants.data?.updatedAt), prices: dateLabel(prices.data?.updatedAt) })}</span>
    </div>
    {refreshMessage && <p className="pending-refresh-message" role="status">{refreshMessage}</p>}
    {imageSaveMessage && <Alert className="notice-info" role="status"><AlertDescription>{imageSaveMessage}</AlertDescription></Alert>}
    {variants.isError && <CatalogErrorNotice error={variants.error} />}
    {prices.isError && <CatalogErrorNotice error={prices.error} />}
    {!notReady && (!variants.data || !prices.data) && <div className="pending-empty-state"><CircleAlert aria-hidden="true" /><div><h2>{t('pendingPage.cacheMissing')}</h2><p>{t('pendingPage.cacheMissingDescription')}</p></div><Button type="button" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{t('pendingPage.refresh')}</Button></div>}
    {refresh.isError && <CatalogErrorNotice error={refresh.error} onRetry={() => refresh.mutate()} />}
    {notReady && <div className="flex justify-center p-12"><Spinner /></div>}
    {!notReady && variants.data && prices.data && <>
      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as PendingTab); setSearch('') }}>
        <div className="pending-toolbar"><div><strong>{activeTab === 'images' && !imagesReady ? t('pendingPage.imagesNeedRefresh') : t('pendingPage.count', { count: activeCount })}</strong><span>{t(`pendingPage.tabs.${activeTab}Description`)}</span></div><PendingSearchForm key={activeTab} onSearch={setSearch} /></div>
        <TabsList aria-label={t('pendingPage.tabs.label')} className="pending-tabs">
          <TabsTrigger value="prices">{t('pendingPage.tabs.prices')} <span>{pending.filter(({ kind }) => kind !== 'template').length}</span></TabsTrigger>
          <TabsTrigger value="templates">{t('pendingPage.tabs.templates')} <span>{pending.filter(({ kind }) => kind === 'template').length}</span></TabsTrigger>
          <TabsTrigger value="margin">{t('pendingPage.tabs.margin')} <span>{lowMargins.length}</span></TabsTrigger>
          <TabsTrigger value="images">{t('pendingPage.tabs.images')} <span>{imagesReady ? missingImageItems.length : '—'}</span></TabsTrigger>
        </TabsList>
        <TabsContent value="prices">{filteredPrices.length ? <div className="pending-list" role="list">{filteredPrices.map(({ item, kind, missingPrices }) => {
          const name = item.item_name || item.name
          const priceKind = missingPrices[0] ?? 'selling'
          const action = priceManagementUrl(item.name, undefined, priceKind, priceKind === 'buying' ? preferences.buyingPriceList : preferences.sellingPriceList)
          return <article className="pending-row" role="listitem" key={item.name}><div className="pending-item-main"><span className={`pending-item-icon pending-item-icon-${kind}`} aria-hidden="true"><CircleAlert /></span><div className="min-w-0"><div className="pending-item-heading"><h2 title={name}>{name}</h2><Badge tone={kind === 'variant' ? 'info' : 'warning'}>{t(`pendingPage.kind.${kind}`)}</Badge></div><p>{item.variant_of ? t('pendingPage.variantOf', { item: item.name, name: item.variant_of }) : item.name}</p><div className="pending-missing-tags">{missingPrices.map((missingKind) => <Badge key={missingKind} tone="warning">{missing(missingKind)}</Badge>)}</div></div></div><ButtonLink variant="secondary" to={action}>{t('pendingPage.addPrice')}<ArrowUpRight className="ml-2 size-4" aria-hidden="true" /></ButtonLink></article>
        })}</div> : <PendingEmpty search={search} title={search ? t('pendingPage.noSearchResults') : t('pendingPage.pricesClear')} description={search ? t('pendingPage.noSearchDescription') : t('pendingPage.pricesClearDescription')} linkLabel={t('pendingPage.viewCatalog')} />}</TabsContent>
        <TabsContent value="templates">{filteredTemplates.length ? <div className="pending-list" role="list">{filteredTemplates.map(({ item }) => <article className="pending-row" role="listitem" key={item.name}><div className="pending-item-main"><span className="pending-item-icon pending-item-icon-template" aria-hidden="true"><CircleAlert /></span><div className="min-w-0"><div className="pending-item-heading"><h2 title={item.item_name || item.name}>{item.item_name || item.name}</h2><Badge tone="neutral">{t('pendingPage.kind.template')}</Badge></div><p>{item.name}</p><div className="pending-missing-tags"><Badge tone="warning">{t('pendingPage.noVariants')}</Badge></div></div></div><ButtonLink variant="secondary" to={`/variants/new?template=${encodeURIComponent(item.name)}`}>{t('pendingPage.addVariant')}<ArrowUpRight className="ml-2 size-4" aria-hidden="true" /></ButtonLink></article>)}</div> : <PendingEmpty search={search} title={search ? t('pendingPage.noSearchResults') : t('pendingPage.templatesClear')} description={search ? t('pendingPage.noSearchDescription') : t('pendingPage.templatesClearDescription')} />}</TabsContent>
        <TabsContent value="margin">{filteredMargins.length ? <div className="pending-list" role="list">{filteredMargins.map(({ item, selling, purchase, marginPercentage }) => <article className="pending-row" role="listitem" key={selling.name}><div className="pending-item-main"><span className="pending-item-icon pending-item-icon-variant" aria-hidden="true"><CircleAlert /></span><div className="min-w-0"><div className="pending-item-heading"><h2 title={item.item_name || item.name}>{item.item_name || item.name}</h2><Badge tone="warning">{t('pendingPage.lowMargin')}</Badge></div><p>{item.name} · {selling.price_list || t('pendingPage.unknownPriceList')} · {selling.uom || item.stock_uom || '—'}</p><div className="pending-missing-tags"><Badge tone="neutral">{t('pendingPage.sellingPrice')}: {formatPrice(selling)}</Badge><Badge tone="neutral">{t('pendingPage.standardBuying')}: {formatPrice(purchase)}</Badge><Badge tone="warning">{t('pendingPage.marginValue', { value: marginPercentage.toFixed(1) })}</Badge></div></div></div><ButtonLink variant="secondary" to={priceManagementUrl(item.name, selling, 'selling', selling.price_list || preferences.sellingPriceList)}>{t('pendingPage.editSalePrice')}<ArrowUpRight className="ml-2 size-4" aria-hidden="true" /></ButtonLink></article>)}</div> : <PendingEmpty search={search} title={search ? t('pendingPage.noSearchResults') : t('pendingPage.marginClear')} description={search ? t('pendingPage.noSearchDescription') : t('pendingPage.marginClearDescription')} />}</TabsContent>
        <TabsContent value="images">{!imagesReady ? <div className="pending-empty-state"><ImageOff aria-hidden="true" /><div><h2>{t('pendingPage.imagesNeedRefresh')}</h2><p>{t('pendingPage.imagesNeedRefreshDescription')}</p></div><Button type="button" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? t('pendingPage.refreshing') : t('pendingPage.refresh')}</Button></div> : filteredMissingImages.length ? <div className="pending-list" role="list">{filteredMissingImages.map(({ item, kind }) => {
          const template = item.variant_of ? itemsByName.get(item.variant_of) : undefined
          return <article className="pending-row" role="listitem" key={item.name}><div className="pending-item-main"><span className="pending-item-icon pending-item-icon-template" aria-hidden="true"><ImageOff /></span><div className="min-w-0"><div className="pending-item-heading"><h2 title={item.item_name || item.name}>{item.item_name || item.name}</h2><Badge tone={kind === 'variant' ? 'info' : kind === 'template' ? 'neutral' : 'warning'}>{t(`pendingPage.kind.${kind}`)}</Badge></div><p>{item.name}{item.variant_of ? ` · ${t('pendingPage.variantOf', { item: item.name, name: item.variant_of })}` : ''}</p><div className="pending-missing-tags"><Badge tone="warning">{t('pendingPage.imageMissing')}</Badge></div></div></div><div className="flex flex-wrap items-center gap-2">{template?.image?.trim() && <Button type="button" variant="secondary" onClick={() => { void assignTemplateImage(item, template) }} loading={templateImageItem === item.name} disabled={templateImageItem !== null}>{t('pendingPage.assignTemplateImage')}<ImagePlus className="size-4" aria-hidden="true" /></Button>}<Button type="button" variant="secondary" onClick={() => { setImageSaveMessage(''); setImageItem(item) }}>{t('pendingPage.assignImage')}<ImagePlus className="size-4" aria-hidden="true" /></Button></div></article>
        })}</div> : <PendingEmpty search={search} title={search ? t('pendingPage.noSearchResults') : t('pendingPage.imagesClear')} description={search ? t('pendingPage.noSearchDescription') : t('pendingPage.imagesClearDescription')} />}</TabsContent>
      </Tabs>
      <div className="sr-only" aria-live="polite">{t('pendingPage.count', { count: activeCount })}</div>
    </>}
    <PendingImageEditor key={imageItem?.name ?? 'closed'} client={client} item={imageItem} onClose={() => setImageItem(null)} onSaved={saveItemImage} />
  </section>
}

function PendingEmpty({ search, title, description, linkLabel }: { search: string; title: string; description: string; linkLabel?: string }) {
  return <div className="pending-empty-state"><div><h2>{title}</h2><p>{description}</p>{!search && linkLabel && <Link className="text-sm font-semibold text-[var(--color-primary)] underline underline-offset-4" to="/items">{linkLabel}</Link>}</div></div>
}

function PendingSearchForm({ onSearch }: { onSearch: (value: string) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(value.trim())
  }

  return <form className="flex w-full max-w-[24rem] items-center gap-2" role="search" onSubmit={submit}>
    <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={t('pendingPage.search')} aria-label={t('pendingPage.search')} />
    <SearchButton label={t('common.search')} />
  </form>
}
