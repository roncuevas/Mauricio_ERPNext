import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Input, Notice, PageHeader, Spinner } from './components/ui'
import { MetadataDocEditor } from './components/metadata-editor'
import { decryptProfile, encryptProfile, normalizeBaseUrl } from './lib/crypto'
import { createErpNextClient, ErpNextError } from './lib/erpnext'
import { readDocTypeCatalog, writeDocTypeCatalog } from './lib/doctype-cache'
import { filterItems, patchItemCatalog, readItemCatalog, writeItemCatalog } from './lib/item-cache'
import { clearLocalSession, restoreLocalSession, startLocalSession } from './lib/session'
import { readProfiles, removeProfile, writeProfiles } from './lib/storage'
import { fuzzyMatch } from './lib/search'
import { buildVariantTree, hasMultipleUoms, mergeItemUoms, patchVariantCatalog, readVariantCatalog, writeVariantCatalog } from './lib/variant-cache'
import type { CachedItem, ConnectionProfile, DocTypeCatalogCache, DocTypeField, ItemCatalogCache, StoredProfile, VariantCatalogCache, VariantItem } from './lib/types'


function App() {
  const [profiles, setProfiles] = useState(readProfiles)
  const [connection, setConnection] = useState<ConnectionProfile | null>(null)
  const [restoring, setRestoring] = useState(true)
  useEffect(() => { restoreLocalSession().then(setConnection).finally(() => setRestoring(false)) }, [])
  async function unlock(profile: ConnectionProfile) { await startLocalSession(profile); setConnection(profile) }
  async function lock() { await clearLocalSession(); setConnection(null) }
  if (restoring) return <main className="flex min-h-screen items-center justify-center p-4"><div className="flex items-center gap-2 muted"><Spinner /> Restaurando sesión local...</div></main>
  if (!connection) return <ConnectionScreen profiles={profiles} onUnlock={unlock} onProfilesChange={setProfiles} />
  return <AppShell connection={connection} onLock={lock} />
}

