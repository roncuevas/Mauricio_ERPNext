import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CacheManagerPanel } from '../components/cache-manager-panel'
import { Badge, Button, Card, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Notice, PageHeader, Separator, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui'
import { readHomeCacheData } from '../lib/cache-manager'
import { buildHomeStats } from '../lib/home-stats'
import { localDate } from '../lib/sales-orders'
import type { createErpNextClient } from '../lib/erpnext'

type Client = ReturnType<typeof createErpNextClient>

function number(value: number) { return value.toLocaleString('es-MX') }
function money(value: number) { return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }) }

function StatCard({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: 'neutral' | 'success' | 'warning' }) {
  return <Card className="home-stat-card"><div className="home-stat-heading"><span>{label}</span><Badge tone={tone}>{detail}</Badge></div><strong>{value}</strong></Card>
}

export function HomePage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['home-cache-data', profileId], queryFn: () => readHomeCacheData(profileId), staleTime: Infinity })
  const stats = useMemo(() => buildHomeStats(query.data, localDate()), [query.data])
  const hasCache = Boolean(query.data?.overview.some((entry) => entry.updatedAt))
  const refreshSummary = () => { void queryClient.invalidateQueries({ queryKey: ['home-cache-data', profileId] }) }

  return <section className="home-workspace">
    <PageHeader title={t('home.title')} description={t('home.description')} action={<Button type="button" onClick={refreshSummary}>{t('home.refreshSummary')}</Button>} />
    {query.isError && <Notice>{query.error instanceof Error ? query.error.message : 'No se pudo leer el estado local.'}</Notice>}
    {query.isPending ? <div className="home-stat-grid">{Array.from({ length: 8 }, (_, index) => <Skeleton className="home-stat-skeleton" key={index} />)}</div> : <>
      <div className="home-stat-grid">
        <StatCard label={t('home.products')} value={number(stats.products)} detail={t('home.localCache')} />
        <StatCard label={t('home.variants')} value={number(stats.variants)} detail={t('home.hierarchy')} />
        <StatCard label={t('home.prices')} value={number(stats.prices)} detail={t('home.itemPrice')} />
        <StatCard label={t('home.stock')} value={number(stats.stockBins)} detail={stats.negativeStock ? t('home.negativeStock', { count: number(stats.negativeStock) }) : t('home.realBins')} tone={stats.negativeStock ? 'warning' : 'success'} />
        <StatCard label={t('home.inventoryValue')} value={money(stats.stockValue)} detail={t('home.stockValue')} />
        <StatCard label={t('home.ordersToday')} value={number(stats.ordersToday)} detail={money(stats.ordersTodayTotal)} />
        <StatCard label={t('home.quotations')} value={number(stats.quotations)} detail={money(stats.quotationsTotal)} />
        <StatCard label={t('home.openShifts')} value={number(stats.openShifts)} detail={t('home.posOpening')} tone={stats.openShifts ? 'success' : 'neutral'} />
      </div>
      <Card className="home-health-card"><div className="home-section-heading"><div><p className="settings-eyebrow">{t('home.localStatus')}</p><h2>{t('home.cacheHealth')}</h2></div><Badge tone={stats.errorCaches ? 'warning' : 'success'}>{stats.errorCaches ? t('home.errors', { count: stats.errorCaches }) : t('home.noRecentErrors')}</Badge></div><Separator /><div className="home-health-grid"><span><strong>{number(stats.freshCaches)}</strong>{t('home.updated')}</span><span><strong>{number(stats.staleCaches)}</strong>{t('home.stale')}</span><span><strong>{number(stats.missingCaches)}</strong>{t('home.missing')}</span><span><strong>{number(stats.errorCaches)}</strong>{t('home.withErrors')}</span></div><p className="muted">{t('home.sourceNote')}</p></Card>
    </>}
    <Tabs defaultValue="summary" className="home-tabs">
      <TabsList aria-label={t('home.summary')}><TabsTrigger value="summary">{t('home.summary')}</TabsTrigger><TabsTrigger value="caches">{t('home.cacheFetch')}</TabsTrigger></TabsList>
      <TabsContent value="summary"><Card><Empty className="home-quick-actions border-0"><EmptyHeader><EmptyTitle>{t('home.quickActions')}</EmptyTitle><EmptyDescription>{t('home.quickActionsDescription')}</EmptyDescription></EmptyHeader><div className="home-quick-links"><Button type="button" variant="secondary" onClick={() => { void queryClient.invalidateQueries({ queryKey: ['home-cache-data', profileId] }) }}>{t('home.updateStats')}</Button></div></Empty></Card></TabsContent>
      <TabsContent value="caches"><CacheManagerPanel client={client} profileId={profileId} onChanged={refreshSummary} /></TabsContent>
    </Tabs>
    {!hasCache && !query.isPending && <Notice tone="info">{t('home.noCaches')}</Notice>}
  </section>
}
