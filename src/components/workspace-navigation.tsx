import { useLocation, useNavigate } from 'react-router-dom'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'

type WorkspaceTab = { value: string; label: string; to: string; matches: (pathname: string) => boolean }
type Workspace = { id: string; label: string; description: string; tabs: WorkspaceTab[] }

const workspaces: Workspace[] = [
  {
    id: 'operation',
    label: 'Operación',
    description: 'Ventas, cotizaciones y turnos conectados al flujo del POS.',
    tabs: [
      { value: 'pos', label: 'POS', to: '/pos', matches: (pathname) => pathname === '/pos' },
      { value: 'sales', label: 'Ventas del día', to: '/pos/ventas', matches: (pathname) => pathname.startsWith('/pos/ventas') },
      { value: 'quotations', label: 'Cotizaciones', to: '/pos/cotizaciones', matches: (pathname) => pathname.startsWith('/pos/cotizaciones') },
      { value: 'shifts', label: 'Turnos', to: '/pos/turnos', matches: (pathname) => pathname.startsWith('/pos/turnos') },
    ],
  },
  {
    id: 'catalog',
    label: 'Catálogo',
    description: 'Productos, jerarquía de variantes, UOM y precios.',
    tabs: [
      { value: 'items', label: 'Productos', to: '/items', matches: (pathname) => pathname.startsWith('/items') },
      { value: 'variants', label: 'Variantes', to: '/variants', matches: (pathname) => pathname.startsWith('/variants') },
      { value: 'prices', label: 'Precios', to: '/prices', matches: (pathname) => pathname.startsWith('/prices') },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventario',
    description: 'Existencias y ajustes con el mismo catálogo local.',
    tabs: [
      { value: 'stock', label: 'Inventario', to: '/stock', matches: (pathname) => pathname === '/stock' },
      { value: 'reconciliation', label: 'Reconciliación', to: '/stock/reconciliation', matches: (pathname) => pathname.startsWith('/stock/reconciliation') },
    ],
  },
]

export function WorkspaceNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const workspace = workspaces.find((candidate) => candidate.tabs.some((tab) => tab.matches(location.pathname)))
  if (!workspace || workspace.tabs.length < 2) return null
  const activeTab = workspace.tabs.find((tab) => tab.matches(location.pathname)) ?? workspace.tabs[0]

  return <section className="workspace-navigation mb-6 grid min-w-0 gap-3" aria-label={`Workspace de ${workspace.label}`}>
    <div className="workspace-navigation-header flex min-w-0 flex-wrap items-end justify-between gap-3">
      <div className="workspace-navigation-copy min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">{workspace.label}</p>
        <p className="workspace-navigation-description mt-1 text-sm text-[var(--color-muted)]">{workspace.description}</p>
      </div>
      <span className="workspace-navigation-hint text-xs text-[var(--color-muted)]">Los datos se cargan sólo al abrir cada módulo.</span>
    </div>
    <div className="workspace-navigation-desktop-tabs">
      <Tabs value={activeTab.value} onValueChange={(value) => { const tab = workspace.tabs.find((candidate) => candidate.value === value); if (tab && tab.value !== activeTab.value) navigate(tab.to) }}>
        <TabsList aria-label={`Secciones de ${workspace.label}`} className="w-full min-w-0 justify-start overflow-x-auto">
          {workspace.tabs.map((tab) => <TabsTrigger key={tab.value} value={tab.value} className="whitespace-nowrap">{tab.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
    </div>
    <div className="workspace-navigation-mobile-select">
      <Select value={activeTab.value} onValueChange={(value) => { const tab = workspace.tabs.find((candidate) => candidate.value === value); if (tab && tab.value !== activeTab.value) navigate(tab.to) }}>
        <SelectTrigger aria-label={`Sección de ${workspace.label}`}><SelectValue /></SelectTrigger>
        <SelectContent>{workspace.tabs.map((tab) => <SelectItem key={tab.value} value={tab.value}>{tab.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  </section>
}
