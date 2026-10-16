import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MetadataDocEditor } from '../components/metadata-editor'
import { Button, ButtonLink, Notice, PageHeader, Spinner } from '../components/ui'
import { UomEditor, type UomEditorValues } from '../components/uom-editor'
import { createErpNextClient } from '../lib/erpnext'
import { patchItemCatalog } from '../lib/item-cache'
import { patchVariantCatalog, readVariantCatalog } from '../lib/variant-cache'
import { readUomCatalog, writeUomCatalog } from '../lib/uom-cache'
import { syncUomCatalog, UOM_CACHE_TTL_MS } from '../lib/catalog-sync'
import type { CachedItem, VariantItem } from '../lib/types'
import { queryKeys } from '../lib/query-keys'

type Client = ReturnType<typeof createErpNextClient>

export function VariantEditorPage({ client, profileId }: { client: Client; profileId: string }) {
  const { name } = useParams<{ name: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isNew = !name || name === 'new'
  return <section><PageHeader title={isNew ? 'Nueva variante' : 'Editar producto'} description={isNew ? 'Crea un Item y asígnalo a una plantilla.' : `Edita el Item ${name}.`} action={!isNew && name ? <ButtonLink variant="secondary" to={`/items/${encodeURIComponent(name)}/uoms`}>Configurar UOM</ButtonLink> : undefined} /><VariantEditor client={client} profileId={profileId} name={isNew ? null : name} initialTemplate={searchParams.get('template') ?? ''} onClose={() => navigate('/variants')} /></section>
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
    if (next) queryClient.setQueryData(['variant-catalog', profileId], next)
  }
  if (meta.isError) return <Notice>{meta.error.message}</Notice>
  if (meta.isPending) return <Spinner />
  return <MetadataDocEditor client={client} doctype="Item" name={name} initialValues={{ variant_of: initialTemplate, has_variants: 0 }} onClose={onClose} onSaved={updateVariantCache} fields={meta.data.fields} />
}

export function ItemEditorPage({ client, profileId }: { client: Client; profileId: string }) {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const isNew = !name || name === 'new'
  const queryClient = useQueryClient()
  const meta = useQuery({ queryKey: queryKeys.metadata.doctype(profileId, 'Item'), queryFn: () => client.getDocTypeMeta('Item') })
  return <section><PageHeader title={isNew ? 'Nuevo producto' : 'Editar producto'} description={isNew ? 'Crea un Item usando todos los campos del metadata de ERPNext.' : `Edita el Item ${name} usando todos los campos disponibles.`} action={!isNew && name ? <ButtonLink variant="secondary" to={`/items/${encodeURIComponent(name)}/uoms`}>Configurar UOM</ButtonLink> : undefined} />{meta.isError && <Notice>{meta.error.message}</Notice>}{meta.isPending ? <Spinner /> : <MetadataDocEditor client={client} doctype="Item" name={isNew ? null : name} fields={meta.data?.fields ?? []} onClose={() => navigate('/items')} onSaved={async (saved) => { const savedName = String(saved.name ?? name ?? ''); if (savedName) { const next = await patchItemCatalog(profileId, { ...saved, name: savedName } as CachedItem); if (next) queryClient.setQueryData(['item-catalog', profileId], next) } await queryClient.invalidateQueries({ queryKey: ['variant-catalog', profileId] }) }} />}</section>
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
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const item = useQuery({ queryKey: queryKeys.item.detail(profileId, name ?? ''), queryFn: () => client.getDocument<Record<string, unknown>>('Item', name!), enabled: Boolean(name), staleTime: 5 * 60 * 1000 })
  const uoms = useQuery({ queryKey: queryKeys.uom.options(profileId), queryFn: async () => { const cached = await readUomCatalog(profileId); const next = await syncUomCatalog(client, profileId, cached); if (next !== cached) await writeUomCatalog(next); return next.uoms }, staleTime: UOM_CACHE_TTL_MS, gcTime: UOM_CACHE_TTL_MS * 2 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const values = useMemo(() => item.data ? readUomValues(item.data) : null, [item.data])

  async function save(next: UomEditorValues) {
    if (!name) return
    setBusy(true); setError('')
    try {
      const saved = await client.updateDocument<Record<string, unknown>>('Item', name, { stock_uom: next.stockUom, sales_uom: next.salesUom || null, purchase_uom: next.purchaseUom || null, uoms: next.conversions })
      const savedItem = { ...saved, name, stock_uom: next.stockUom, sales_uom: next.salesUom, purchase_uom: next.purchaseUom, uoms: next.conversions }
      const itemCache = await patchItemCatalog(profileId, savedItem as CachedItem)
      const variantCache = await patchVariantCatalog(profileId, savedItem as VariantItem)
      if (itemCache) queryClient.setQueryData(['item-catalog', profileId], itemCache)
      if (variantCache) queryClient.setQueryData(['variant-catalog', profileId], variantCache)
      queryClient.setQueryData(['item-uoms', profileId, name], savedItem)
      await queryClient.invalidateQueries({ queryKey: ['item-catalog', profileId] })
      await queryClient.invalidateQueries({ queryKey: ['variant-catalog', profileId] })
      navigate(`/items/${encodeURIComponent(name)}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron guardar las UOM.') } finally { setBusy(false) }
  }

  if (!name) return <Notice>Falta el producto que se quiere editar.</Notice>
  if (item.isError) return <Notice>{item.error.message}</Notice>
  if (item.isPending || !values) return <Spinner />
  return <section><PageHeader title="UOM del producto" description="Administra la UOM base, las UOM predeterminadas y sus conversiones por producto." action={<Button variant="secondary" onClick={() => navigate(`/items/${encodeURIComponent(name)}`)}>Volver al producto</Button>} /><UomEditor itemName={name} itemLabel={String(item.data.item_name ?? '')} values={values} uomOptions={uoms.data ?? []} busy={busy} error={error || (uoms.isError ? `No se pudieron cargar sugerencias de UOM: ${uoms.error.message}` : '')} onSave={save} onCancel={() => navigate(`/items/${encodeURIComponent(name)}`)} /></section>
}
