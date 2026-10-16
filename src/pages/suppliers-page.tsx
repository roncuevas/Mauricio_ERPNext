import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MetadataDocEditor } from '../components/metadata-editor'
import { Button, Input, Notice, PageHeader, RefreshButton, SearchButton, Spinner } from '../components/ui'
import { createErpNextClient } from '../lib/erpnext'
import { listAllDocuments } from '../lib/pagination'
import { readSupplierCatalog, writeSupplierCatalog } from '../lib/supplier-cache'
import type { Supplier, SupplierCatalogCache } from '../lib/types'
import { queryKeys } from '../lib/query-keys'

type Client = ReturnType<typeof createErpNextClient>

export function SuppliersPage({ client, profileId }: { client: Client; profileId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: queryKeys.catalog.supplier(profileId), queryFn: () => readSupplierCatalog(profileId), staleTime: Infinity })
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const meta = useQuery({ queryKey: queryKeys.metadata.doctype(profileId, 'Supplier'), queryFn: () => client.getDocTypeMeta('Supplier'), enabled: creating })
  const refresh = useMutation({ mutationFn: async () => { const suppliers = await listAllDocuments<Supplier>(client, 'Supplier', { fields: ['name', 'supplier_name', 'supplier_group', 'supplier_type', 'country', 'disabled'], orderBy: 'supplier_name asc' }, (count) => setSyncMessage(`Descargando proveedores: ${count}`)); const next: SupplierCatalogCache = { profileId, updatedAt: new Date().toISOString(), suppliers }; return writeSupplierCatalog(next) }, onSuccess: (next) => { queryClient.setQueryData(queryKeys.catalog.supplier(profileId), next); setSyncMessage(`Proveedores actualizados: ${next.suppliers.length}`) }, onError: (error) => setSyncMessage(error.message) })
  const suppliers = (query.data?.suppliers ?? []).filter((supplier) => !search || [supplier.name, supplier.supplier_name, supplier.supplier_group, supplier.supplier_type, supplier.country].some((value) => String(value ?? '').toLocaleLowerCase().includes(search.toLocaleLowerCase())))
  async function onSaved(saved: Record<string, unknown>) { const created = { name: String(saved.name ?? ''), supplier_name: String(saved.supplier_name ?? saved.name ?? ''), supplier_group: String(saved.supplier_group ?? ''), supplier_type: String(saved.supplier_type ?? ''), country: String(saved.country ?? ''), disabled: Boolean(saved.disabled) }; const current = await readSupplierCatalog(profileId); if (current && created.name) { const next = { ...current, suppliers: [...current.suppliers.filter((supplier) => supplier.name !== created.name), created] }; await writeSupplierCatalog(next); queryClient.setQueryData(queryKeys.catalog.supplier(profileId), next) } else await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.supplier(profileId) }); setCreating(false); setSyncMessage(`Proveedor creado: ${created.supplier_name}`) }
  return <section>
    <PageHeader
      title="Proveedores"
      description="Consulta proveedores y crea nuevos registros en ERPNext."
      action={<div className="flex flex-wrap gap-2"><Button type="button" onClick={() => setCreating((current) => !current)}>{creating ? 'Cerrar formulario' : 'Nuevo proveedor'}</Button><RefreshButton label="Refrescar proveedores" onClick={() => refresh.mutate()} loading={refresh.isPending} /></div>}
      toolbar={<form onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()) }}><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar proveedor, grupo, tipo o país..." aria-label="Buscar proveedores" /><SearchButton label="Buscar proveedores" /></form>}
      status={<><span>{query.data ? `${query.data.suppliers.length} proveedores en caché` : 'Proveedores sin descargar'}</span>{syncMessage && <span className="font-medium text-blue-700">{syncMessage}</span>}</>}
    />
    {creating && <div className="mb-5">{meta.isError && <Notice>{meta.error.message}</Notice>}{meta.isPending ? <Spinner /> : <MetadataDocEditor client={client} profileId={profileId} doctype="Supplier" name={null} fields={meta.data?.fields ?? []} initialValues={{ supplier_type: 'Company' }} onClose={() => setCreating(false)} onSaved={onSaved} />}</div>}
    <div className="card overflow-hidden">
      {query.isError && <div className="p-4"><Notice>{query.error.message}</Notice></div>}
      {refresh.isError && <div className="p-4"><Notice>{refresh.error.message}</Notice></div>}
      {query.isPending ? <div className="flex justify-center p-12"><Spinner /></div> : !query.data ? <div className="p-12 text-center"><p className="font-medium text-slate-700">Aún no hay proveedores en la caché local.</p><p className="mt-1 muted">Pulsa “Refrescar proveedores” para descargarlos desde ERPNext.</p></div> : suppliers.length === 0 ? <div className="p-10 text-center muted">No hay coincidencias.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3">Grupo</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">País</th><th className="px-4 py-3">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{suppliers.map((supplier) => <tr key={supplier.name} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium">{supplier.supplier_name || supplier.name}</td><td className="px-4 py-3">{supplier.supplier_group || '—'}</td><td className="px-4 py-3">{supplier.supplier_type || '—'}</td><td className="px-4 py-3">{supplier.country || '—'}</td><td className="px-4 py-3">{supplier.disabled ? 'Deshabilitado' : 'Activo'}</td></tr>)}</tbody></table></div>}
    </div>
  </section>
}
