import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input, Notice, PageHeader, SearchButton, Spinner } from '../components/ui'
import { PosProductCard } from '../components/pos-product-card'
import { PosVariantSheet } from '../components/pos-variant-sheet'
import { PosClosingPanel as BasePosClosingPanel, PosCustomerPicker, PosMobileTabs } from '../components/pos-shadcn'
import { PosDraftsSheet } from '../components/pos-drafts-sheet'
import { PosMissingPriceDialog } from '../components/pos-missing-price-dialog'
import { PosPriceSheet } from '../components/pos-price-sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { filterItems, readItemCatalog } from '../lib/item-cache'
import { readItemPriceCatalog } from '../lib/price-cache'
import { readVariantCatalog } from '../lib/variant-cache'
import { cartTotals, closingPayload, closingSummary, draftInvoicePayload, draftToCartLines, formatMoney, lineTotal, normalizeClosingResponse, openingPayload, paymentLines, returnInvoicePayload, salesInvoicePayload, validateClosingInput } from '../lib/pos'
import type { CachedItem, ItemPrice, ItemUom, PosCartLine, PosDraftDocument, PosDraftSummary, PosPaymentLine, PosPaymentMethod, PosProfile, PosSaleSummary, PosTaxRow, PosTaxTemplate } from '../lib/types'
import type { createErpNextClient } from '../lib/erpnext'
import { queryKeys } from '../lib/query-keys'

type Client = ReturnType<typeof createErpNextClient>
type ActiveShift = { name: string; profileName: string; user: string }
type PendingPriceResume = { lines: PosCartLine[]; payments: PosPaymentLine[]; customer: string; activeDraftName: string | null; item: CachedItem; uom: ItemUom }
type PreparedClosing = { opening: { name: string; status?: string; company?: string; pos_profile?: string; user?: string; period_start_date?: string }; periodEndAt: string; user: string; openingBalances: PosPaymentLine[]; invoices: Array<{ name: string; doctype: 'Sales Invoice' | 'POS Invoice'; posting_date?: string; grand_total?: number; customer?: string; is_return?: number | boolean; return_against?: string; net_total?: number; total_qty?: number; total_taxes_and_charges?: number }>; payments: Array<{ mode_of_payment: string; amount: number; account?: string }>; taxes: Array<{ account_head: string; amount: number }> }
type PosClosingPanelProps = ComponentProps<typeof BasePosClosingPanel>
function currentDateTime() { const date = new Date(); return { date: date.toISOString().slice(0, 10), time: date.toTimeString().slice(0, 8), at: date.toISOString() } }

function storageKey(profileId: string) { return `mauricio-erpnext:pos-shift:${profileId}` }
function pendingPriceKey(profileId: string) { return `mauricio-erpnext:pos-price-return:${profileId}` }
function money(value: number, currency = 'MXN') { return formatMoney(value, currency) }
function defaultUom(item: CachedItem): ItemUom { return item.uoms?.find((uom) => uom.uom === item.sales_uom) ?? item.uoms?.find((uom) => uom.uom === item.stock_uom) ?? { uom: item.stock_uom || item.sales_uom || '', conversion_factor: 1 } }
function formatFactor(value: number) { return Number.isInteger(value) ? String(value) : value.toLocaleString('es-MX', { maximumFractionDigits: 6 }) }
function priceForUom(item: CachedItem, uom: string, prices: ItemPrice[], priceList?: string) {
  const matches = prices.filter((price) => [item.name, item.item_code].includes(price.item_code) && price.selling && (!priceList || price.price_list === priceList))
  const exact = matches.find((price) => (price.uom || item.stock_uom) === uom)
  if (exact) return Number(exact.price_list_rate ?? 0)
  if (uom === item.stock_uom) return Number(matches.find((price) => !price.uom)?.price_list_rate ?? matches[0]?.price_list_rate ?? 0)
  return 0
}
function defaultPrice(item: CachedItem, prices: ItemPrice[], priceList?: string) {
  return priceForUom(item, defaultUom(item).uom, prices, priceList)
}
function variantPriceRange(variants: CachedItem[], prices: ItemPrice[], priceList: string | undefined, currency: string) {
  const codes = new Set(variants.flatMap((variant) => [variant.name, variant.item_code].filter(Boolean)))
  const rates = prices.filter((price) => price.selling && codes.has(price.item_code || '') && (!priceList || price.price_list === priceList)).map((price) => Number(price.price_list_rate ?? 0)).filter((rate) => Number.isFinite(rate) && rate > 0)
  if (!rates.length) return undefined
  const minimum = Math.min(...rates)
  const maximum = Math.max(...rates)
  return minimum === maximum ? money(minimum, currency) : `${money(minimum, currency)} – ${money(maximum, currency)}`
}

function ProductPicker({ items, prices, priceList, currency, lines, variantsByTemplate, onAdd, onDecrease, onOpenTemplate }: { items: CachedItem[]; prices: ItemPrice[]; priceList?: string; currency: string; lines: PosCartLine[]; variantsByTemplate: Map<string, CachedItem[]>; onAdd: (item: CachedItem) => void; onDecrease: (item: CachedItem) => void; onOpenTemplate: (item: CachedItem) => void }) {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const roots = items.filter((item) => !item.disabled && !item.variant_of)
    const matchingRoots = filterItems(roots, search)
    if (!search) return matchingRoots.slice(0, 80)
    const matchingVariantParents = new Set(filterItems(Array.from(variantsByTemplate.values()).flat(), search).map((item) => item.variant_of).filter(Boolean))
    const included = new Set(matchingRoots.map((item) => item.name))
    return [...matchingRoots, ...roots.filter((item) => matchingVariantParents.has(item.name) && !included.has(item.name))].slice(0, 80)
  }, [items, search, variantsByTemplate])
  return <section className="pos-products card"><div className="pos-section-heading"><div><h2>Productos</h2><span>{filtered.length} disponibles · {items.length} en caché</span></div><span className="pos-hint">Selecciona una tarjeta</span></div><form className="pos-search" onSubmit={(event) => { event.preventDefault(); setSearch(input.trim()) }}><Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Buscar nombre, SKU o barcode" aria-label="Buscar productos POS" autoFocus /><SearchButton label="Buscar productos POS" /></form><div className="pos-product-grid">{filtered.map((item) => { const variants = variantsByTemplate.get(item.name) ?? []; const isTemplate = Boolean(item.has_variants) || variants.length > 0; const itemUom = defaultUom(item); const quantity = lines.find((line) => line.itemCode === item.name && line.uom === itemUom.uom)?.qty ?? 0; const inCart = isTemplate ? variants.some((variant) => lines.some((line) => line.itemCode === variant.name && line.qty > 0)) : quantity > 0; const priceHref = isTemplate ? `/prices?search=${encodeURIComponent(item.name)}` : `/prices/manage/${encodeURIComponent(item.name)}?returnTo=/pos`; return <PosProductCard key={item.name} item={item} price={isTemplate ? null : defaultPrice(item, prices, priceList)} priceLabel={isTemplate ? variantPriceRange(variants, prices, priceList, currency) : undefined} priceHref={priceHref} currency={currency} quantity={quantity} inCart={inCart} isTemplate={isTemplate} variantCount={variants.length} uomCount={item.uoms?.length ?? 0} onAdd={() => onAdd(item)} onDecrease={() => onDecrease(item)} onOpenTemplate={() => onOpenTemplate(item)} /> })}{!filtered.length && <p className="muted p-4">No hay coincidencias. Carga o refresca el catálogo en Productos.</p>}</div></section>
}