function ConnectionScreen({ profiles, onUnlock, onProfilesChange }: { profiles: StoredProfile[]; onUnlock: (p: ConnectionProfile) => Promise<void>; onProfilesChange: (p: StoredProfile[]) => void }) {
  const [selected, setSelected] = useState<StoredProfile | null>(null)
  const [form, setForm] = useState({ label: '', baseUrl: '', apiKey: '', apiSecret: '', passphrase: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'new' | 'unlock'>('new')

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (mode === 'unlock' && selected) {
        onUnlock(await decryptProfile(selected, form.passphrase))
        return
      }
      const profile: ConnectionProfile = { id: crypto.randomUUID(), label: form.label.trim() || new URL(form.baseUrl).hostname, baseUrl: normalizeBaseUrl(form.baseUrl), apiKey: form.apiKey.trim(), apiSecret: form.apiSecret.trim() }
      if (!profile.apiKey || !profile.apiSecret) throw new Error('La API Key y el API Secret son obligatorios.')
      const stored = await encryptProfile(profile, form.passphrase)
      const next = [...profiles.filter((p) => p.id !== stored.id), stored]
      writeProfiles(next); onProfilesChange(next); onUnlock(profile)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la conexión.') } finally { setBusy(false) }
  }

  function deleteProfile(profile: StoredProfile) { if (!confirm(`¿Eliminar el perfil local “${profile.label}”?`)) return; removeProfile(profile.id); const next = profiles.filter((p) => p.id !== profile.id); onProfilesChange(next); if (selected?.id === profile.id) setSelected(null) }

  return <main className="flex min-h-screen items-center justify-center p-4"><section className="card w-full max-w-lg p-6 sm:p-8">
    <div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600">ERPNext Local Admin</p><h1 className="text-2xl font-bold text-slate-900">Conecta tu instancia</h1><p className="mt-2 muted">Las credenciales se cifran y permanecen solo en este navegador.</p></div>
    {profiles.length > 0 && <div className="mb-6 grid gap-2"><p className="field-label">Perfiles guardados</p>{profiles.map((profile) => <div key={profile.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3"><button className="min-w-0 flex-1 text-left" onClick={() => { setSelected(profile); setMode('unlock'); setForm((f) => ({ ...f, passphrase: '' })) }}><strong className="block truncate text-sm">{profile.label}</strong><span className="block truncate text-xs text-slate-500">{profile.baseUrl}</span></button><Button variant="danger" onClick={() => deleteProfile(profile)}>Eliminar</Button></div>)}</div>}
    {error && <div className="mb-4"><Notice>{error}</Notice></div>}
    <form className="grid gap-4" onSubmit={submit}>
      {mode === 'unlock' && selected ? <><div className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{selected.label}</strong><span className="ml-2 text-slate-500">{selected.baseUrl}</span></div><Field label="Contraseña local"><Input autoFocus type="password" value={form.passphrase} onChange={(e) => setForm({ ...form, passphrase: e.target.value })} required /></Field><div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? <Spinner /> : 'Desbloquear'}</Button><Button type="button" variant="secondary" onClick={() => { setMode('new'); setSelected(null); setError('') }}>Nueva conexión</Button></div></> : <><Field label="Nombre del perfil"><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Mi ERPNext" /></Field><Field label="URL de ERPNext"><Input type="url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://erp.example.com" required /></Field><Field label="API Key"><Input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} required autoComplete="off" /></Field><Field label="API Secret"><Input type="password" value={form.apiSecret} onChange={(e) => setForm({ ...form, apiSecret: e.target.value })} required autoComplete="off" /></Field><Field label="Contraseña local"><Input type="password" value={form.passphrase} onChange={(e) => setForm({ ...form, passphrase: e.target.value })} minLength={8} required placeholder="Mínimo 8 caracteres" /></Field><Button type="submit" disabled={busy}>{busy ? <Spinner /> : 'Cifrar y conectar'}</Button></>}
    </form>
  </section></main>
}

function AppShell({ connection, onLock }: { connection: ConnectionProfile; onLock: () => void }) {
  const client = useMemo(() => createErpNextClient(connection), [connection])
  return <div className="min-h-screen lg:flex"><aside className="border-b border-slate-200 bg-white lg:min-h-screen lg:border-b-0 lg:border-r"><div className="flex items-center justify-between gap-3 p-4 lg:block"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">ERPNext Admin</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{connection.label}</p></div><button className="text-xs font-semibold text-slate-500 hover:text-slate-900" onClick={onLock}>Bloquear</button></div><nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:grid lg:gap-1 lg:px-3"><NavLink to="/items">Productos</NavLink><NavLink to="/variants">Variantes</NavLink><NavLink to="/doctypes">DocTypes</NavLink><NavLink to="/settings">Conexión</NavLink></nav></aside><main className="min-w-0 flex-1"><Routes><Route element={<PageLayout client={client} />}><Route path="/" element={<Navigate to="/items" replace />} /><Route path="/items" element={<ItemsPage client={client} profileId={connection.id} />} /><Route path="/items/new" element={<ItemEditorPage client={client} profileId={connection.id} />} /><Route path="/items/:name" element={<ItemEditorPage client={client} profileId={connection.id} />} /><Route path="/variants" element={<VariantsPage client={client} profileId={connection.id} />} /><Route path="/variants/new" element={<VariantEditorPage client={client} profileId={connection.id} />} /><Route path="/variants/:name" element={<VariantEditorPage client={client} profileId={connection.id} />} /><Route path="/doctypes" element={<DocTypesPage client={client} profileId={connection.id} />} /><Route path="/settings" element={<SettingsPage connection={connection} onLock={onLock} />} /></Route></Routes></main></div>
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) { const location = useLocation(); const active = location.pathname === to; return <Link className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`} to={to}>{children}</Link> }
function PageLayout({ children }: { client: ReturnType<typeof createErpNextClient>; children?: React.ReactNode }) { return <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">{children ?? <Outlet />}</div> }

function ItemsPage({ client, profileId }: { client: ReturnType<typeof createErpNextClient>; profileId: string }) {
  const [searchInput, setSearchInput] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(0); const [syncMessage, setSyncMessage] = useState(''); const pageLength = 25
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const catalog = useQuery({ queryKey: ['item-catalog', profileId], queryFn: () => readItemCatalog(profileId), staleTime: Infinity })
  const refresh = useMutation({ mutationFn: async () => { const items: CachedItem[] = []; let start = 0; const batchSize = 500; while (true) { setSyncMessage(`Descargando productos: ${items.length}`); const batch = await client.listDocuments<CachedItem>('Item', { fields: ['name', 'item_code', 'item_name', 'item_group', 'stock_uom', 'disabled'], start, pageLength: batchSize, orderBy: 'modified desc' }); items.push(...batch.data); if (batch.data.length < batchSize) break; start += batch.data.length } const searchDetails = await readItemSearchDetails(client, items, setSyncMessage); const next: ItemCatalogCache = { profileId, updatedAt: new Date().toISOString(), items: items.map((item) => ({ ...item, ...(searchDetails[item.name] ?? { barcodes: [] }) })) }; return writeItemCatalog(next) }, onSuccess: async (next) => { queryClient.setQueryData(['item-catalog', profileId], next); setSyncMessage(`Catálogo actualizado: ${next.items.length} productos`) }, onError: (error) => setSyncMessage(error.message) })
  const filtered = useMemo(() => filterItems(catalog.data?.items ?? [], search), [catalog.data?.items, search])
  const rows = filtered.slice(page * pageLength, (page + 1) * pageLength)
  const hasCache = Boolean(catalog.data)
  const updated = catalog.data ? new Date(catalog.data.updatedAt).toLocaleString() : ''
  return <section><PageHeader title="Productos" description="Busca por nombre, código, SKU, barcode o cualquier dato disponible en la caché local." action={<Button onClick={() => navigate('/items/new')}>Nuevo producto</Button>} /><div className="card overflow-hidden"><div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(0) }}><Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Ej. nupec cahorro, royal lata adulto o barcode..." /><Button type="submit">Buscar</Button></form><Button type="button" variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? <><Spinner /> <span className="ml-2">Actualizando</span></> : 'Refrescar catálogo'}</Button></div><div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-3 text-xs text-slate-500"><span>{hasCache ? `${catalog.data?.items.length ?? 0} productos en caché` : 'Catálogo sin descargar'}</span>{search && <span>Filtro: “{search}”</span>}{updated && <span>Actualizado: {updated}</span>}{syncMessage && <span className="font-medium text-blue-700">{syncMessage}</span>}</div>{catalog.isError && <div className="p-4"><Notice>{catalog.error.message}</Notice></div>}{refresh.isError && <div className="p-4"><Notice>{refresh.error.message}</Notice></div>}{catalog.isPending ? <div className="flex justify-center p-12"><Spinner /></div> : !hasCache ? <div className="p-12 text-center"><p className="font-medium text-slate-700">Aún no hay productos en la caché local.</p><p className="mt-1 muted">Pulsa “Refrescar catálogo” para descargar todos los Items una sola vez.</p></div> : rows.length === 0 ? <div className="p-12 text-center muted">No se encontraron productos.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Código</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Grupo</th><th className="px-4 py-3">UOM</th><th className="px-4 py-3">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={String(row.name)} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/items/${encodeURIComponent(String(row.name))}`)}><td className="px-4 py-3 font-mono text-xs">{String(row.name)}</td><td className="px-4 py-3 font-medium">{String(row.item_name ?? '—')}</td><td className="px-4 py-3">{String(row.item_group ?? '—')}</td><td className="px-4 py-3">{String(row.stock_uom ?? '—')}</td><td className="px-4 py-3">{row.disabled ? 'Deshabilitado' : 'Activo'}</td></tr>)}</tbody></table></div>}<div className="flex items-center justify-between border-t border-slate-200 p-4"><span className="muted">Página {page + 1} · {filtered.length} resultados</span><div className="flex gap-2"><Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button><Button variant="secondary" disabled={(page + 1) * pageLength >= filtered.length} onClick={() => setPage((p) => p + 1)}>Siguiente</Button></div></div></div></section>
}

