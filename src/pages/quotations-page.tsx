import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Button, Field, Input, Notice, PageHeader, RefreshButton, SearchButton, Spinner } from '../components/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { extractMappedSalesOrder, filterQuotations, quotationValidityState } from '../lib/quotations'
import { createErpNextClient } from '../lib/erpnext'
import type { PosProfile, QuotationDocument, QuotationSummary } from '../lib/types'

type Client = ReturnType<typeof createErpNextClient>

const quotationFields = ['name', 'quotation_to', 'party_name', 'customer_name', 'company', 'transaction_date', 'valid_till', 'status', 'currency', 'grand_total', 'modified']

function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-MX')
}

function formatMoney(value: number | undefined, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(Number(value ?? 0))
}

function QuotationDetailsSheet({ quotation, busy, currency, onClose, onCreateOrder }: { quotation: QuotationDocument | null; busy: boolean; currency: string; onClose: () => void; onCreateOrder: () => void }) {
  return <Sheet open={Boolean(quotation)} onOpenChange={(open) => { if (!open) onClose() }}><SheetContent side="right" className="quotation-details-sheet"><SheetHeader><SheetTitle>{quotation?.name ?? 'Cotización'}</SheetTitle><SheetDescription>{quotation?.customer_name || quotation?.party_name || 'Sin cliente'} · {quotation?.status ?? ''}</SheetDescription></SheetHeader>{quotation && <div className="quotation-details-body"><div className="quotation-detail-summary"><span>Empresa<strong>{quotation.company}</strong></span><span>Fecha<strong>{formatDate(quotation.transaction_date)}</strong></span><span>Válida hasta<strong>{formatDate(quotation.valid_till)}</strong></span><span>Total<strong>{formatMoney(quotation.grand_total, quotation.currency || currency)}</strong></span></div><div className="quotation-detail-items">{quotation.items.map((item, index) => <div className="quotation-detail-item" key={item.name ?? `${item.item_code}-${index}`}><div><strong>{item.item_name || item.item_code}</strong><small>{item.item_code} · {item.uom || item.stock_uom || 'UOM'}</small></div><span>{item.qty} × {formatMoney(item.rate, quotation.currency || currency)}</span></div>)}</div>{quotation.status === 'Open' ? <Button type="button" onClick={onCreateOrder} disabled={busy}>{busy ? <><Spinner /> Creando pedido</> : 'Crear pedido desde cotización'}</Button> : <Notice tone="info">Esta cotización está en borrador. Envíala desde ERPNext para poder convertirla en pedido.</Notice>}</div>}</SheetContent></Sheet>
}

