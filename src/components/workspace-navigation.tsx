import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { featureFlags } from '../lib/feature-flags'

type WorkspaceTab = { value: string; labelKey: string; to: string; matches: (pathname: string) => boolean }
type Workspace = { id: string; labelKey: string; descriptionKey: string; tabs: WorkspaceTab[] }

const workspaces: Workspace[] = [
  {
    id: 'operation',
    labelKey: 'navigation.operation',
    descriptionKey: 'navigation.operationDescription',
    tabs: [
      { value: 'pos', labelKey: 'navigation.pos', to: '/pos', matches: (pathname) => pathname === '/pos' },
      { value: 'sales', labelKey: 'navigation.dailySales', to: '/pos/ventas', matches: (pathname) => pathname.startsWith('/pos/ventas') },
      ...(featureFlags.quotationsView ? [{ value: 'quotations', labelKey: 'navigation.quotations', to: '/pos/cotizaciones', matches: (pathname: string) => pathname.startsWith('/pos/cotizaciones') }] : []),
      { value: 'shifts', labelKey: 'navigation.shifts', to: '/pos/turnos', matches: (pathname) => pathname.startsWith('/pos/turnos') },
    ],
  },
  {
    id: 'catalog',
    labelKey: 'navigation.catalog',
    descriptionKey: 'navigation.catalogDescription',
    tabs: [
      { value: 'items', labelKey: 'navigation.products', to: '/items', matches: (pathname) => pathname.startsWith('/items') },
      { value: 'variants', labelKey: 'navigation.variants', to: '/variants', matches: (pathname) => pathname.startsWith('/variants') },
      { value: 'prices', labelKey: 'navigation.prices', to: '/prices', matches: (pathname) => pathname.startsWith('/prices') },
    ],
  },
  {
    id: 'inventory',
    labelKey: 'navigation.inventory',
    descriptionKey: 'navigation.inventoryDescription',
    tabs: [
      { value: 'stock', labelKey: 'navigation.stock', to: '/stock', matches: (pathname) => pathname === '/stock' },
      { value: 'reconciliation', labelKey: 'navigation.reconciliation', to: '/stock/reconciliation', matches: (pathname) => pathname.startsWith('/stock/reconciliation') },
    ],
  },
]

export function WorkspaceNavigation() {
  const { t } = useTranslation()
  const translate = (key: string) => String((t as unknown as (key: string) => unknown)(key))
  const location = useLocation()
  const navigate = useNavigate()
  const workspace = workspaces.find((candidate) => candidate.tabs.some((tab) => tab.matches(location.pathname)))
  if (!workspace || workspace.tabs.length < 2) return null
  const activeTab = workspace.tabs.find((tab) => tab.matches(location.pathname)) ?? workspace.tabs[0]

  return <section className="workspace-navigation mb-6 grid min-w-0 gap-3" aria-label={t('navigation.currentSection', { section: translate(workspace.labelKey) })}>
    <div className="workspace-navigation-header flex min-w-0 flex-wrap items-end justify-between gap-3">
      <div className="workspace-navigation-copy min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">{translate(workspace.labelKey)}</p>
        <p className="workspace-navigation-description mt-1 text-sm text-[var(--color-muted)]">{translate(workspace.descriptionKey)}</p>
      </div>
      <span className="workspace-navigation-hint text-xs text-[var(--color-muted)]">{t('navigation.lazyLoading')}</span>
    </div>
    <div className="workspace-navigation-tabs">
      <Tabs value={activeTab.value} onValueChange={(value) => { const tab = workspace.tabs.find((candidate) => candidate.value === value); if (tab && tab.value !== activeTab.value) navigate(tab.to) }}>
        <TabsList aria-label={t('navigation.currentSection', { section: translate(workspace.labelKey) })} className="workspace-navigation-tab-list">
          {workspace.tabs.map((tab) => <TabsTrigger key={tab.value} value={tab.value} className="workspace-navigation-tab whitespace-nowrap">{translate(tab.labelKey)}</TabsTrigger>)}
        </TabsList>
      </Tabs>
    </div>
  </section>
}