function VariantsPage({ client, profileId }: { client: ReturnType<typeof createErpNextClient>; profileId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['variant-catalog', profileId], queryFn: () => readVariantCatalog(profileId), staleTime: Infinity })
  const [syncMessage, setSyncMessage] = useState('')
  const [view, setView] = useState<'tree' | 'uoms'>('tree')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const refresh = useMutation({ mutationFn: async () => { const items: VariantItem[] = []; let start = 0; const batchSize = 500; while (true) { setSyncMessage(`Descargando productos y variantes: ${items.length}`); const batch = await client.listDocuments<VariantItem>('Item', { fields: ['name', 'item_code', 'item_name', 'item_group', 'stock_uom', 'variant_of', 'has_variants', 'disabled'], start, pageLength: batchSize, orderBy: 'item_name asc' }); items.push(...batch.data); if (batch.data.length < batchSize) break; start += batch.data.length } const searchDetails = await readItemSearchDetails(client, items, setSyncMessage); const enrichedItems = items.map((item) => ({ ...item, ...(searchDetails[item.name] ?? { barcodes: [] }) })); let uomRows: Array<{ parent: string; uom: string; conversion_factor: number }> = []; try { let uomStart = 0; while (true) { setSyncMessage(`Descargando UOM: ${uomRows.length}`); const batch = await client.listDocuments<{ parent: string; uom: string; conversion_factor: number }>('UOM Conversion Detail', { fields: ['parent', 'uom', 'conversion_factor'], filters: [['parenttype', '=', 'Item'], ['parentfield', '=', 'uoms']], start: uomStart, pageLength: batchSize, orderBy: 'parent asc, idx asc' }); uomRows.push(...batch.data); if (batch.data.length < batchSize) break; uomStart += batch.data.length } } catch (error) { if (!(error instanceof ErpNextError) || error.status !== 403) throw error; setSyncMessage('Sin permiso para leer UOM directamente; usando los Items...'); uomRows = await readItemUomsThroughItems(client, enrichedItems, setSyncMessage) } const next: VariantCatalogCache = { profileId, updatedAt: new Date().toISOString(), items: mergeItemUoms(enrichedItems, uomRows) }; return writeVariantCatalog(next) }, onSuccess: async (next) => { queryClient.setQueryData(['variant-catalog', profileId], next); setSyncMessage(`Catálogo actualizado: ${next.items.length} productos`) }, onError: (error) => setSyncMessage(error.message) })
  const hasCache = Boolean(query.data)
  const tree = useMemo(() => buildVariantTree(query.data?.items ?? []), [query.data?.items])
  const uomSynced = Boolean(query.data?.items.some((item) => item.uoms !== undefined))
  const visibleRoots = tree.roots.filter((item) => variantNodeIsVisible(item, tree.children, view === 'uoms', search))
  const updated = query.data ? new Date(query.data.updatedAt).toLocaleString() : ''
  useEffect(() => {
    if (!search) return
    const matchingParents = new Set<string>()
    const collectParents = (item: VariantItem) => {
      const children = tree.children.get(item.name) ?? []
      const matchingChildren = children.filter((child) => variantNodeIsVisible(child, tree.children, view === 'uoms', search))
      if (matchingChildren.length) { matchingParents.add(item.name); matchingChildren.forEach(collectParents) }
    }
    tree.roots.forEach(collectParents)
    setExpanded(matchingParents)
  }, [tree, search, view])
  const expandableNames = query.data?.items.filter((item) => (tree.children.get(item.name) ?? []).length > 0).map((item) => item.name) ?? []
  const toggleExpanded = (name: string) => setExpanded((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next })
  return <section><PageHeader title="Variantes" description="Visualiza plantillas, variantes y presentaciones en una jerarquía local." action={<div className="flex flex-wrap gap-2"><Link className="button button-primary" to="/variants/new">Nuevo producto</Link><Button type="button" variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? <><Spinner /> <span className="ml-2">Actualizando</span></> : 'Refrescar catálogo'}</Button></div>} /><form className="mb-5 flex max-w-2xl gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()) }}><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar por código, nombre o UOM..." /><Button type="submit">Buscar</Button>{search && <Button type="button" variant="secondary" onClick={() => { setSearchInput(''); setSearch('') }}>Limpiar</Button>}</form><div className="mb-5 flex flex-wrap gap-2"><Button type="button" variant={view === 'tree' ? 'primary' : 'secondary'} onClick={() => setView('tree')}>Jerarquía completa</Button><Button type="button" variant={view === 'uoms' ? 'primary' : 'secondary'} onClick={() => setView('uoms')}>Múltiples UOM</Button><Button type="button" variant="secondary" onClick={() => setExpanded(new Set(expandableNames))}>Expandir todo</Button><Button type="button" variant="secondary" onClick={() => setExpanded(new Set())}>Colapsar todo</Button></div><div className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{hasCache ? `${query.data?.items.length ?? 0} productos en caché` : 'Catálogo sin descargar'}</span>{search && <span>Filtro: “{search}”</span>}{updated && <span>Actualizado: {updated}</span>}{syncMessage && <span className="font-medium text-blue-700">{syncMessage}</span>}</div>{view === 'uoms' && uomSynced && <div className="mb-5"><Notice tone="info">Los factores se expresan contra la UOM de stock: por ejemplo, 1 Bulto = 20 Kg. El segundo valor muestra la misma equivalencia para 2 unidades.</Notice></div>}{!uomSynced && hasCache && <div className="mb-5"><Notice tone="info">La caché existente todavía no contiene UOM. Pulsa “Refrescar catálogo” para cargar las presentaciones y sus factores de conversión.</Notice></div>}{query.isError && <Notice>{query.error.message}</Notice>}{refresh.isError && <Notice>{refresh.error.message}</Notice>}{query.isPending ? <div className="flex justify-center p-12"><Spinner /></div> : !hasCache ? <div className="card p-12 text-center"><p className="font-medium text-slate-700">Aún no hay productos en la caché de variantes.</p><p className="mt-1 muted">Pulsa “Refrescar catálogo” para descargar productos, plantillas, variantes y UOM.</p></div> : <div className="card divide-y divide-slate-100 overflow-hidden">{visibleRoots.length ? visibleRoots.map((item) => <VariantTreeNode key={item.name} item={item} childrenByParent={tree.children} uomOnly={view === 'uoms'} search={search} expanded={expanded} onToggle={toggleExpanded} />) : <div className="p-10 text-center muted">No hay coincidencias para la búsqueda actual.</div>}</div>}</section>
}

