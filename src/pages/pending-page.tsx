import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, CircleAlert, RefreshCw } from 'lucide-react'
import { Badge, Button, ButtonLink, Input, PageHeader, Spinner } from '../components/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { CatalogErrorNotice } from '../components/catalog-guidance'
import { createErpNextClient } from '../lib/erpnext'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { queryKeys } from '../lib/query-keys'
import { findLowMarginPrices, findPendingItems, type PendingPriceKind } from '../lib/pending-items'
import { readPendingPreferences } from '../lib/pending-preferences'
import { runManagedCacheRefresh } from '../lib/cache-manager'
import type { ItemPrice } from '../lib/types'

type Client = ReturnType<typeof createErpNextClient>
type PendingTab = 'prices' | 'templates' | 'margin'

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
  const [refreshMessage, setRefreshMessage] = useState('')
  const preferences = readPendingPreferences(profileId)
  const variants = useQuery(catalogQueryOptions.variant(profileId))
  const prices = useQuery(catalogQueryOptions.price(profileId))
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
  const matchesSearch = (itemName: string, itemCode?: string, itemLabel?: string) => {
    const query = search.trim().toLocaleLowerCase()
    return !query || `${itemLabel ?? ''} ${itemName} ${itemCode ?? ''}`.toLocaleLowerCase().includes(query)
  }
  const filteredPending = pending.filter(({ item }) => matchesSearch(item.name, item.item_code, item.item_name))
  const filteredTemplates = filteredPending.filter(({ kind }) => kind === 'template')
  const filteredPrices = filteredPending.filter(({ kind }) => kind !== 'template')
  const filteredMargins = lowMargins.filter(({ item }) => matchesSearch(item.name, item.item_code, item.item_name))
  const missing = (kind: PendingPriceKind) => t(kind === 'buying' ? 'pendingPage.buying' : 'pendingPage.selling')
  const dateLabel = (date?: string) => date ? new Date(date).toLocaleString() : t('pendingPage.notUpdated')
  const notReady = variants.isPending || prices.isPending
  const formatPrice = (price: ItemPrice) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: price.currency || 'MXN', maximumFractionDigits: 2 }).format(Number(price.price_list_rate ?? 0))
  const activeCount = activeTab === 'prices' ? filteredPrices.length : activeTab === 'templates' ? filteredTemplates.length : filteredMargins.length

  return <section className="pending-workspace">
    <PageHeader title={t('pendingPage.title')} description={t('pendingPage.description')} action={<Button type="button" variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}><RefreshCw className={`mr-2 size-4${refresh.isPending ? ' animate-spin' : ''}`} aria-hidden="true" />{refresh.isPending ? t('pendingPage.refreshing') : t('pendingPage.refresh')}</Button>} />
    <div className="pending-status-bar">
      <div><strong>{t('pendingPage.priceLists')}</strong><span>{t('pendingPage.priceListsSummary', { buyingLabel: t('pendingPage.buyingList'), buying: preferences.buyingPriceList, sellingLabel: t('pendingPage.sellingList'), selling: preferences.sellingPriceList })}</span></div>
      <span>{t('pendingPage.updated', { variants: dateLabel(variants.data?.updatedAt), prices: dateLabel(prices.data?.updatedAt) })}</span>
    </div>
    {refreshMessage && <p className="pending-refresh-message" role="status">{refreshMessage}</p>}
    {variants.isError && <CatalogErrorNotice error={variants.error} />}
    {prices.isError && <CatalogErrorNotice error={prices.error} />}
    {!notReady && (!variants.data || !prices.data) && <div className="pending-empty-state"><CircleAlert aria-hidden="true" /><div><h2>{t('pendingPage.cacheMissing')}</h2><p>{t('pendingPage.cacheMissingDescription')}</p></div><Button type="button" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{t('pendingPage.refresh')}</Button></div>}
    {refresh.isError && <CatalogErrorNotice error={refresh.error} onRetry={() => refresh.mutate()} />}
    {notReady && <div className="flex justify-center p-12"><Spinner /></div>}
    {!notReady && variants.data && prices.data && <>
      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as PendingTab); setSearch('') }}>
        <div className="pending-toolbar"><div><strong>{t('pendingPage.count', { count: activeCount })}</strong><span>{t(`pendingPage.tabs.${activeTab}Description`)}</span></div><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('pendingPage.search')} aria-label={t('pendingPage.search')} /></div>
        <TabsList aria-label={t('pendingPage.tabs.label')} className="pending-tabs">
          <TabsTrigger value="prices">{t('pendingPage.tabs.prices')} <span>{pending.filter(({ kind }) => kind !== 'template').length}</span></TabsTrigger>
          <TabsTrigger value="templates">{t('pendingPage.tabs.templates')} <span>{pending.filter(({ kind }) => kind === 'template').length}</span></TabsTrigger>
          <TabsTrigger value="margin">{t('pendingPage.tabs.margin')} <span>{lowMargins.length}</span></TabsTrigger>
        </TabsList>
        <TabsContent value="prices">{filteredPrices.length ? <div className="pending-list" role="list">{filteredPrices.map(({ item, kind, missingPrices }) => {
          const name = item.item_name || item.name
          const priceKind = missingPrices[0] ?? 'selling'
          const action = priceManagementUrl(item.name, undefined, priceKind, priceKind === 'buying' ? preferences.buyingPriceList : preferences.sellingPriceList)
          return <article className="pending-row" role="listitem" key={item.name}><div className="pending-item-main"><span className={`pending-item-icon pending-item-icon-${kind}`} aria-hidden="true"><CircleAlert /></span><div className="min-w-0"><div className="pending-item-heading"><h2 title={name}>{name}</h2><Badge tone={kind === 'variant' ? 'info' : 'warning'}>{t(`pendingPage.kind.${kind}`)}</Badge></div><p>{item.variant_of ? t('pendingPage.variantOf', { item: item.name, name: item.variant_of }) : item.name}</p><div className="pending-missing-tags">{missingPrices.map((missingKind) => <Badge key={missingKind} tone="warning">{missing(missingKind)}</Badge>)}</div></div></div><ButtonLink variant="secondary" to={action}>{t('pendingPage.addPrice')}<ArrowUpRight className="ml-2 size-4" aria-hidden="true" /></ButtonLink></article>
        })}</div> : <PendingEmpty search={search} title={search ? t('pendingPage.noSearchResults') : t('pendingPage.pricesClear')} description={search ? t('pendingPage.noSearchDescription') : t('pendingPage.pricesClearDescription')} linkLabel={t('pendingPage.viewCatalog')} />}</TabsContent>
        <TabsContent value="templates">{filteredTemplates.length ? <div className="pending-list" role="list">{filteredTemplates.map(({ item }) => <article className="pending-row" role="listitem" key={item.name}><div className="pending-item-main"><span className="pending-item-icon pending-item-icon-template" aria-hidden="true"><CircleAlert /></span><div className="min-w-0"><div className="pending-item-heading"><h2 title={item.item_name || item.name}>{item.item_name || item.name}</h2><Badge tone="neutral">{t('pendingPage.kind.template')}</Badge></div><p>{item.name}</p><div className="pending-missing-tags"><Badge tone="warning">{t('pendingPage.noVariants')}</Badge></div></div></div><ButtonLink variant="secondary" to={`/variants/new?template=${encodeURIComponent(item.name)}`}>{t('pendingPage.addVariant')}<ArrowUpRight className="ml-2 size-4" aria-hidden="true" /></ButtonLink></article>)}</div> : <PendingEmpty search={search} title={search ? t('pendingPage.noSearchResults') : t('pendingPage.templatesClear')} description={search ? t('pendingPage.noSearchDescription') : t('pendingPage.templatesClearDescription')} />}</TabsContent>
        <TabsContent value="margin">{filteredMargins.length ? <div className="pending-list" role="list">{filteredMargins.map(({ item, selling, purchase, marginPercentage }) => <article className="pending-row" role="listitem" key={selling.name}><div className="pending-item-main"><span className="pending-item-icon pending-item-icon-variant" aria-hidden="true"><CircleAlert /></span><div className="min-w-0"><div className="pending-item-heading"><h2 title={item.item_name || item.name}>{item.item_name || item.name}</h2><Badge tone="warning">{t('pendingPage.lowMargin')}</Badge></div><p>{item.name} · {selling.price_list || t('pendingPage.unknownPriceList')} · {selling.uom || item.stock_uom || '—'}</p><div className="pending-missing-tags"><Badge tone="neutral">{t('pendingPage.sellingPrice')}: {formatPrice(selling)}</Badge><Badge tone="neutral">{t('pendingPage.standardBuying')}: {formatPrice(purchase)}</Badge><Badge tone="warning">{t('pendingPage.marginValue', { value: marginPercentage.toFixed(1) })}</Badge></div></div></div><ButtonLink variant="secondary" to={priceManagementUrl(item.name, selling, 'selling', selling.price_list || preferences.sellingPriceList)}>{t('pendingPage.editSalePrice')}<ArrowUpRight className="ml-2 size-4" aria-hidden="true" /></ButtonLink></article>)}</div> : <PendingEmpty search={search} title={search ? t('pendingPage.noSearchResults') : t('pendingPage.marginClear')} description={search ? t('pendingPage.noSearchDescription') : t('pendingPage.marginClearDescription')} />}</TabsContent>
      </Tabs>
      <div className="sr-only" aria-live="polite">{t('pendingPage.count', { count: activeCount })}</div>
    </>}
  </section>
}

function PendingEmpty({ search, title, description, linkLabel }: { search: string; title: string; description: string; linkLabel?: string }) {
  return <div className="pending-empty-state"><div><h2>{title}</h2><p>{description}</p>{!search && linkLabel && <Link className="text-sm font-semibold text-[var(--color-primary)] underline underline-offset-4" to="/items">{linkLabel}</Link>}</div></div>
}
