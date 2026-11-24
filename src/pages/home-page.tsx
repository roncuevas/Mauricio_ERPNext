import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CacheSyncTable } from '../components/cache-manager-panel'
import { useManagedCacheRefresh } from '../components/use-managed-cache-refresh'
import { Button, ButtonLink, Card, CardAction, CardDescription, CardHeader, CardTitle, Notice, PageHeader, Skeleton, Spinner } from '../components/ui'
import { contextCacheIds, managedCacheOrder, readHomeCacheData, type ManagedCacheId, type ManagedCacheOverview } from '../lib/cache-manager'
import { activePosProfile, buildHomeStats } from '../lib/home-stats'
import { readPosPreferences } from '../lib/pos-preferences'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { readPendingPreferences } from '../lib/pending-preferences'
import { summarizePending, type PendingCategory } from '../lib/pending-items'
import { localDate } from '../lib/sales-orders'
import type { createErpNextClient } from '../lib/erpnext'
import { ArrowRight, ChevronRight, CircleAlert, CircleCheck, Clock, Plus, TriangleAlert } from 'lucide-react'

type Client = ReturnType<typeof createErpNextClient>

const setupCacheIds = ['products', 'prices'] as const satisfies readonly ManagedCacheId[]

function useFormatters() {
  const { i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en-US' : 'es-MX'
  return useMemo(() => ({
    number: (value: number) => value.toLocaleString(locale),
    money: (value: number) => value.toLocaleString(locale, { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }),
    longDate: (value: Date) => value.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
    time: (value?: string) => {
      if (!value) return ''
      const parsed = new Date(value.replace(' ', 'T'))
      return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    },
  }), [locale])
}

function AttentionItem({ tone, children, action }: { tone: 'warning' | 'danger'; children: ReactNode; action: ReactNode }) {
  const Icon = tone === 'danger' ? CircleAlert : TriangleAlert
  return <li className="home-attention-item" data-tone={tone}><Icon className="home-attention-icon" aria-hidden="true" /><span>{children}</span>{action}</li>
}

function SetupChecklist({ entries, busyIds, busy, onDownload }: { entries: ManagedCacheOverview[]; busyIds: ManagedCacheId[]; busy: boolean; onDownload: (id: ManagedCacheId) => void }) {
  const { t } = useTranslation()
  const done = (id: ManagedCacheId) => Boolean(entries.find((entry) => entry.id === id)?.updatedAt)
  const steps = [
    ...setupCacheIds.map((id) => ({ id, title: t(`home.setup.${id}`), description: t(`cache.descriptions.${id}`), complete: done(id), action: <Button type="button" variant={done(id) ? 'secondary' : 'primary'} size="compact" disabled={busy} onClick={() => onDownload(id)}>{busyIds.includes(id) ? <><Spinner /> {t('cache.refreshing')}</> : done(id) ? t('common.refresh') : t('home.setup.download')}</Button> })),
    { id: 'shift', title: t('home.setup.shift'), description: t('home.setup.shiftDescription'), complete: false, action: <ButtonLink to="/pos/turnos" variant="secondary" size="compact">{t('home.openShift')}</ButtonLink> },
  ]
  return <Card className="home-setup">
    <CardHeader><CardTitle>{t('home.setup.title')}</CardTitle><CardDescription>{t('home.setup.description')}</CardDescription></CardHeader>
    <ol className="home-setup-steps">{steps.map((step, index) => <li key={step.id} data-complete={step.complete || undefined}>
      <span className="home-setup-marker" aria-hidden="true">{step.complete ? <CircleCheck /> : index + 1}</span>
      <span className="home-setup-copy"><strong>{step.title}</strong><span>{step.description}</span>{step.complete && <span className="sr-only">{t('home.setup.complete')}</span>}</span>
      {step.action}
    </li>)}</ol>
  </Card>
}

/** Order of the review list: what blocks selling first, catalog tidiness last. */
const reviewOrder: PendingCategory[] = ['stock', 'prices', 'margin', 'data', 'images', 'templates']

/** Catalog work waiting in Pendientes, each kind linking straight to its tab. */
function ReviewCard({ counts, format }: { counts: Record<PendingCategory, number | null>; format: ReturnType<typeof useFormatters> }) {
  const { t } = useTranslation()
  const rows = reviewOrder.flatMap((category) => { const count = counts[category]; return count ? [{ category, count }] : [] })
  return <Card className="home-review">
    <CardHeader><CardTitle>{t('home.review.title')}</CardTitle><CardAction><ButtonLink to="/pendientes" variant="secondary" size="compact">{t('home.review.viewAll')}</ButtonLink></CardAction></CardHeader>
    {rows.length ? <ul className="home-review-list">{rows.map(({ category, count }) => <li key={category}>
      <Link className="home-review-link" to={`/pendientes?tab=${category}`}>
        <span>{t(`home.review.categories.${category}`)}</span>
        <strong>{format.number(count)}</strong>
        <ChevronRight aria-hidden="true" />
      </Link>
    </li>)}</ul> : <p className="home-attention-clear"><CircleCheck aria-hidden="true" />{t('home.review.clear')}</p>}
  </Card>
}

export function HomePage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const format = useFormatters()
  const queryClient = useQueryClient()
  const today = localDate()
  const query = useQuery({ queryKey: ['home-cache-data', profileId], queryFn: () => readHomeCacheData(profileId), staleTime: 0, refetchOnMount: 'always' })
  const stats = useMemo(() => buildHomeStats(query.data, today), [query.data, today])
  const activeProfile = useMemo(() => activePosProfile(query.data, readPosPreferences(profileId).profileName), [query.data, profileId])
  const entries = useMemo(() => managedCacheOrder.map((id) => query.data?.overview.find((entry) => entry.id === id)).filter((entry): entry is ManagedCacheOverview => Boolean(entry)), [query.data])
  const variants = useQuery(catalogQueryOptions.variant(profileId))
  const prices = useQuery(catalogQueryOptions.price(profileId))
  const reviewCounts = useMemo(() => variants.data && prices.data ? summarizePending({ items: variants.data.items, prices: prices.data.prices, stock: query.data?.stock ?? null, imagesReady: variants.data.imageFieldLoaded === true, preferences: readPendingPreferences(profileId) }, today) : null, [variants.data, prices.data, query.data?.stock, profileId, today])
  const sync = useManagedCacheRefresh({ client, profileId, activeProfile, onSettled: () => queryClient.invalidateQueries({ queryKey: ['home-cache-data', profileId] }) })

  const needsSetup = !query.isPending && setupCacheIds.some((id) => !entries.find((entry) => entry.id === id)?.updatedAt)
  const refreshable = (entry: ManagedCacheOverview) => !contextCacheIds.includes(entry.id) || Boolean(activeProfile?.company)
  const failed = entries.filter((entry) => entry.status === 'error')
  const stale = entries.filter((entry) => entry.status === 'stale')
  const missing = entries.filter((entry) => entry.status === 'missing' && refreshable(entry))
  const labels = (list: ManagedCacheOverview[]) => list.map((entry) => t(`cache.labels.${entry.id}`)).join(', ')
  const hasAttention = failed.length + stale.length + missing.length > 0 || stats.negativeStock > 0

  return <section className="home-workspace">
    <PageHeader title={t('home.title')} description={format.longDate(new Date())} action={<div className="home-header-actions"><ButtonLink to="/prices" variant="secondary">{t('home.managePrices')}</ButtonLink><ButtonLink to="/pos"><Plus className="h-4 w-4" aria-hidden="true" />{t('home.newSale')}</ButtonLink></div>} />

    {query.isError && <Notice>{query.error instanceof Error ? query.error.message : t('cache.readError')}</Notice>}

    {query.isPending ? <div className="home-loading"><Skeleton className="h-24" /><Skeleton className="h-48" /></div> : needsSetup
      ? <SetupChecklist entries={entries} busyIds={sync.busyIds} busy={sync.busy} onDownload={(id) => void sync.refreshOne(id)} />
      : <>
        <Card className="home-today">
          <div className="home-today-shift">
            <Clock aria-hidden="true" />
            {stats.openShift
              ? <p><strong>{t('home.today.shiftOpen')}</strong>{[stats.openShift.pos_profile, stats.openShift.period_start_date && t('home.today.since', { time: format.time(stats.openShift.period_start_date) })].filter(Boolean).map((part) => <span key={part}> · {part}</span>)}</p>
              : <p><strong>{stats.shiftsKnown ? t('home.today.noShift') : t('home.today.shiftUnknown')}</strong></p>}
            <ButtonLink to="/pos/turnos" variant="secondary" size="compact">{stats.openShift ? t('home.today.viewShift') : t('home.openShift')}</ButtonLink>
          </div>
          <dl className="home-today-figures">
            <div><dt>{t('home.ordersToday')}</dt><dd><strong>{format.number(stats.ordersToday)}</strong><span>{format.money(stats.ordersTodayTotal)}</span></dd></div>
            <div><dt>{t('home.quotations')}</dt><dd><strong>{format.number(stats.quotations)}</strong><span>{format.money(stats.quotationsTotal)}</span></dd></div>
          </dl>
        </Card>

        <div className="home-columns">
          <div className="home-main-column">
          {reviewCounts && <ReviewCard counts={reviewCounts} format={format} />}
          <Card className="home-attention">
            <CardHeader><CardTitle>{t('home.attention.title')}</CardTitle></CardHeader>
            {hasAttention ? <ul className="home-attention-list">
              {failed.map((entry) => <AttentionItem key={entry.id} tone="danger" action={<Button type="button" variant="secondary" size="compact" disabled={sync.busy} onClick={() => void sync.refreshOne(entry.id, Boolean(entry.issues?.length))}>{t('common.retry')}</Button>}>{t('home.attention.failed', { label: t(`cache.labels.${entry.id}`) })}</AttentionItem>)}
              {stats.negativeStock > 0 && <AttentionItem tone="warning" action={<ButtonLink to="/stock" variant="secondary" size="compact">{t('home.attention.view')}<ArrowRight className="h-4 w-4" aria-hidden="true" /></ButtonLink>}>{t('home.attention.negativeStock', { count: stats.negativeStock })}</AttentionItem>}
              {stale.length > 0 && <AttentionItem tone="warning" action={<Button type="button" variant="secondary" size="compact" disabled={sync.busy} onClick={() => void sync.refreshMany(stale.map((entry) => entry.id))}>{t('home.attention.update')}</Button>}>{t('home.attention.stale', { count: stale.length, labels: labels(stale) })}</AttentionItem>}
              {missing.length > 0 && <AttentionItem tone="warning" action={<Button type="button" variant="secondary" size="compact" disabled={sync.busy} onClick={() => void sync.refreshMany(missing.map((entry) => entry.id))}>{t('home.setup.download')}</Button>}>{t('home.attention.missing', { count: missing.length, labels: labels(missing) })}</AttentionItem>}
            </ul> : <p className="home-attention-clear"><CircleCheck aria-hidden="true" />{t('home.attention.clear')}</p>}
          </Card>
          </div>

          <Card className="home-catalog">
            <CardHeader><CardTitle>{t('home.operationalStats')}</CardTitle></CardHeader>
            <dl className="home-catalog-list">
              <div><dt>{t('home.products')}</dt><dd>{format.number(stats.products)}</dd></div>
              <div><dt>{t('home.variants')}</dt><dd>{format.number(stats.variants)}</dd></div>
              <div><dt>{t('home.prices')}</dt><dd>{format.number(stats.prices)}</dd></div>
              <div><dt>{t('home.stock')}</dt><dd>{format.number(stats.stockBins)}</dd></div>
              <div><dt>{t('home.inventoryValue')}</dt><dd>{format.money(stats.stockValue)}</dd></div>
            </dl>
          </Card>
        </div>
      </>}

    {!query.isPending && <Card className="home-sync">
      <CardHeader><CardTitle>{t('home.sync.title')}</CardTitle><CardDescription>{t('home.sourceNote')}</CardDescription><CardAction><Button type="button" variant="secondary" disabled={sync.busy} onClick={() => void sync.refreshMany()}>{sync.busy ? <><Spinner /> {t('cache.updating')}</> : t('cache.all')}</Button></CardAction></CardHeader>
      {(sync.message || sync.error) && <Notice tone={sync.error ? 'warning' : 'info'}><span role="status" aria-live="polite">{sync.error || sync.message}</span></Notice>}
      <CacheSyncTable entries={entries} busyIds={sync.busyIds} onRefresh={(id) => void sync.refreshOne(id)} />
    </Card>}
  </section>
}