function variantMatches(item: VariantItem, search: string) {
  return fuzzyMatch(search, [item])
}

function variantNodeIsVisible(item: VariantItem, childrenByParent: Map<string, VariantItem[]>, uomOnly: boolean, search: string): boolean {
  const selfMatches = variantMatches(item, search) && (!uomOnly || hasMultipleUoms(item))
  return selfMatches || (childrenByParent.get(item.name) ?? []).some((child) => variantNodeIsVisible(child, childrenByParent, uomOnly, search))
}

function formatFactor(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('es-MX', { maximumFractionDigits: 4 })
}

function UomConversionSummary({ item }: { item: VariantItem }) {
  const stockUom = item.stock_uom ?? item.uoms?.[0]?.uom ?? 'Stock'
  const alternatives = (item.uoms ?? []).filter((uom) => uom.uom !== stockUom)
  if (!alternatives.length) return null
  const colors = ['border-emerald-200 bg-emerald-50 text-emerald-800', 'border-violet-200 bg-violet-50 text-violet-800', 'border-amber-200 bg-amber-50 text-amber-800', 'border-rose-200 bg-rose-50 text-rose-800']
  return <div className="mt-3 grid gap-2"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-800">Stock: {stockUom}</span><span className="text-slate-400">conversiones relativas al stock</span></div>{alternatives.map((uom, index) => <div className={`flex flex-wrap items-center gap-2 rounded border px-2 py-2 text-xs font-medium ${colors[index % colors.length]}`} key={`${item.name}-${uom.uom}`}><span>1 {uom.uom}</span><span className="font-bold">=</span><span>{formatFactor(uom.conversion_factor)} {stockUom}</span><span className="opacity-70">· 2 {uom.uom} = {formatFactor(uom.conversion_factor * 2)} {stockUom}</span></div>)}</div>
}

function VariantTreeNode({ item, childrenByParent, depth = 0, uomOnly = false, search = '', expanded, onToggle }: { item: VariantItem; childrenByParent: Map<string, VariantItem[]>; depth?: number; uomOnly?: boolean; search?: string; expanded: Set<string>; onToggle: (name: string) => void }) {
  const children = childrenByParent.get(item.name) ?? []
  const visibleChildren = children.filter((child) => variantNodeIsVisible(child, childrenByParent, uomOnly, search))
  const multipleUoms = hasMultipleUoms(item)
  if (uomOnly && !multipleUoms && !visibleChildren.length) return null
  const isTemplate = Boolean(item.has_variants) || children.length > 0
  const isExpanded = expanded.has(item.name)
  return <div><div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ paddingLeft: `${16 + depth * 28}px` }}><div className="flex min-w-0 flex-1 items-start gap-2"><div className="w-5 shrink-0 pt-0.5">{children.length > 0 && <button className="text-slate-500 hover:text-slate-900" aria-label={isExpanded ? `Ocultar variantes de ${item.name}` : `Mostrar variantes de ${item.name}`} aria-expanded={isExpanded} onClick={() => onToggle(item.name)}>{isExpanded ? '▾' : '▸'}</button>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-slate-900">{item.item_name || item.name}</strong>{isTemplate && <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Plantilla</span>}{multipleUoms && <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{item.uoms?.length} UOM</span>}{uomOnly && !multipleUoms && <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Contexto</span>}{item.disabled ? <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Deshabilitado</span> : null}</div><div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500"><span className="font-mono">{item.name}</span>{item.stock_uom && <span>Stock: {item.stock_uom}</span>}{children.length > 0 && <span>{children.length} variantes</span>}</div>{multipleUoms && <UomConversionSummary item={item} />}</div></div><div className="flex shrink-0 gap-2"><Link className="button button-secondary" to={`/variants/${encodeURIComponent(item.name)}`}>Editar</Link>{isTemplate && <Link className="button button-primary" to={`/variants/new?template=${encodeURIComponent(item.name)}`}>Nueva variante</Link>}</div></div>{isExpanded && visibleChildren.map((child) => <VariantTreeNode key={child.name} item={child} childrenByParent={childrenByParent} depth={depth + 1} uomOnly={uomOnly} search={search} expanded={expanded} onToggle={onToggle} />)}</div>
}

