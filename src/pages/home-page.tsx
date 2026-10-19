import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['home-cache-data', profileId], queryFn: () => readHomeCacheData(profileId), staleTime: Infinity })
  const stats = useMemo(() => buildHomeStats(query.data, localDate()), [query.data])
  const hasCache = Boolean(query.data?.overview.some((entry) => entry.updatedAt))
  const refreshSummary = () => { void queryClient.invalidateQueries({ queryKey: ['home-cache-data', profileId] }) }

  return <section className="home-workspace">
    <PageHeader title="Inicio" description="Resumen operativo de tu conexión ERPNext y sus cachés locales." action={<Button type="button" onClick={refreshSummary}>Actualizar resumen</Button>} />
    {query.isError && <Notice>{query.error instanceof Error ? query.error.message : 'No se pudo leer el estado local.'}</Notice>}
    {query.isPending ? <div className="home-stat-grid">{Array.from({ length: 8 }, (_, index) => <Skeleton className="home-stat-skeleton" key={index} />)}</div> : <>
      <div className="home-stat-grid">
        <StatCard label="Productos" value={number(stats.products)} detail="Cache local" />
        <StatCard label="Variantes" value={number(stats.variants)} detail="Jerarquía" />
        <StatCard label="Precios" value={number(stats.prices)} detail="Item Price" />
        <StatCard label="Existencias" value={number(stats.stockBins)} detail={stats.negativeStock ? `${number(stats.negativeStock)} negativas` : 'Bin reales'} tone={stats.negativeStock ? 'warning' : 'success'} />
        <StatCard label="Valor inventario" value={money(stats.stockValue)} detail="Stock value" />
        <StatCard label="Pedidos de hoy" value={number(stats.ordersToday)} detail={money(stats.ordersTodayTotal)} />
        <StatCard label="Cotizaciones" value={number(stats.quotations)} detail={money(stats.quotationsTotal)} />
        <StatCard label="Turnos abiertos" value={number(stats.openShifts)} detail="POS Opening" tone={stats.openShifts ? 'success' : 'neutral'} />
      </div>
      <Card className="home-health-card"><div className="home-section-heading"><div><p className="settings-eyebrow">Estado local</p><h2>Salud de cachés</h2></div><Badge tone={stats.errorCaches ? 'warning' : 'success'}>{stats.errorCaches ? `${stats.errorCaches} con error` : 'Sin errores recientes'}</Badge></div><Separator /><div className="home-health-grid"><span><strong>{number(stats.freshCaches)}</strong>actualizadas</span><span><strong>{number(stats.staleCaches)}</strong>desactualizadas</span><span><strong>{number(stats.missingCaches)}</strong>sin caché</span><span><strong>{number(stats.errorCaches)}</strong>con error</span></div><p className="muted">Las métricas se calculan desde los datos disponibles en este navegador. ERPNext sigue siendo la fuente de verdad.</p></Card>
    </>}
    <Tabs defaultValue="summary" className="home-tabs">
      <TabsList aria-label="Secciones de inicio"><TabsTrigger value="summary">Resumen</TabsTrigger><TabsTrigger value="caches">Cachés y fetch</TabsTrigger></TabsList>
      <TabsContent value="summary"><Card><Empty className="home-quick-actions border-0"><EmptyHeader><EmptyTitle>Acciones rápidas</EmptyTitle><EmptyDescription>Actualiza los datos desde la pestaña de cachés cuando lo necesites.</EmptyDescription></EmptyHeader><div className="home-quick-links"><Button type="button" variant="secondary" onClick={() => { void queryClient.invalidateQueries({ queryKey: ['home-cache-data', profileId] }) }}>Actualizar stats</Button></div></Empty></Card></TabsContent>
      <TabsContent value="caches"><CacheManagerPanel client={client} profileId={profileId} onChanged={refreshSummary} /></TabsContent>
    </Tabs>
    {!hasCache && !query.isPending && <Notice tone="info">Aún no hay cachés descargadas. Abre “Cachés y fetch” y pulsa “Refrescar todo”.</Notice>}
  </section>
}