function Cart({ lines, taxRows, currency, canEditRate, onChange, onRemove, onEditPrice }: { lines: PosCartLine[]; taxRows: PosTaxRow[]; currency: string; canEditRate: boolean; onChange: (index: number, patch: Partial<PosCartLine>) => void; onRemove: (index: number) => void; onEditPrice: (index: number) => void }) {
  const totals = cartTotals(lines, taxRows)
  return <section className="pos-cart card"><div className="pos-section-heading"><div><h2>Venta actual</h2><span>{lines.length} líneas · {money(totals.total, currency)}</span></div><span className="pos-hint">Turno activo</span></div>{!lines.length ? <div className="pos-empty">Agrega productos para iniciar la venta.</div> : <div className="pos-cart-lines">{lines.map((line, index) => { const uom = line.uom || line.stockUom || 'UOM'; const stockUom = line.stockUom || uom; const factor = line.conversionFactor || 1; return <div className="pos-cart-line" key={line.itemCode + '-' + line.uom}><div className="pos-cart-line-info"><strong>{line.itemName}</strong><div className="pos-cart-uom"><span className="pos-cart-uom-badge">UOM: {uom}</span>{factor !== 1 && <span className="pos-cart-uom-conversion">1 {uom} = {formatFactor(factor)} {stockUom}</span>}</div><small>{line.itemCode} · {money(line.rate, currency)} c/u{line.rateOverride ? ' · Lista ' + money(line.priceListRate ?? line.rate, currency) : ''}</small>{line.rateOverride && <span className="pos-custom-rate-badge">Precio personalizado</span>}{canEditRate && <button type="button" className="pos-edit-price" onClick={() => onEditPrice(index)} aria-label={'Editar precio de ' + line.itemName}>Editar precio</button>}</div><Input aria-label={'Cantidad de ' + line.itemName + ' en ' + uom} type="number" min="0.001" step="any" value={line.qty} onChange={(event) => onChange(index, { qty: Number(event.target.value) })} /><strong>{money(lineTotal(line), currency)}</strong><button type="button" className="pos-remove" onClick={() => onRemove(index)} aria-label={'Quitar ' + line.itemName} title={'Quitar ' + line.itemName}>×</button></div> })}</div>}<div className="pos-totals"><span>Subtotal <b>{money(totals.subtotal, currency)}</b></span><span>Descuento <b>-{money(totals.discount, currency)}</b></span>{taxRows.length > 0 ? <div className="pos-tax-breakdown" aria-label="Desglose de impuestos"><span className="pos-tax-title">Impuestos</span>{totals.taxes.map((tax, index) => <span key={(tax.account_head || tax.description || 'tax') + '-' + index}><span>{tax.description || tax.account_head || 'Impuesto ' + (index + 1)}{tax.rate ? ' (' + tax.rate + '%)' : ''}</span><b>{money(tax.amount, currency)}</b></span>)}<span className="pos-tax-total"><span>Total impuestos</span><b>{money(totals.totalTaxes, currency)}</b></span></div> : <span className="pos-tax-empty">Sin impuestos configurados en el POS Profile</span>}<span className="pos-total">Total provisional <b>{money(totals.total, currency)}</b></span></div></section>
}
function Payments({ methods, payments, total, currency, onChange }: { methods: PosPaymentMethod[]; payments: PosPaymentLine[]; total: number; currency: string; onChange: (payments: PosPaymentLine[]) => void }) {
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const change = Math.max(0, paid - total)
  return <section className="pos-payment card"><div className="pos-section-heading"><div><h2>Pago</h2><span>Pago mixto permitido</span></div><strong className="pos-payment-total">{money(total, currency)}</strong></div><div className="pos-payment-lines">{methods.map((method) => { const current = payments.find((payment) => payment.modeOfPayment === method.mode_of_payment)?.amount ?? 0; return <Field key={method.mode_of_payment} label={method.mode_of_payment}><Input type="number" min="0" step="0.01" value={current} onChange={(event) => onChange(methods.map((candidate) => candidate.mode_of_payment === method.mode_of_payment ? { modeOfPayment: method.mode_of_payment, amount: Number(event.target.value) } : { modeOfPayment: candidate.mode_of_payment, amount: payments.find((payment) => payment.modeOfPayment === candidate.mode_of_payment)?.amount ?? 0 }))} /></Field> })}</div><div className="pos-payment-summary"><span>Recibido <b>{money(paid, currency)}</b></span><span>Cambio <b>{money(change, currency)}</b></span></div></section>
}