async function readItemUomsThroughItems(client: ReturnType<typeof createErpNextClient>, items: VariantItem[], setMessage: (message: string) => void) {
  const rows: Array<{ parent: string; uom: string; conversion_factor: number }> = []
  const concurrency = 8
  for (let start = 0; start < items.length; start += concurrency) {
    const batch = items.slice(start, start + concurrency)
    setMessage(`Leyendo UOM desde Items: ${Math.min(start + batch.length, items.length)} de ${items.length}`)
    const documents = await Promise.all(batch.map((item) => client.getDocument<VariantItem>('Item', item.name)))
    for (const document of documents) {
      for (const uom of document.uoms ?? []) rows.push({ parent: document.name, uom: uom.uom, conversion_factor: uom.conversion_factor })
    }
  }
  return rows
}

type ItemSearchDetails = { barcodes: string[]; sku?: unknown; barcode?: unknown }

async function readItemSearchDetails(client: ReturnType<typeof createErpNextClient>, items: Array<{ name: string }>, setMessage: (message: string) => void) {
  const details: Record<string, ItemSearchDetails> = {}
  const rows: Array<{ parent: string; barcode: string }> = []
  try {
    let start = 0
    while (true) {
      const batch = await client.listDocuments<{ parent: string; barcode: string }>('Item Barcode', { fields: ['parent', 'barcode'], filters: [['parenttype', '=', 'Item'], ['parentfield', '=', 'barcodes']], start, pageLength: 500, orderBy: 'parent asc, idx asc' })
      rows.push(...batch.data)
      if (batch.data.length < 500) break
      start += batch.data.length
    }
    for (const row of rows) (details[row.parent] ??= { barcodes: [] }).barcodes.push(row.barcode)
    return details
  } catch (error) {
    if (!(error instanceof ErpNextError) || ![403, 404].includes(error.status)) throw error
  }
  const concurrency = 8
  for (let start = 0; start < items.length; start += concurrency) {
    const batch = items.slice(start, start + concurrency)
    setMessage(`Leyendo códigos desde Items: ${Math.min(start + batch.length, items.length)} de ${items.length}`)
    const documents = await Promise.all(batch.map((item) => client.getDocument<Record<string, unknown>>('Item', item.name)))
    for (const document of documents) {
      const barcodes = Array.isArray(document.barcodes) ? document.barcodes.map((row) => typeof row === 'object' && row ? String((row as Record<string, unknown>).barcode ?? '') : '').filter(Boolean) : []
      details[String(document.name)] = { barcodes, sku: document.sku, barcode: document.barcode }
    }
  }
  return details
}

