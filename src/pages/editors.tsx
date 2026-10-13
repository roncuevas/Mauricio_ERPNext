import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MetadataDocEditor } from '../components/metadata-editor'
import { Notice, PageHeader, Spinner } from '../components/ui'
import { createErpNextClient } from '../lib/erpnext'
import { patchItemCatalog } from '../lib/item-cache'
import { patchVariantCatalog, readVariantCatalog } from '../lib/variant-cache'
import type { CachedItem, VariantItem } from '../lib/types'

type Client = ReturnType<typeof createErpNextClient>

export function VariantEditorPage({ client, profileId }: { client: Client; profileId: string }) {
  const { name } = useParams<{ name: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isNew = !name || name === 'new'
  return <section><PageHeader title={isNew ? 'Nueva variante' : 'Editar producto'} description={isNew ? 'Crea un Item y asígnalo a una plantilla.' : `Edita el Item ${name}.`} /><VariantEditor client={client} profileId={profileId} name={isNew ? null : name} initialTemplate={searchParams.get('template') ?? ''} onClose={() => navigate('/variants')} /></section>
}

function VariantEditor({ client, profileId, name, initialTemplate, onClose }: { client: Client; profileId: string; name: string | null; initialTemplate: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const meta = useQuery({ queryKey: ['doctype-meta', 'Item'], queryFn: () => client.getDocTypeMeta('Item') })
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
  const meta = useQuery({ queryKey: ['doctype-meta', 'Item'], queryFn: () => client.getDocTypeMeta('Item') })
  return <section><PageHeader title={isNew ? 'Nuevo producto' : 'Editar producto'} description={isNew ? 'Crea un Item usando todos los campos del metadata de ERPNext.' : `Edita el Item ${name} usando todos los campos disponibles.`} />{meta.isError && <Notice>{meta.error.message}</Notice>}{meta.isPending ? <Spinner /> : <MetadataDocEditor client={client} doctype="Item" name={isNew ? null : name} fields={meta.data?.fields ?? []} onClose={() => navigate('/items')} onSaved={async (saved) => { const savedName = String(saved.name ?? name ?? ''); if (savedName) { const next = await patchItemCatalog(profileId, { ...saved, name: savedName } as CachedItem); if (next) queryClient.setQueryData(['item-catalog', profileId], next) } await queryClient.invalidateQueries({ queryKey: ['variant-catalog', profileId] }) }} />}</section>
}