export function QuotationsPage({ client, profileId }: { client: Client; profileId: string }) {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [profileName, setProfileName] = useState(searchParams.get('profile') ?? '')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Todas')
  const [selected, setSelected] = useState<QuotationDocument | null>(null)
  const [message, setMessage] = useState('')

  const profiles = useQuery({ queryKey: ['quotation-pos-profiles', profileId], queryFn: async () => (await client.listDocuments<PosProfile>('POS Profile', { fields: ['name', 'company', 'currency'], pageLength: 100, orderBy: 'name asc' })).data.filter((profile) => !profile.disabled) })
  const selectedProfile = profiles.data?.find((profile) => profile.name === profileName) ?? profiles.data?.[0]
  const quotations = useQuery({
    queryKey: ['quotations', profileId, selectedProfile?.company],
    enabled: Boolean(selectedProfile?.company),
    queryFn: async () => (await client.listDocuments<QuotationSummary>('Quotation', { fields: quotationFields, filters: [['company', '=', selectedProfile!.company], ['docstatus', 'in', [0, 1]]], pageLength: 100, orderBy: 'modified desc' })).data,
  })
  const filtered = useMemo(() => filterQuotations(quotations.data ?? [], search, status), [quotations.data, search, status])
  const convert = useMutation({
    mutationFn: async (quotation: QuotationDocument) => {
      const mapped = await client.callMethod<unknown>('frappe.model.mapper.make_mapped_doc', { method: 'erpnext.selling.doctype.quotation.quotation.make_sales_order', source_name: quotation.name, args: JSON.stringify({}), selected_children: JSON.stringify({}) })
      const payload = extractMappedSalesOrder(mapped)
      if (!payload) throw new Error('ERPNext no devolvió un Sales Order mapeado para esta cotización.')
      return client.createDocument<{ name: string }>('Sales Order', payload)
    },
    onSuccess: async (created) => { setMessage(`Pedido creado como borrador: ${created.name}`); setSelected(null); await queryClient.invalidateQueries({ queryKey: ['quotations', profileId] }) },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'No se pudo crear el pedido.'),
  })

  async function openQuotation(name: string) {
    try { setMessage(''); setSelected(await client.getDocument<QuotationDocument>('Quotation', name)) } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cargar la cotización.') }
  }

  return <section className="quotations-workspace"><PageHeader title="Cotizaciones" description="Consulta cotizaciones activas y conviértelas en pedidos siguiendo el flujo de ERPNext." action={<RefreshButton label="Refrescar cotizaciones" onClick={() => quotations.refetch()} loading={quotations.isFetching} />} />{profiles.data?.length ? <div className="quotation-context card"><Field label="POS Profile"><Select value={selectedProfile?.name ?? undefined} onValueChange={(value) => { setProfileName(value); setMessage('') }}><SelectTrigger aria-label="POS Profile" className="pos-shift-selector"><SelectValue placeholder="Selecciona perfil" /></SelectTrigger><SelectContent align="start">{profiles.data.map((profile) => <SelectItem value={profile.name} key={profile.name}>{profile.name} · {profile.company}</SelectItem>)}</SelectContent></Select></Field><span className="muted">Las cotizaciones se filtran por empresa; ERPNext no las liga directamente a un POS Profile.</span></div> : null}<div className="quotation-toolbar card"><form className="quotation-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()) }}><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar cotización, cliente o Lead..." aria-label="Buscar cotizaciones" /><SearchButton label="Buscar cotizaciones" /></form><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Estado de cotización" className="quotation-status-select"><SelectValue /></SelectTrigger><SelectContent align="end"><SelectItem value="Todas">Todas</SelectItem><SelectItem value="Open">Abiertas</SelectItem><SelectItem value="Draft">Borradores</SelectItem></SelectContent></Select></div>{message && <Notice tone="info">{message}</Notice>}{profiles.isError && <Notice>{profiles.error.message}</Notice>}{quotations.isError && <Notice>{quotations.error.message}</Notice>}{quotations.isPending ? <div className="flex justify-center p-12"><Spinner /></div> : <div className="card quotation-list overflow-hidden">{filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead><tr><th>Cotización</th><th>Cliente / Lead</th><th>Fecha</th><th>Vigencia</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead><tbody>{filtered.map((quotation) => { const validity = quotationValidityState(quotation.valid_till); return <tr key={quotation.name}><td><strong>{quotation.name}</strong></td><td>{quotation.customer_name || quotation.party_name || '—'}</td><td>{formatDate(quotation.transaction_date)}</td><td className={validity === 'vencida' ? 'quotation-expired' : ''}>{formatDate(quotation.valid_till)}{validity === 'vencida' && <small>Vencida</small>}</td><td><span className={`quotation-status quotation-status-${String(quotation.status ?? '').toLowerCase()}`}>{quotation.status || '—'}</span></td><td>{formatMoney(quotation.grand_total, quotation.currency || selectedProfile?.currency || 'MXN')}</td><td><div className="quotation-actions"><Button type="button" size="compact" variant="secondary" onClick={() => openQuotation(quotation.name)}>Ver detalle</Button>{quotation.status === 'Open' && <Button type="button" size="compact" onClick={() => openQuotation(quotation.name)}>Crear pedido</Button>}</div></td></tr> })}</tbody></table></div> : <div className="p-10 text-center muted">No hay cotizaciones abiertas o borradores para esta empresa.</div>}</div>}<QuotationDetailsSheet quotation={selected} busy={convert.isPending} currency={selectedProfile?.currency || 'MXN'} onClose={() => setSelected(null)} onCreateOrder={() => { if (selected) convert.mutate(selected) }} /></section>
}