function VariantEditorPage({ client, profileId }: { client: ReturnType<typeof createErpNextClient>; profileId: string }) {
  const { name } = useParams<{ name: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isNew = !name || name === 'new'
  return <section><PageHeader title={isNew ? 'Nueva variante' : 'Editar producto'} description={isNew ? 'Crea un Item y asígnalo a una plantilla.' : `Edita el Item ${name}.`} /><VariantEditor client={client} profileId={profileId} name={isNew ? null : name} initialTemplate={searchParams.get('template') ?? ''} onClose={() => navigate('/variants')} /></section>
}

function VariantEditor({ client, profileId, name, initialTemplate, onClose }: { client: ReturnType<typeof createErpNextClient>; profileId: string; name: string | null; initialTemplate: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const meta = useQuery({ queryKey: ['doctype-meta', 'Item'], queryFn: () => client.getDocTypeMeta('Item') })
  async function updateVariantCache(saved: Record<string, unknown>) {
    const savedName = String(saved.name ?? name ?? '')
    const cache = await readVariantCatalog(profileId)
    if (!cache || !savedName) return
    const previous = cache.items.find((item) => item.name === savedName)
    const savedItem = { ...previous, ...saved, name: savedName } as VariantItem
    const next = await patchVariantCatalog(profileId, savedItem)
    if (next) queryClient.setQueryData(['variant-catalog', profileId], next)
  }
  if (meta.isError) return <Notice>{meta.error.message}</Notice>
  if (meta.isPending) return <Spinner />
  return <MetadataDocEditor client={client} doctype="Item" name={name} initialValues={{ variant_of: initialTemplate, has_variants: 0 }} onClose={onClose} onSaved={updateVariantCache} fields={meta.data.fields} />
}

function _LegacyVariantEditor({ client, profileId, name, initialTemplate, onClose }: { client: ReturnType<typeof createErpNextClient>; profileId: string; name: string | null; initialTemplate: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const catalog = useQuery({ queryKey: ['variant-catalog', profileId], queryFn: () => readVariantCatalog(profileId), staleTime: Infinity })
  const query = useQuery({ queryKey: ['variant-item', name], queryFn: () => client.getDocument<VariantItem>('Item', name!), enabled: Boolean(name) })
  const [form, setForm] = useState({ item_code: '', item_name: '', item_group: '', stock_uom: '', variant_of: initialTemplate, disabled: false })
  const [initialized, setInitialized] = useState(false)
  useEffect(() => { if (query.data && !initialized) { setForm({ item_code: query.data.name, item_name: query.data.item_name ?? '', item_group: query.data.item_group ?? '', stock_uom: query.data.stock_uom ?? '', variant_of: query.data.variant_of ?? '', disabled: Boolean(query.data.disabled) }); setInitialized(true) } }, [initialized, query.data])
  const templates = (catalog.data?.items ?? []).filter((item) => item.has_variants || (catalog.data?.items ?? []).some((candidate) => candidate.variant_of === item.name))
  const save = useMutation({ mutationFn: async () => { const payload: Record<string, unknown> = { item_name: form.item_name, item_group: form.item_group, stock_uom: form.stock_uom, variant_of: form.variant_of || null, disabled: form.disabled ? 1 : 0 }; if (!name) payload.item_code = form.item_code; return name ? client.updateDocument<VariantItem>('Item', name, payload) : client.createDocument<VariantItem>('Item', payload) }, onSuccess: async (saved) => { const savedItem = name ? { ...saved, name } : saved; const cache = await readVariantCatalog(profileId); if (cache && savedItem.name) { const next = { ...cache, updatedAt: new Date().toISOString(), items: [...cache.items.filter((item) => item.name !== savedItem.name), savedItem] }; await writeVariantCatalog(next); queryClient.setQueryData(['variant-catalog', profileId], next) } onClose() } })
  return <div className="card mb-6 p-5"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">{name ? `Editar ${name}` : 'Nueva variante'}</h2><p className="muted">Los permisos, nombres y validaciones finales pertenecen a ERPNext.</p></div><Button variant="secondary" onClick={onClose}>Cerrar</Button></div>{query.isError && <div className="mb-4"><Notice>{query.error.message}</Notice></div>}{save.isError && <div className="mb-4"><Notice>{save.error.message}</Notice></div>}{query.isPending && name ? <Spinner /> : <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>{!name && <Field label="Código del Item"><Input value={form.item_code} onChange={(e) => setForm({ ...form, item_code: e.target.value })} required /></Field>}<Field label="Nombre del producto"><Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} required /></Field><Field label="Grupo de producto"><Input value={form.item_group} onChange={(e) => setForm({ ...form, item_group: e.target.value })} required /></Field><Field label="Unidad de stock"><Input value={form.stock_uom} onChange={(e) => setForm({ ...form, stock_uom: e.target.value })} required /></Field><label className="field"><span className="field-label">Plantilla padre</span><select className="control" value={form.variant_of} onChange={(e) => setForm({ ...form, variant_of: e.target.value })}><option value="">Sin plantilla</option>{templates.map((template) => <option key={template.name} value={template.name}>{template.item_name || template.name} ({template.name})</option>)}</select></label><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.disabled} onChange={(e) => setForm({ ...form, disabled: e.target.checked })} /> Item deshabilitado</label><div className="sm:col-span-2"><Button type="submit" disabled={save.isPending}>{save.isPending ? <Spinner /> : 'Guardar producto'}</Button></div></form>}</div>
}

function ItemEditorPage({ client, profileId }: { client: ReturnType<typeof createErpNextClient>; profileId: string }) {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const isNew = !name || name === 'new'
  const queryClient = useQueryClient()
  const meta = useQuery({ queryKey: ['doctype-meta', 'Item'], queryFn: () => client.getDocTypeMeta('Item') })
  return <section><PageHeader title={isNew ? 'Nuevo producto' : 'Editar producto'} description={isNew ? 'Crea un Item usando todos los campos del metadata de ERPNext.' : `Edita el Item ${name} usando todos los campos disponibles.`} />{meta.isError && <Notice>{meta.error.message}</Notice>}{meta.isPending ? <Spinner /> : <MetadataDocEditor client={client} doctype="Item" name={isNew ? null : name} fields={meta.data?.fields ?? []} onClose={() => navigate('/items')} onSaved={async (saved) => { const savedName = String(saved.name ?? name ?? ''); if (savedName) { const next = await patchItemCatalog(profileId, { ...saved, name: savedName } as CachedItem); if (next) queryClient.setQueryData(['item-catalog', profileId], next) } await queryClient.invalidateQueries({ queryKey: ['variant-catalog', profileId] }) }} />}</section>
}

function _ItemEditor({ client, name, onClose }: { client: ReturnType<typeof createErpNextClient>; name: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['item', name], queryFn: () => client.getDocument<Record<string, unknown>>('Item', name!), enabled: Boolean(name) })
  const [form, setForm] = useState<Record<string, string>>({ item_name: '', item_group: '', stock_uom: '', description: '' })
  const [initialized, setInitialized] = useState(false)
  useEffect(() => { if (query.data && !initialized) { setForm({ item_name: String(query.data.item_name ?? ''), item_group: String(query.data.item_group ?? ''), stock_uom: String(query.data.stock_uom ?? ''), description: String(query.data.description ?? '') }); setInitialized(true) } }, [query.data, initialized])
  const save = useMutation({ mutationFn: () => name ? client.updateDocument('Item', name, form) : client.createDocument('Item', form), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['items'] }); onClose() } })
  return <div className="card mb-6 p-5"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">{name ? `Editar ${name}` : 'Nuevo producto'}</h2><p className="muted">Los permisos y validaciones finales pertenecen a ERPNext.</p></div><Button variant="secondary" onClick={onClose}>Cerrar</Button></div>{query.isError && <div className="mb-4"><Notice>{query.error.message}</Notice></div>}{save.isError && <div className="mb-4"><Notice>{save.error.message}</Notice></div>}{query.isPending && name ? <Spinner /> : <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate() }}><Field label="Nombre del producto"><Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} required /></Field><Field label="Grupo de producto"><Input value={form.item_group} onChange={(e) => setForm({ ...form, item_group: e.target.value })} required /></Field><Field label="Unidad de stock"><Input value={form.stock_uom} onChange={(e) => setForm({ ...form, stock_uom: e.target.value })} required /></Field><label className="field sm:col-span-2"><span className="field-label">Descripción</span><textarea className="control min-h-24 py-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><div className="sm:col-span-2"><Button type="submit" disabled={save.isPending}>{save.isPending ? <Spinner /> : 'Guardar cambios'}</Button></div></form>}</div>
}