function SaleHistory({ sales, loading, error, currency, onRefresh, onReturn }: { sales: PosSaleSummary[]; loading: boolean; error?: string; currency: string; onRefresh: () => void; onReturn: (name: string) => void }) {
  return <section className="pos-history card"><div className="pos-section-heading"><div><h2>Ventas del turno</h2><span>{sales.length} facturas confirmadas</span></div><Button variant="secondary" size="compact" onClick={onRefresh}>Actualizar</Button></div>{error && <Notice>{error}</Notice>}{loading ? <Spinner /> : <div className="pos-history-list">{sales.map((invoice) => <div key={invoice.name}><strong>{invoice.name}</strong><span>{invoice.customer || 'Cliente genérico'}</span><b>{money(Number(invoice.grand_total ?? 0), currency)}</b><Button variant="secondary" size="compact" onClick={() => onReturn(invoice.name)}>Devolver</Button></div>)}{!sales.length && <p className="muted">Sin ventas confirmadas en este turno.</p>}</div>}</section>
}

export function PosPage({ client, profileId }: { client: Client; profileId: string }) {
  const navigate = useNavigate()
  const [profileName, setProfileName] = useState('')
  const [shift, setShift] = useState<ActiveShift | null>(() => { try { return JSON.parse(localStorage.getItem(storageKey(profileId)) || 'null') as ActiveShift | null } catch { return null } })
  const [lines, setLines] = useState<PosCartLine[]>([])
  const [payments, setPayments] = useState<PosPaymentLine[]>([])
  const [customer, setCustomer] = useState('')
  const [searchCustomer, setSearchCustomer] = useState('')
  const [openingBalances, setOpeningBalances] = useState<PosPaymentLine[]>([])
  const [closingBalances, setClosingBalances] = useState<PosPaymentLine[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showClosing, setShowClosing] = useState(false)
  const [closingLoading, setClosingLoading] = useState(false)
  const [closingError, setClosingError] = useState('')
  const [preparedClosing, setPreparedClosing] = useState<PreparedClosing | null>(null)
  const [closingDocument, setClosingDocument] = useState<{ name: string; status?: string } | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const [activeDraftName, setActiveDraftName] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products')
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showMobileTabs, setShowMobileTabs] = useState(false)
  const [cartFeedback, setCartFeedback] = useState<{ text: string; id: number } | null>(null)
  const [variantTemplate, setVariantTemplate] = useState<CachedItem | null>(null)
  const [variantOptions, setVariantOptions] = useState<CachedItem[]>([])
  const [variantLoading, setVariantLoading] = useState(false)
  const [variantError, setVariantError] = useState('')
  const [missingPrice, setMissingPrice] = useState<{ item: CachedItem; uom: ItemUom } | null>(null)
  const [pendingPriceResume, setPendingPriceResume] = useState<PendingPriceResume | null>(null)
  const [priceLineIndex, setPriceLineIndex] = useState<number | null>(null)
  const [showPriceSheet, setShowPriceSheet] = useState(false)

  const profiles = useQuery({ queryKey: queryKeys.pos.profiles(profileId), queryFn: async () => (await client.listDocuments<PosProfile>('POS Profile', { fields: ['name', 'company', 'warehouse', 'currency', 'selling_price_list', 'customer', 'tax_category', 'taxes_and_charges', 'disabled'], pageLength: 100, orderBy: 'name asc' })).data.filter((profile) => profile.disabled !== true && profile.disabled !== 1 && String(profile.disabled) !== '1') })
  const selectedProfile = profiles.data?.find((item) => item.name === profileName) ?? profiles.data?.[0]
  const canEditRate = selectedProfile?.allow_user_to_edit_rate === true || selectedProfile?.allow_user_to_edit_rate === 1
  const salesTaxTemplate = useQuery({ queryKey: ['pos-sales-tax-template', profileId, selectedProfile?.name, selectedProfile?.taxes_and_charges], enabled: Boolean(selectedProfile?.taxes_and_charges), queryFn: () => client.getDocument<PosTaxTemplate>('Sales Taxes and Charges Template', selectedProfile!.taxes_and_charges!) })
  const taxRows = useMemo<PosTaxRow[]>(() => salesTaxTemplate.data?.taxes ?? [], [salesTaxTemplate.data?.taxes])
  const openEntries = useQuery({ queryKey: ['pos-open-entry', profileId, selectedProfile?.name, shift?.name], enabled: Boolean(selectedProfile && !shift), queryFn: async () => (await client.listDocuments<{ name: string; user: string; pos_profile: string; company: string; period_start_date: string; status: string }>('POS Opening Entry', { fields: ['name', 'user', 'pos_profile', 'company', 'period_start_date', 'status'], filters: [['pos_profile', '=', selectedProfile!.name], ['status', '=', 'Open']], pageLength: 10, orderBy: 'creation desc' })).data })
  const posSettings = useQuery({ queryKey: ['pos-settings', profileId], queryFn: async () => client.getDocument<{ invoice_type?: 'Sales Invoice' | 'POS Invoice' }>('POS Settings', 'POS Settings') })
  const methods = useQuery({ queryKey: ['pos-payment-methods', profileId, selectedProfile?.name], enabled: Boolean(selectedProfile), queryFn: async () => { const profileName = selectedProfile!.name; const profile = await client.getDocument<PosProfile>('POS Profile', profileName); let configured: PosPaymentMethod[] = profile.payments ?? []; if (!configured.length) { try { configured = (await client.listDocuments<PosPaymentMethod>('POS Payment Method', { fields: ['name', 'parent', 'parenttype', 'parentfield', 'mode_of_payment', 'default', 'allow_in_returns'], filters: [['parent', '=', profileName], ['parenttype', '=', 'POS Profile'], ['parentfield', '=', 'payments']], pageLength: 100, orderBy: 'idx asc' })).data } catch { configured = [] } } return configured.map((item) => ({ mode_of_payment: item.mode_of_payment || (item as PosPaymentMethod & { name?: string }).name || '', default: item.default, allow_in_returns: item.allow_in_returns })).filter((payment) => payment.mode_of_payment) } })
  const customers = useQuery({ queryKey: ['pos-customers', profileId], queryFn: async () => (await client.listDocuments<{ name: string; customer_name?: string }>('Customer', { fields: ['name', 'customer_name'], filters: [['disabled', '=', 0]], pageLength: 500, orderBy: 'customer_name asc' })).data })
  const catalog = useQuery({ queryKey: queryKeys.catalog.item(profileId), queryFn: () => readItemCatalog(profileId), staleTime: Infinity })
  const prices = useQuery({ queryKey: queryKeys.catalog.price(profileId), queryFn: () => readItemPriceCatalog(profileId), staleTime: Infinity })
  const variantCatalog = useQuery({ queryKey: queryKeys.catalog.variant(profileId), queryFn: () => readVariantCatalog(profileId), staleTime: Infinity })
  const currency = selectedProfile?.currency || 'MXN'
  const paymentMethods = useMemo(() => methods.data ?? [], [methods.data])
  const closingPaymentMethods = useMemo(() => {
    const known = new Set(paymentMethods.map((method) => method.mode_of_payment))
    const extra = preparedClosing?.payments.filter((payment) => !known.has(payment.mode_of_payment)).map((payment) => ({ mode_of_payment: payment.mode_of_payment })) ?? []
    return [...paymentMethods, ...extra]
  }, [paymentMethods, preparedClosing?.payments])
  const totals = cartTotals(lines, taxRows)
  const preparedSummary = preparedClosing ? closingSummary({ openingBalances: preparedClosing.openingBalances, balances: closingBalances, payments: preparedClosing.payments, invoices: preparedClosing.invoices, taxes: preparedClosing.taxes }) : undefined
  const cartCount = lines.reduce((sum, line) => sum + line.qty, 0)
  const posItems = useMemo(() => {
    const merged = new Map<string, CachedItem>()
    for (const item of catalog.data?.items ?? []) merged.set(item.name, item)
    for (const item of variantCatalog.data?.items ?? []) merged.set(item.name, { ...merged.get(item.name), ...item })
    for (const item of merged.values()) {
      if (item.disabled || !item.variant_of || merged.has(item.variant_of)) continue
      merged.set(item.variant_of, { name: item.variant_of, item_name: item.variant_of, has_variants: true, stock_uom: item.stock_uom, sales_uom: item.sales_uom })
    }
    return Array.from(merged.values())
  }, [catalog.data?.items, variantCatalog.data?.items])
  const variantsByTemplate = useMemo(() => {
    const map = new Map<string, CachedItem[]>()
    const baseItems = catalog.data?.items ?? []
    const detailedItems = variantCatalog.data?.items ?? []
    for (const item of [...baseItems, ...detailedItems]) {
      if (!item.variant_of || item.disabled) continue
      const current = map.get(item.variant_of) ?? []
      const previous = current.find((candidate) => candidate.name === item.name)
      if (previous) Object.assign(previous, item)
      else current.push({ ...item })
      map.set(item.variant_of, current)
    }
    return map
  }, [catalog.data?.items, variantCatalog.data?.items])
  const invoiceMode: 'Sales Invoice' | 'POS Invoice' = posSettings.data?.invoice_type === 'POS Invoice' ? 'POS Invoice' : 'Sales Invoice'
  const history = useQuery({ queryKey: ['pos-history', profileId, shift?.name, invoiceMode], enabled: Boolean(shift && showHistory && !posSettings.isPending), queryFn: async () => (await client.listDocuments<PosSaleSummary>(invoiceMode, { fields: ['name', 'customer', 'posting_date', 'grand_total', 'status'], filters: [['pos_opening_entry', '=', shift?.name], ['docstatus', '=', 1]], pageLength: 100, orderBy: 'creation desc' })).data.map((invoice) => ({ ...invoice, doctype: invoiceMode })) })
  const drafts = useQuery({ queryKey: ['pos-drafts', profileId, selectedProfile?.name, invoiceMode], enabled: Boolean(shift && selectedProfile && showDrafts && !posSettings.isPending), queryFn: async () => (await client.listDocuments<PosDraftSummary>(invoiceMode, { fields: ['name', 'customer', 'grand_total', 'modified', 'posting_date', 'docstatus'], filters: [['docstatus', '=', 0], ['is_pos', '=', 1], ['pos_profile', '=', selectedProfile!.name]], pageLength: 100, orderBy: 'modified desc' })).data })

  useEffect(() => { if (!profileName && profiles.data?.[0]) setProfileName(profiles.data[0].name) }, [profileName, profiles.data])
  useEffect(() => { setOpeningBalances(paymentLines(paymentMethods)); setClosingBalances(paymentLines(paymentMethods)) }, [paymentMethods])
  useEffect(() => { if (!cartFeedback) return; const timer = window.setTimeout(() => setCartFeedback(null), 1800); return () => window.clearTimeout(timer) }, [cartFeedback])
  useEffect(() => { const onScroll = () => { setShowScrollTop(window.scrollY > 420); setShowMobileTabs(window.scrollY > 240) }; onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll) }, [])
  useEffect(() => {
    const existing = openEntries.data?.[0]
    if (!existing || shift || !selectedProfile) return
    client.getCurrentUser().then((currentUser) => {
      if (existing.user && existing.user !== currentUser) {
        setMessage(`Hay un turno abierto (${existing.name}) para ${existing.user}. Inicia sesión con ese usuario o ciérralo desde ERPNext.`)
        return
      }
      const next = { name: existing.name, profileName: existing.pos_profile || selectedProfile.name, user: currentUser }
      setShift(next); localStorage.setItem(storageKey(profileId), JSON.stringify(next)); setMessage(`Turno abierto detectado: ${existing.name}`)
    }).catch(() => setMessage('No se pudo verificar el usuario actual en ERPNext.'))
  }, [client, openEntries.data, profileId, selectedProfile, shift])
  useEffect(() => {
    if (!shift) return
    Promise.all([client.getDocument<{ name: string; status?: string; user?: string }>('POS Opening Entry', shift.name), client.getCurrentUser()]).then(([entry, currentUser]) => {
      if (entry.status && entry.status !== 'Open') {
        localStorage.removeItem(storageKey(profileId)); setShift(null); setMessage('El turno ya no está abierto en ERPNext.')
      } else if (entry.user && entry.user !== currentUser) {
        localStorage.removeItem(storageKey(profileId)); setShift(null); setMessage(`El turno ${entry.name} pertenece a ${entry.user}, no al usuario actual (${currentUser}).`)
      }
    }).catch(() => { localStorage.removeItem(storageKey(profileId)); setShift(null); setMessage('No se pudo verificar el turno en ERPNext.') })
  }, [client, profileId, shift])

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(pendingPriceKey(profileId))
      if (!saved) return
      setPendingPriceResume(JSON.parse(saved) as PendingPriceResume)
      sessionStorage.removeItem(pendingPriceKey(profileId))
    } catch {
      sessionStorage.removeItem(pendingPriceKey(profileId))
    }
  }, [profileId])

  useEffect(() => {
    if (!pendingPriceResume || !prices.data) return
    const rate = priceForUom(pendingPriceResume.item, pendingPriceResume.uom.uom, prices.data.prices, selectedProfile?.selling_price_list)
    if (rate > 0) {
      addConfiguredItem(pendingPriceResume.item, pendingPriceResume.uom, rate)
      setMessage(`${pendingPriceResume.item.item_name || pendingPriceResume.item.name} agregado con el nuevo precio.`)
    } else {
      setMessage('El precio guardado todavía no coincide con la lista o UOM del POS.')
    }
    setPendingPriceResume(null)
  // The callback is declared below to keep the POS handlers grouped together.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPriceResume, prices.data, selectedProfile?.selling_price_list])

  function addItem(item: CachedItem) {
    const uom = defaultUom(item)
    addConfiguredItem(item, uom, defaultPrice(item, prices.data?.prices ?? [], selectedProfile?.selling_price_list))
  }

  function addConfiguredItem(item: CachedItem, uom: ItemUom, rate: number) {
    if (!Number.isFinite(rate) || rate <= 0) return setMissingPrice({ item, uom })
    setLines((current) => { const existing = current.find((line) => line.itemCode === item.name && line.uom === uom.uom); return existing ? current.map((line) => line.itemCode === item.name && line.uom === uom.uom ? { ...line, qty: line.qty + 1 } : line) : [...current, { itemCode: item.name, itemName: item.item_name || item.name, qty: 1, rate, priceListRate: rate, rateOverride: false, uom: uom.uom, stockUom: item.stock_uom || uom.uom, conversionFactor: uom.conversion_factor || 1, weightPerUnit: item.weight_per_unit, weightUom: item.weight_uom, warehouse: selectedProfile?.warehouse }] })
    setCartFeedback({ text: `${item.item_name || item.name} agregado`, id: Date.now() })
  }

  function addMissingPrice() {
    if (!missingPrice) return
    const resume: PendingPriceResume = { lines, payments, customer, activeDraftName, item: missingPrice.item, uom: missingPrice.uom }
    sessionStorage.setItem(pendingPriceKey(profileId), JSON.stringify(resume))
    const params = new URLSearchParams({ returnTo: '/pos', priceList: selectedProfile?.selling_price_list || 'Standard Selling', uom: missingPrice.uom.uom })
    setMissingPrice(null)
    navigate(`/prices/manage/${encodeURIComponent(missingPrice.item.name)}?${params.toString()}`)
  }

  function decreaseItem(item: CachedItem) {
    const uom = defaultUom(item).uom
    setLines((current) => current.flatMap((line) => line.itemCode === item.name && line.uom === uom ? (line.qty <= 1 ? [] : [{ ...line, qty: line.qty - 1 }]) : [line]))
  }

  async function openTemplate(template: CachedItem) {
    setVariantTemplate(template); setVariantError('')
    const cached = variantsByTemplate.get(template.name) ?? []
    if (!cached.length && (template.uoms?.length ?? 0) > 1) return setVariantOptions([template])
    if (cached.length) return setVariantOptions(cached)
    setVariantLoading(true)
    try {
      const templateDetail = await client.getDocument<CachedItem>('Item', template.name).catch(() => template)
      const result = await client.listDocuments<CachedItem>('Item', { fields: ['name', 'item_code', 'item_name', 'brand', 'item_group', 'stock_uom', 'sales_uom', 'weight_per_unit', 'weight_uom', 'variant_of', 'has_variants', 'disabled'], filters: [['variant_of', '=', template.name], ['disabled', '=', 0]], pageLength: 100, orderBy: 'item_name asc' })
      const details = await Promise.all(result.data.map(async (item) => { try { return await client.getDocument<CachedItem>('Item', item.name) } catch { return item } }))
      setVariantOptions(details.length ? details : [templateDetail])
    } catch (error) { setVariantError(error instanceof Error ? error.message : 'No se pudieron cargar las variantes.') } finally { setVariantLoading(false) }
  }

  function closeTemplate() { setVariantTemplate(null); setVariantOptions([]); setVariantError('') }

  function setActiveShift(next: ActiveShift | null) { setShift(next); if (!next) setMobileView('products'); if (next) localStorage.setItem(storageKey(profileId), JSON.stringify(next)); else localStorage.removeItem(storageKey(profileId)) }

  async function openShift() {
    if (!selectedProfile) return setMessage('Selecciona un POS Profile.')
    if (methods.isPending || openEntries.isPending) return setMessage('Espera a que carguen los datos del turno.')
    if (methods.isError || !paymentMethods.length) return setMessage('El POS Profile no tiene métodos de pago válidos. Configúralos en ERPNext antes de abrir.')
    if (openEntries.data?.[0]) {
      const existing = openEntries.data[0]
      const currentUser = await client.getCurrentUser()
      if (existing.user && existing.user !== currentUser) return setMessage(`Hay un turno abierto (${existing.name}) para ${existing.user}. Inicia sesión con ese usuario o ciérralo desde ERPNext.`)
      const next = { name: existing.name, profileName: existing.pos_profile || selectedProfile.name, user: currentUser }
      setActiveShift(next)
      return setMessage(`Turno abierto detectado: ${existing.name}`)
    }
    setBusy(true); setMessage('')
    try { const user = await client.getCurrentUser(); const current = currentDateTime(); const balances = openingBalances.length ? openingBalances : paymentLines(paymentMethods); const created = await client.createDocument<{ name: string }>('POS Opening Entry', openingPayload({ profile: selectedProfile, user, openingAt: current.at, balances })); await client.submitDocument('POS Opening Entry', created.name); setActiveShift({ name: created.name, profileName: selectedProfile.name, user }); setPayments(paymentLines(paymentMethods, 0)); setMessage(`Turno abierto: ${created.name}`) } catch (error) { await openEntries.refetch(); setMessage(error instanceof Error ? error.message : 'No se pudo abrir el turno.') } finally { setBusy(false) }
  }

  async function prepareClose() {
    if (!selectedProfile || !shift || busy || closingLoading) return
    setShowClosing(true); setClosingLoading(true); setClosingError(''); setMessage('')
    try {
      if (lines.length) throw new Error('No puedes cerrar el turno con una venta pendiente en el carrito.')
      const user = await client.getCurrentUser()
      const current = currentDateTime()
      const opening = await client.getDocument<PreparedClosing['opening'] & { balance_details?: Array<{ mode_of_payment?: string; opening_amount?: number }> }>('POS Opening Entry', shift.name)
      const persistedOpeningBalances = (opening.balance_details ?? []).filter((line) => line.mode_of_payment).map((line) => ({ modeOfPayment: line.mode_of_payment!, amount: Number(line.opening_amount ?? 0) }))
      const invoiceData = await client.callMethod<{ invoices?: PreparedClosing['invoices']; payments?: PreparedClosing['payments']; taxes?: PreparedClosing['taxes'] }>('erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry.get_invoices', { start: opening.period_start_date, end: current.at, pos_profile: selectedProfile.name, user })
      const normalized = normalizeClosingResponse(invoiceData)
      validateClosingInput({ profile: selectedProfile, user, opening, periodEndAt: current.at, balances: closingBalances, invoices: normalized.invoices, payments: normalized.payments, cartLines: lines })
      setPreparedClosing({ opening, periodEndAt: current.at, user, openingBalances: persistedOpeningBalances, invoices: normalized.invoices, payments: normalized.payments, taxes: normalized.taxes })
      setClosingError('')
    } catch (error) {
      const next = error instanceof Error ? error.message : 'No se pudo preparar el cierre.'
      setClosingError(next); setMessage(next)
      if (next.includes('ya no está abierto')) { setActiveShift(null); setShowClosing(false) }
    } finally { setClosingLoading(false) }
  }

  async function closeShift() {
    if (!selectedProfile || !shift || !preparedClosing || busy) return
    setBusy(true); setClosingError(''); setMessage('')
    let createdName = closingDocument?.name
    try {
      if (closingDocument?.status === 'Submitted') {
        setActiveShift(null); setLines([]); setPayments([]); setPreparedClosing(null); setShowClosing(false); setMessage(`Turno cerrado: ${closingDocument.name}`)
        return
      }
      validateClosingInput({ profile: selectedProfile, user: preparedClosing.user, opening: preparedClosing.opening, periodEndAt: preparedClosing.periodEndAt, balances: closingBalances, invoices: preparedClosing.invoices, payments: preparedClosing.payments, cartLines: lines })
      const current = currentDateTime()
      const payload = closingPayload({ profile: selectedProfile, user: preparedClosing.user, openingEntry: shift.name, periodStartAt: preparedClosing.opening.period_start_date!, periodEndAt: preparedClosing.periodEndAt, closingDate: current.date, closingTime: current.time, openingBalances: preparedClosing.openingBalances, balances: closingBalances, invoices: preparedClosing.invoices, payments: preparedClosing.payments, taxes: preparedClosing.taxes })
      if (!createdName) createdName = (await client.createDocument<{ name: string }>('POS Closing Entry', payload)).name
      setClosingDocument({ name: createdName, status: 'Draft' })
      await client.submitDocument('POS Closing Entry', createdName)
      const closed = await client.getDocument<{ status?: string; docstatus?: number }>('POS Closing Entry', createdName)
      if (closed.status !== 'Submitted' && closed.docstatus !== 1) throw new Error(`El cierre quedó en estado ${closed.status || 'desconocido'}. Revisa POS Closing Entry ${createdName}.`)
      setClosingDocument({ name: createdName, status: 'Submitted' }); setActiveShift(null); setLines([]); setPayments([]); setPreparedClosing(null); setShowClosing(false); setMessage(`Turno cerrado: ${createdName}`)
    } catch (error) {
      const next = error instanceof Error ? error.message : 'No se pudo cerrar el turno.'
      setClosingError(createdName ? `${next} POS Closing Entry: ${createdName}.` : next); setMessage(next)
      if (createdName) {
        try { const status = await client.getDocument<{ status?: string; docstatus?: number }>('POS Closing Entry', createdName); setClosingDocument({ name: createdName, status: status.status || (status.docstatus === 1 ? 'Submitted' : 'Desconocido') }) } catch { setClosingDocument({ name: createdName, status: 'Desconocido' }) }
      }
    } finally { setBusy(false) }
  }

  function beginPayment() {
    if (!lines.length) return
    if (!customer) return setMessage('Selecciona un cliente antes de cobrar.')
    setShowPayment(true)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  async function submitSale() {
    if (!selectedProfile || !shift) return setMessage('Abre un turno antes de cobrar.')
    if (!customer) return setMessage('Selecciona un cliente antes de cobrar.')
    setBusy(true); setMessage('')
    try { const current = currentDateTime(); const payload = salesInvoicePayload({ profile: selectedProfile, customer, postingDate: current.date, postingTime: current.time, lines, payments, taxes: taxRows, posOpeningEntry: shift.name, invoiceMode }); const name = activeDraftName ?? (await client.createDocument<{ name: string }>(invoiceMode, payload)).name; if (activeDraftName) await client.updateDocument(invoiceMode, activeDraftName, payload); await client.submitDocument(invoiceMode, name); const confirmed = await client.getDocument<{ docstatus?: number }>(invoiceMode, name); if (confirmed.docstatus !== undefined && confirmed.docstatus !== 1) throw new Error(`La venta ${name} no quedó enviada.`); setLines([]); setPayments(paymentLines(paymentMethods)); setShowPayment(false); setActiveDraftName(null); setMessage(`Venta confirmada: ${name}`); setShowHistory(true); await drafts.refetch() } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo confirmar la venta.') } finally { setBusy(false) }
  }

  async function saveDraft() {
    if (!selectedProfile || !shift) return setMessage('Abre un turno antes de guardar el carrito.')
    if (!customer) return setMessage('Selecciona un cliente antes de guardar el carrito.')
    if (!lines.length) return setMessage('Agrega al menos un producto antes de guardar el carrito.')
    setBusy(true); setMessage('')
    try { const current = currentDateTime(); const payload = draftInvoicePayload({ profile: selectedProfile, customer, postingDate: current.date, postingTime: current.time, lines, taxes: taxRows, posOpeningEntry: shift.name, invoiceMode }); const saved = activeDraftName ? { name: activeDraftName } : await client.createDocument<{ name: string }>(invoiceMode, payload); if (activeDraftName) await client.updateDocument(invoiceMode, activeDraftName, payload); setLines([]); setPayments(paymentLines(paymentMethods)); setShowPayment(false); setActiveDraftName(null); setMessage(`Carrito guardado como ${saved.name}.`); setShowDrafts(false); await drafts.refetch() } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el carrito.') } finally { setBusy(false) }
  }

  async function resumeDraft(summary: PosDraftSummary) {
    if (lines.length) return setMessage('Cancela o guarda la venta actual antes de abrir otra.')
    setBusy(true); setMessage('')
    try { const draft = await client.getDocument<PosDraftDocument>(invoiceMode, summary.name); if (!draft.items?.length) throw new Error('El borrador no tiene productos.'); setLines(draftToCartLines(draft.items)); setCustomer(draft.customer || ''); setSearchCustomer(''); setPayments(paymentLines(paymentMethods)); setActiveDraftName(draft.name); setShowPayment(false); setShowDrafts(false); setMessage(`Borrador ${draft.name} cargado.`) } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cargar el borrador.') } finally { setBusy(false) }
  }

  async function deleteDraft(draft: PosDraftSummary) {
    setBusy(true); setMessage('')
    try { await client.deleteDocument(invoiceMode, draft.name); setMessage(`Borrador ${draft.name} descartado.`); await drafts.refetch() } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo descartar el borrador.') } finally { setBusy(false) }
  }

  async function returnSale(name: string) {
    if (!window.confirm(`¿Crear devolución para ${name}?`)) return
    setBusy(true); setMessage('')
    try { const invoice = await client.getDocument<{ name: string; customer: string; company: string; pos_profile?: string; items: Array<{ item_code: string; item_name?: string; qty: number; rate: number; uom?: string; warehouse?: string }> }>(invoiceMode, name); const created = await client.createDocument<{ name: string }>(invoiceMode, returnInvoicePayload({ ...invoice, doctype: invoiceMode })); await client.submitDocument(invoiceMode, created.name); setMessage(`Devolución confirmada: ${created.name}`); await history.refetch() } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo crear la devolución.') } finally { setBusy(false) }
  }

  const resolvePosPrice = useCallback(async (item: CachedItem, uom: ItemUom) => {
    if (!selectedProfile?.company || !selectedProfile.warehouse || !selectedProfile.selling_price_list) return null
    try {
      const result = await client.callMethod<{ price_list_rate?: number; rate?: number }>('erpnext.stock.get_item_details.get_item_details', { args: JSON.stringify({ item_code: item.name, warehouse: selectedProfile.warehouse, set_warehouse: selectedProfile.warehouse, customer, company: selectedProfile.company, price_list: selectedProfile.selling_price_list, selling_price_list: selectedProfile.selling_price_list, doctype: invoiceMode, is_pos: 1, pos_profile: selectedProfile.name, qty: 1, uom: uom.uom, stock_uom: item.stock_uom, conversion_factor: uom.conversion_factor, transaction_date: currentDateTime().date }) })
      const rate = Number(result.price_list_rate ?? result.rate)
      return Number.isFinite(rate) ? rate : null
    } catch {
      return null
    }
  }, [client, customer, invoiceMode, selectedProfile])

  function updatePayment(next: PosPaymentLine[]) { setPayments(next.filter((payment) => payment.amount > 0)) }
  const selectedCustomer = customers.data?.find((item) => item.name === customer)
  const priceLine = priceLineIndex === null ? null : lines[priceLineIndex] ?? null
  function applyManualRate(rate: number) {
    if (priceLineIndex === null || !Number.isFinite(rate) || rate <= 0) return
    setLines((current) => current.map((line, index) => index === priceLineIndex ? { ...line, rate, rateOverride: rate !== (line.priceListRate ?? line.rate) } : line))
    setShowPriceSheet(false)
  }

  function PosClosingPanel(props: PosClosingPanelProps) {
    return <BasePosClosingPanel {...props} open={showClosing} paymentMethods={closingPaymentMethods} summary={preparedSummary} busy={busy || closingLoading} error={closingError || (closingLoading ? 'Consultando turno, facturas y pagos en ERPNext…' : undefined)} onSubmit={props.onClose ?? closeShift} onOpenChange={setShowClosing} />
  }

  return <><section className="pos-workspace"><PageHeader title="POS" description="Caja rápida para turnos, ventas, pagos e inventario." status={<><span>{shift ? `Turno: ${shift.name}` : 'Sin turno abierto'}</span>{selectedProfile && <span>{selectedProfile.name} · {selectedProfile.company} · {selectedProfile.warehouse}</span>}{message && <span className="font-medium text-blue-700">{message}</span>}</>} /><div className="pos-toolbar card"><div className="pos-toolbar-main"><Field label="POS Profile"><Select value={selectedProfile?.name ?? undefined} onValueChange={(value) => { setProfileName(value); setCustomer(''); setSearchCustomer('') }} disabled={Boolean(shift)}><SelectTrigger aria-label="POS Profile" className="pos-shift-selector"><SelectValue placeholder="Selecciona perfil" /></SelectTrigger><SelectContent align="start">{(profiles.data ?? []).map((item) => <SelectItem value={item.name} key={item.name}>{item.name}</SelectItem>)}</SelectContent></Select></Field><PosCustomerPicker enabled={Boolean(shift)} value={selectedCustomer?.customer_name || customer} search={searchCustomer} customers={customers.data ?? []} onSearch={(value) => { setCustomer(""); setSearchCustomer(value) }} onSelect={(name) => { setCustomer(name); setSearchCustomer("") }} /></div><div className="pos-toolbar-actions">{!shift ? <Button onClick={openShift} disabled={busy || !selectedProfile || !paymentMethods.length || methods.isPending || openEntries.isPending}>{busy ? <><Spinner /> Abriendo</> : methods.isPending ? <><Spinner /> Cargando pagos</> : 'Abrir turno'}</Button> : <Button variant="danger" onClick={prepareClose} disabled={busy}>{busy ? <><Spinner /> Cerrando</> : 'Preparar cierre'}</Button>}<Button variant="secondary" onClick={() => setShowHistory((current) => !current)} disabled={!shift}>{showHistory ? 'Ocultar historial' : 'Historial del turno'}</Button><Button variant="secondary" onClick={() => setShowDrafts(true)} disabled={!shift}>Ventas retenidas</Button><Button variant="secondary" onClick={() => navigate('/pos/cotizaciones?profile=' + encodeURIComponent(selectedProfile?.name ?? ''))}>Cotizaciones</Button></div></div>{!profiles.isPending && !profiles.data?.length && <Notice>No hay POS Profiles activos. Configura uno en ERPNext antes de usar la caja.</Notice>}{methods.isError && <Notice>{methods.error instanceof Error ? methods.error.message : 'No se pudieron cargar las formas de pago.'}</Notice>}{!methods.isPending && !methods.data?.length && <Notice tone="warning">ERPNext no devolvió métodos válidos para este POS Profile. Configúralos antes de abrir.</Notice>}{(!methods.isPending && !paymentMethods.length) && <Notice tone="warning">El POS Profile no tiene métodos de pago válidos o no se pudieron leer sus filas. Configúralos en ERPNext antes de abrir.</Notice>}{posSettings.isError && <Notice tone="warning">No se pudo leer POS Settings; se usará Sales Invoice solo como modo compatible.</Notice>}{!catalog.data && <Notice tone="warning">Catálogo sin caché. Ve a Productos y refresca antes de vender.</Notice>}{shift && <PosMobileTabs value={mobileView} count={cartCount} fixed={showMobileTabs} onChange={setMobileView} onOpenDrafts={() => setShowDrafts(true)} onOpenQuotations={() => navigate('/pos/cotizaciones?profile=' + encodeURIComponent(selectedProfile?.name ?? ''))} />}{showScrollTop && <button type="button" className="pos-scroll-top is-visible" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Subir al inicio">↑</button>}{cartFeedback && <div className="pos-cart-feedback" role="status" aria-live="polite">{cartFeedback.text}</div>}{shift && <div className="pos-layout"><div className={`pos-mobile-products ${mobileView === 'products' ? 'is-visible' : ''}`}><ProductPicker items={posItems} prices={prices.data?.prices ?? []} priceList={selectedProfile?.selling_price_list} currency={currency} lines={lines} variantsByTemplate={variantsByTemplate} onAdd={addItem} onDecrease={decreaseItem} onOpenTemplate={openTemplate} /></div><div className={`pos-mobile-cart ${mobileView === 'cart' ? 'is-visible' : ''}`}><div className="pos-sale-column"><Cart lines={lines} taxRows={taxRows} currency={currency} canEditRate={canEditRate} onEditPrice={(index) => { setPriceLineIndex(index); setShowPriceSheet(true) }} onChange={(index, patch) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))} onRemove={(index) => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} />{showPayment && <Payments methods={paymentMethods} payments={payments} total={totals.total} currency={currency} onChange={updatePayment} />}<div className="pos-sale-actions">{showPayment ? <Button fullWidth onClick={submitSale} disabled={busy || !lines.length}>{busy ? <><Spinner /> Confirmando</> : `Confirmar cobro ${money(totals.total, currency)}`}</Button> : <Button fullWidth onClick={beginPayment} disabled={busy || !lines.length}>Cobrar {money(totals.total, currency)}</Button>}<Button fullWidth onClick={saveDraft} disabled={busy || !lines.length}>{activeDraftName ? 'Guardar cambios' : 'Guardar carrito'}</Button><Button fullWidth variant="secondary" onClick={() => { setLines([]); setPayments([]); setShowPayment(false); setActiveDraftName(null) }} disabled={!lines.length}>Cancelar venta</Button></div></div></div></div>}{variantTemplate && <PosVariantSheet template={variantTemplate} variants={variantOptions} prices={prices.data?.prices ?? []} priceList={selectedProfile?.selling_price_list} currency={currency} open={Boolean(variantTemplate)} loading={variantLoading} error={variantError} onClose={closeTemplate} onAdd={(item, uom, rate) => { addConfiguredItem(item, uom, rate); closeTemplate() }} resolvePrice={resolvePosPrice} onMissingPrice={(item, uom) => setMissingPrice({ item, uom })} />}{showClosing && shift && <PosClosingPanel paymentMethods={paymentMethods} balances={closingBalances} busy={busy} onChange={setClosingBalances} onClose={closeShift} />}{showHistory && shift && <SaleHistory sales={history.data ?? []} loading={history.isPending} error={history.error instanceof Error ? history.error.message : undefined} currency={currency} onRefresh={() => history.refetch()} onReturn={returnSale} />}{!shift && selectedProfile && <section className="pos-opening card"><div className="pos-section-heading"><div><h2>Apertura de turno</h2><span>{selectedProfile.company} · {selectedProfile.warehouse}</span></div><span>Fondo inicial</span></div><div className="pos-opening-lines">{paymentMethods.map((method) => <Field label={method.mode_of_payment} key={method.mode_of_payment}><Input type="number" min="0" step="0.01" value={openingBalances.find((line) => line.modeOfPayment === method.mode_of_payment)?.amount ?? 0} onChange={(event) => setOpeningBalances((current) => paymentMethods.map((candidate) => ({ modeOfPayment: candidate.mode_of_payment, amount: candidate.mode_of_payment === method.mode_of_payment ? Number(event.target.value) : current.find((line) => line.modeOfPayment === candidate.mode_of_payment)?.amount ?? 0 })))} /></Field>)}</div><p className="muted">ERPNext controla el turno y la conciliación. El cobro permanece bloqueado hasta abrirlo.</p></section>}</section>{shift && selectedProfile && <PosDraftsSheet drafts={drafts.data ?? []} open={showDrafts} loading={drafts.isPending || busy} error={drafts.error instanceof Error ? drafts.error.message : undefined} currency={currency} onOpenChange={setShowDrafts} onResume={resumeDraft} onDelete={deleteDraft} />}<PosPriceSheet line={priceLine} currency={currency} canEdit={canEditRate} open={showPriceSheet} onClose={() => setShowPriceSheet(false)} onApply={applyManualRate} /><PosMissingPriceDialog itemName={missingPrice?.item.item_name || missingPrice?.item.name || ''} uom={missingPrice?.uom.uom || ''} open={Boolean(missingPrice)} onOpenChange={(open) => { if (!open) setMissingPrice(null) }} onAddPrice={addMissingPrice} /></>
}