function DocTypesPage({ client, profileId }: { client: ReturnType<typeof createErpNextClient>; profileId: string }) {
  const [doctype, setDoctype] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [doctypeSearchInput, setDoctypeSearchInput] = useState('')
  const [doctypeSearch, setDoctypeSearch] = useState('')
  const [documentSearchInput, setDocumentSearchInput] = useState('')
  const [documentSearch, setDocumentSearch] = useState('')
  const [syncMessage, setSyncMessage] = useState('')
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['doctype-catalog', profileId], queryFn: () => readDocTypeCatalog(profileId), staleTime: Infinity })
  const refresh = useMutation({ mutationFn: async () => { const doctypes: Array<{ name: string }> = []; let start = 0; const batchSize = 500; while (true) { setSyncMessage(`Descargando DocTypes: ${doctypes.length}`); const batch = await client.listDocuments<{ name: string }>('DocType', { fields: ['name'], start, pageLength: batchSize, orderBy: 'name asc' }); doctypes.push(...batch.data); if (batch.data.length < batchSize) break; start += batch.data.length } const next: DocTypeCatalogCache = { profileId, updatedAt: new Date().toISOString(), doctypes }; return writeDocTypeCatalog(next) }, onSuccess: async (next) => { queryClient.setQueryData(['doctype-catalog', profileId], next); setSyncMessage(`DocTypes actualizados: ${next.doctypes.length}`) }, onError: (error) => setSyncMessage(error.message) })
  const names = useMemo(() => query.data?.doctypes ?? [], [query.data?.doctypes])
  const hasCache = Boolean(query.data)
  const updated = query.data ? new Date(query.data.updatedAt).toLocaleString() : ''
  useEffect(() => { if (!doctype && names[0]?.name) setDoctype(names[0].name) }, [doctype, names])
  const meta = useQuery({ queryKey: ['doctype-meta', doctype], queryFn: () => client.getDocTypeMeta(doctype), enabled: Boolean(doctype) })
  const allFields = meta.data?.fields.filter((field) => field.fieldname) ?? []
  const listFields = allFields.filter((field) => !field.hidden && !['Table', 'Table MultiSelect', 'Section Break', 'Column Break', 'Tab Break'].includes(field.fieldtype ?? '')).slice(0, 16)
  const metadataSingle = Boolean(meta.data?.is_single || meta.data?.issingle)
  const list = useQuery({ queryKey: ['doctype-list', doctype, listFields.map((field) => field.fieldname)], queryFn: () => client.listDocuments<Record<string, unknown>>(doctype, { fields: ['name', ...listFields.map((field) => field.fieldname)], pageLength: 50, orderBy: 'modified desc' }), enabled: Boolean(doctype && listFields.length && !metadataSingle) })
  const single = useQuery({ queryKey: ['doctype-single', doctype], queryFn: () => client.getDocument<Record<string, unknown>>(doctype, doctype), enabled: Boolean(doctype && (metadataSingle || list.isError)) })
  const isSingle = metadataSingle || Boolean(single.data)
  const rows = isSingle && single.data ? [single.data] : list.data?.data ?? []
  const filteredNames = names.filter((item) => fuzzyMatch(doctypeSearch, [item.name]))
  const visibleRows = rows.filter((row) => fuzzyMatch(documentSearch, [row]))
  return <section><PageHeader title="DocTypes" description="Usa la caché local; ERPNext solo se consulta al actualizarla." action={<Button type="button" variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? <><Spinner /> <span className="ml-2">Actualizando</span></> : 'Refrescar DocTypes'}</Button>} /><form className="mb-3 flex max-w-2xl gap-2" onSubmit={(event) => { event.preventDefault(); setDoctypeSearch(doctypeSearchInput.trim()) }}><Input value={doctypeSearchInput} onChange={(event) => setDoctypeSearchInput(event.target.value)} placeholder="Buscar DocType por nombre o ID..." /><Button type="submit">Buscar</Button></form><div className="mb-5 flex flex-col gap-3 sm:flex-row"><select className="control max-w-md" value={doctype} onChange={(event) => { setDoctype(event.target.value); setSelected(null); setDocumentSearchInput(''); setDocumentSearch('') }} disabled={!hasCache}><option value="">Selecciona un DocType</option>{filteredNames.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>{meta.isPending && <div className="flex items-center gap-2 muted"><Spinner /> Cargando metadata</div>}</div><div className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{hasCache ? `${names.length} DocTypes en caché` : 'DocTypes sin descargar'}</span>{doctypeSearch && <span>Filtro: “{doctypeSearch}”</span>}{updated && <span>Actualizados: {updated}</span>}{syncMessage && <span className="font-medium text-blue-700">{syncMessage}</span>}</div>{isSingle && <div className="mb-5"><Notice tone="info">Este DocType es Single: ERPNext guarda una sola configuración, no una tabla de registros.</Notice></div>}{selected && doctype && <GenericDocEditor client={client} doctype={doctype} name={selected} fields={allFields} onClose={() => setSelected(null)} />}{query.isError && <Notice>{query.error.message}</Notice>}{refresh.isError && <Notice>{refresh.error.message}</Notice>}{meta.isError && <Notice>{meta.error.message}</Notice>}{list.isError && !single.data && <Notice>{list.error.message}</Notice>}{single.isError && !list.data && <Notice>{single.error.message}</Notice>}{query.isPending ? <div className="flex justify-center p-12"><Spinner /></div> : !hasCache ? <div className="card p-10 text-center"><p className="font-medium text-slate-700">Aún no hay DocTypes en la caché local.</p><p className="mt-1 muted">Pulsa “Refrescar DocTypes” para descargarlos una sola vez.</p></div> : list.isPending || single.isPending ? <Spinner /> : <div className="card overflow-x-auto"><form className="flex gap-2 border-b border-slate-200 p-4" onSubmit={(event) => { event.preventDefault(); setDocumentSearch(documentSearchInput.trim()) }}><Input value={documentSearchInput} onChange={(event) => setDocumentSearchInput(event.target.value)} placeholder="Buscar registros por ID o cualquier campo..." /><Button type="submit">Buscar</Button></form>{visibleRows.length ? <table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Nombre</th>{listFields.slice(0, 5).map((field) => <th className="px-4 py-3" key={field.fieldname}>{field.label ?? field.fieldname}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{visibleRows.map((row) => <tr className="cursor-pointer hover:bg-slate-50" key={String(row.name ?? doctype)} onClick={() => setSelected(String(row.name ?? doctype))}><td className="px-4 py-3 font-mono text-xs">{String(row.name ?? doctype)}</td>{listFields.slice(0, 5).map((field) => <td className="px-4 py-3" key={field.fieldname}>{String(row[field.fieldname] ?? '—')}</td>)}</tr>)}</tbody></table> : <div className="p-10 text-center muted">No hay coincidencias.</div>}</div>}</section>
}

function GenericDocEditor({ client, doctype, name, fields, onClose }: { client: ReturnType<typeof createErpNextClient>; doctype: string; name: string; fields: DocTypeField[]; onClose: () => void }) {
  return <MetadataDocEditor client={client} doctype={doctype} name={name} fields={fields} onClose={onClose} />
}

function _LegacyGenericDocEditor({ client, doctype, name, fields, onClose }: { client: ReturnType<typeof createErpNextClient>; doctype: string; name: string; fields: DocTypeField[]; onClose: () => void }) {
  const queryClient = useQueryClient(); const query = useQuery({ queryKey: ['document', doctype, name], queryFn: () => client.getDocument<Record<string, unknown>>(doctype, name) }); const [form, setForm] = useState<Record<string, string>>({}); const [initialized, setInitialized] = useState(false)
  useEffect(() => { if (query.data && !initialized) { setForm(Object.fromEntries(fields.map((field) => [field.fieldname, String(query.data[field.fieldname] ?? '')]))); setInitialized(true) } }, [fields, initialized, query.data])
  const save = useMutation({ mutationFn: () => client.updateDocument(doctype, name, form), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['doctype-list', doctype] }); await queryClient.invalidateQueries({ queryKey: ['document', doctype, name] }); onClose() } })
  return <div className="card mb-5 p-5"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-bold">{doctype}: {name}</h2><p className="muted">Edita campos simples; tablas hijas y reglas de negocio permanecen en ERPNext.</p></div><Button variant="secondary" onClick={onClose}>Cerrar</Button></div>{query.isError && <Notice>{query.error.message}</Notice>}{save.isError && <div className="mt-3"><Notice>{save.error.message}</Notice></div>}{query.isPending ? <Spinner /> : <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>{fields.filter((field) => !field.read_only && field.fieldtype !== 'Table' && field.fieldtype !== 'Section Break' && field.fieldtype !== 'Column Break').map((field) => <Field key={field.fieldname} label={field.label ?? field.fieldname}><Input value={form[field.fieldname] ?? ''} onChange={(event) => setForm({ ...form, [field.fieldname]: event.target.value })} required={Boolean(field.reqd)} /></Field>)}<div className="sm:col-span-2"><Button type="submit" disabled={save.isPending}>{save.isPending ? <Spinner /> : 'Guardar documento'}</Button></div></form>}</div>
}
function SettingsPage({ connection, onLock }: { connection: ConnectionProfile; onLock: () => void }) { const [user, setUser] = useState(''); const [error, setError] = useState(''); const client = useMemo(() => createErpNextClient(connection), [connection]); const test = useMutation({ mutationFn: client.getCurrentUser, onSuccess: setUser, onError: (e) => setError(e.message) }); return <section><PageHeader title="Conexión" description="La configuración se mantiene únicamente en este navegador." /><div className="card max-w-2xl p-5"><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="field-label">Perfil</dt><dd className="mt-1 text-sm font-medium">{connection.label}</dd></div><div><dt className="field-label">Instancia</dt><dd className="mt-1 break-all text-sm font-medium">{connection.baseUrl}</dd></div></dl><div className="mt-6 flex flex-wrap gap-2"><Button onClick={() => { setError(''); test.mutate() }} disabled={test.isPending}>{test.isPending ? <Spinner /> : 'Probar conexión'}</Button><Button variant="secondary" onClick={onLock}>Bloquear sesión</Button></div>{user && <Notice tone="info">Conectado como {user}</Notice>}{error && <div className="mt-4"><Notice>{error}</Notice></div>}</div></section> }

export default App
