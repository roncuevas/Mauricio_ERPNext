import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input, Notice, PageHeader, SearchButton, Spinner } from '../components/ui'
import { PosCart as Cart, PosPayments as Payments, PosSaleHistory as SaleHistory } from '../components/pos-sales'
import { PosProductCard } from '../components/pos-product-card'
import { PosVariantSheet } from '../components/pos-variant-sheet'
import { PosAuxiliaryActions, PosClosingPanel as BasePosClosingPanel, PosCustomerCreateSheet, PosCustomerPicker, PosMobileTabs } from '../components/pos-shadcn'
import { PosDraftsSheet } from '../components/pos-drafts-sheet'
import { PosLocalCartsSheet } from '../components/pos-local-carts-sheet'
import { PosMissingPriceDialog } from '../components/pos-missing-price-dialog'
import { PosPriceSheet } from '../components/pos-price-sheet'
import { PosReturnSheet } from '../components/pos-return-sheet'
import { VirtualizedCollection } from '../components/virtualized-collection'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../components/ui/dropdown-menu'
import { filterItems } from '../lib/item-cache'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { cartTotals, closingPayload, closingSummary, draftInvoicePayload, draftToCartLines, formatMoney, invoicePayments, normalizeClosingResponse, openingPayload, paymentLines, returnInvoicePayload, salesInvoicePayload, validateClosingInput, validatePayments, validateReturnQuantities } from '../lib/pos'
import type { CachedItem, ItemPrice, ItemUom, LocalPosCart, PosCartLine, PosDraftDocument, PosDraftSummary, PosPaymentLine, PosPaymentMethod, PosProfile, PosReturnDocument, PosSaleSummary, PosTaxRow, PosTaxTemplate } from '../lib/types'
import type { createErpNextClient } from '../lib/erpnext'
import { queryKeys } from '../lib/query-keys'
import { defaultPrice, defaultUom, findItemsByBarcode, priceForUom, variantPriceRange } from '../lib/pos-catalog'
import { readPosPreferences } from '../lib/pos-preferences'
import { featureFlags } from '../lib/feature-flags'
import { localCartsScope, readLocalPosCarts, writeLocalPosCarts } from '../lib/pos-local-carts'
import { readStockCache } from '../lib/stock-cache'

type Client = ReturnType<typeof createErpNextClient>
type ActiveShift = { name: string; profileName: string; user: string }
type PendingPriceResume = { lines: PosCartLine[]; payments: PosPaymentLine[]; customer: string; activeDraftName: string | null; item: CachedItem; uom: ItemUom }
type PendingSale = { name: string; doctype: 'Sales Invoice' | 'POS Invoice'; profileName: string; localCartId: string | null; status: 'draft' | 'unknown' | 'submitted' }
type PreparedClosing = { opening: { name: string; status?: string; company?: string; pos_profile?: string; user?: string; period_start_date?: string }; periodEndAt: string; user: string; openingBalances: PosPaymentLine[]; invoices: Array<{ name: string; doctype: 'Sales Invoice' | 'POS Invoice'; posting_date?: string; grand_total?: number; customer?: string; is_return?: number | boolean; return_against?: string; net_total?: number; total_qty?: number; total_taxes_and_charges?: number }>; payments: Array<{ mode_of_payment: string; amount: number; account?: string }>; taxes: Array<{ account_head: string; amount: number }> }
type PosClosingPanelProps = ComponentProps<typeof BasePosClosingPanel>
function currentDateTime() { const date = new Date(); return { date: date.toISOString().slice(0, 10), time: date.toTimeString().slice(0, 8), at: date.toISOString() } }

function storageKey(profileId: string) { return `mauricio-erpnext:pos-shift:${profileId}` }
function pendingPriceKey(profileId: string) { return `mauricio-erpnext:pos-price-return:${profileId}` }
function pendingSaleKey(profileId: string) { return `mauricio-erpnext:pos-pending-sale:${profileId}` }
function pendingReturnKey(profileId: string, invoiceName: string) { return `mauricio-erpnext:pos-pending-return:${profileId}:${invoiceName}` }
function readPendingSale(profileId: string): PendingSale | null {
  try {
    const value = JSON.parse(localStorage.getItem(pendingSaleKey(profileId)) || 'null') as Partial<PendingSale> | null
    if (!value || typeof value.name !== 'string' || !value.name || (value.doctype !== 'Sales Invoice' && value.doctype !== 'POS Invoice') || typeof value.profileName !== 'string' || !value.profileName || (value.localCartId !== null && typeof value.localCartId !== 'string') || (value.status !== 'draft' && value.status !== 'unknown' && value.status !== 'submitted')) return null
    return { name: value.name, doctype: value.doctype, profileName: value.profileName, localCartId: value.localCartId, status: value.status }
  } catch { return null }
}
function money(value: number, currency = 'MXN') { return formatMoney(value, currency) }
function ProductPicker({ items, prices, priceList, currency, lines, variantsByTemplate, autoFocus, onAdd, onDecrease, onOpenTemplate }: { items: CachedItem[]; prices: ItemPrice[]; priceList?: string; currency: string; lines: PosCartLine[]; variantsByTemplate: Map<string, CachedItem[]>; autoFocus: boolean; onAdd: (item: CachedItem) => void; onDecrease: (item: CachedItem) => void; onOpenTemplate: (item: CachedItem) => void }) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'available' | 'variants'>('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [limit, setLimit] = useState(60)
  const filtered = useMemo(() => {
    const roots = items.filter((item) => !item.disabled && !item.variant_of)
    const matchingRoots = filterItems(roots, search)
    const matchingVariantParents = new Set(filterItems(Array.from(variantsByTemplate.values()).flat(), search).map((item) => item.variant_of).filter(Boolean))
    const included = new Set(matchingRoots.map((item) => item.name))
    const candidates = search ? [...matchingRoots, ...roots.filter((item) => matchingVariantParents.has(item.name) && !included.has(item.name))] : matchingRoots
    return candidates.filter((item) => filter === 'all' || (filter === 'variants' ? Boolean(item.has_variants) || Boolean(variantsByTemplate.get(item.name)?.length) : Number(item.available_qty ?? 0) > 0 || (variantsByTemplate.get(item.name) ?? []).some((variant) => Number(variant.available_qty ?? 0) > 0)))
  }, [filter, items, search, variantsByTemplate])
  useEffect(() => setLimit(60), [filter, search, view])
  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const exact = findItemsByBarcode(items, input)
    if (exact.length === 1) {
      const match = exact[0]
      if (match.has_variants || variantsByTemplate.has(match.name)) onOpenTemplate(match)
      else onAdd(match)
      setInput('')
      setSearch('')
      return
    }
    setSearch(input.trim())
  }
  const visible = filtered.slice(0, limit)
  return <section className="pos-products card"><div className="pos-section-heading"><div><h2>{t('common.products')}</h2><span>{t('pos.products.availableCached', { available: filtered.length, cached: items.length })}</span></div><span className="pos-hint">{t('pos.products.selectCard')}</span></div><form className="pos-search" onSubmit={submitSearch}><Input data-pos-product-search value={input} onChange={(event) => setInput(event.target.value)} placeholder={t('pos.products.searchPlaceholder')} aria-label={t('pos.products.searchLabel')} autoFocus={autoFocus} /><SearchButton label={t('pos.products.searchLabel')} /></form><div className="pos-catalog-controls"><label className="pos-catalog-filter"><span>{t('posExtra.filter')}</span><Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}><SelectTrigger aria-label={t('posExtra.filter')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('posExtra.allProducts')}</SelectItem><SelectItem value="available">{t('posExtra.availableProducts')}</SelectItem><SelectItem value="variants">{t('posExtra.variantProducts')}</SelectItem></SelectContent></Select></label><div className="pos-view-toggle" role="group" aria-label={t('posExtra.catalogView')}><Button size="compact" variant={view === 'grid' ? 'primary' : 'secondary'} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>{t('posExtra.grid')}</Button><Button size="compact" variant={view === 'list' ? 'primary' : 'secondary'} aria-pressed={view === 'list'} onClick={() => setView('list')}>{t('posExtra.list')}</Button></div></div><VirtualizedCollection virtualize={false} className={`pos-product-grid${view === 'list' ? ' is-list' : ''}`} items={visible} getKey={(item) => item.name} estimateSize={128} renderItem={(item) => { const variants = variantsByTemplate.get(item.name) ?? []; const isTemplate = Boolean(item.has_variants) || variants.length > 0; const itemUom = defaultUom(item); const quantity = lines.find((line) => line.itemCode === item.name && line.uom === itemUom.uom)?.qty ?? 0; const inCart = isTemplate ? variants.some((variant) => lines.some((line) => line.itemCode === variant.name && line.qty > 0)) : quantity > 0; const priceHref = isTemplate ? `/prices?search=${encodeURIComponent(item.name)}` : `/prices/manage/${encodeURIComponent(item.name)}?returnTo=/pos`; return <PosProductCard item={item} price={isTemplate ? null : defaultPrice(item, prices, priceList)} priceLabel={isTemplate ? variantPriceRange(variants, prices, priceList, currency) : undefined} priceHref={priceHref} currency={currency} quantity={quantity} inCart={inCart} isTemplate={isTemplate} variantCount={variants.length} uomCount={item.uoms?.length ?? 0} onAdd={() => onAdd(item)} onDecrease={() => onDecrease(item)} onOpenTemplate={() => onOpenTemplate(item)} /> }}>{!filtered.length && <p className="muted p-4">{t('pos.products.noMatches')}</p>}</VirtualizedCollection>{filtered.length > visible.length && <Button type="button" variant="secondary" fullWidth onClick={() => setLimit((current) => current + 60)}>{t('posExtra.loadMore')}</Button>}</section>
}
export function PosPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [posPreferences] = useState(() => readPosPreferences(profileId))
  const [pendingSale, setPendingSale] = useState<PendingSale | null>(() => readPendingSale(profileId))
  const [profileName, setProfileName] = useState(pendingSale?.profileName ?? posPreferences.profileName)
  const [shift, setShift] = useState<ActiveShift | null>(() => { try { return JSON.parse(localStorage.getItem(storageKey(profileId)) || 'null') as ActiveShift | null } catch { return null } })
  const [lines, setLines] = useState<PosCartLine[]>([])
  const [payments, setPayments] = useState<PosPaymentLine[]>([])
  const [customer, setCustomer] = useState(posPreferences.defaultCustomer)
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
  const [showLocalCarts, setShowLocalCarts] = useState(false)
  const [localCarts, setLocalCarts] = useState<LocalPosCart[]>([])
  const [activeLocalCartId, setActiveLocalCartId] = useState<string | null>(null)
  const [localCartsHydrated, setLocalCartsHydrated] = useState(false)
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
  const [showCustomerCreate, setShowCustomerCreate] = useState(false)
  const [customerCreateError, setCustomerCreateError] = useState('')
  const [returnInvoice, setReturnInvoice] = useState<PosReturnDocument | null>(null)
  const [returnRemaining, setReturnRemaining] = useState<number[]>([])
  const [returnQuantities, setReturnQuantities] = useState<number[]>([])
  const [returnError, setReturnError] = useState('')
  const [returnDraftName, setReturnDraftName] = useState<string | null>(null)
  const beginPaymentRef = useRef<() => void>(() => undefined)

  const profiles = useQuery({ queryKey: queryKeys.pos.profiles(profileId), queryFn: async () => (await client.listDocuments<PosProfile>('POS Profile', { fields: ['name', 'company', 'warehouse', 'currency', 'selling_price_list', 'customer', 'tax_category', 'taxes_and_charges', 'disabled', 'allow_rate_change', 'allow_discount_change'], pageLength: 100, orderBy: 'name asc' })).data.filter((profile) => profile.disabled !== true && profile.disabled !== 1 && String(profile.disabled) !== '1') })
  const selectedProfile = profiles.data?.find((item) => item.name === profileName) ?? profiles.data?.[0]
  const canEditRate = selectedProfile?.allow_rate_change === true || selectedProfile?.allow_rate_change === 1
  const canDiscount = selectedProfile?.allow_discount_change === true || selectedProfile?.allow_discount_change === 1
  const salesTaxTemplate = useQuery({ queryKey: queryKeys.pos.salesTaxTemplate(profileId, selectedProfile?.name, selectedProfile?.taxes_and_charges), enabled: Boolean(selectedProfile?.taxes_and_charges), queryFn: () => client.getDocument<PosTaxTemplate>('Sales Taxes and Charges Template', selectedProfile!.taxes_and_charges!) })
  const taxRows = useMemo<PosTaxRow[]>(() => salesTaxTemplate.data?.taxes ?? [], [salesTaxTemplate.data?.taxes])
  const openEntries = useQuery({ queryKey: queryKeys.pos.openEntry(profileId, selectedProfile?.name, shift?.name), enabled: Boolean(selectedProfile && !shift), queryFn: async () => (await client.listDocuments<{ name: string; user: string; pos_profile: string; company: string; period_start_date: string; status: string }>('POS Opening Entry', { fields: ['name', 'user', 'pos_profile', 'company', 'period_start_date', 'status'], filters: [['pos_profile', '=', selectedProfile!.name], ['status', '=', 'Open']], pageLength: 10, orderBy: 'creation desc' })).data })
  const posSettings = useQuery({ queryKey: queryKeys.pos.settings(profileId), queryFn: async () => client.getDocument<{ invoice_type?: 'Sales Invoice' | 'POS Invoice' }>('POS Settings', 'POS Settings') })
  const methods = useQuery({ queryKey: queryKeys.pos.paymentMethods(profileId, selectedProfile?.name), enabled: Boolean(selectedProfile), queryFn: async (): Promise<PosPaymentMethod[]> => {
    const profileName = selectedProfile!.name
    const profile = await client.getDocument<PosProfile>('POS Profile', profileName)
    let configured: PosPaymentMethod[] = profile.payments ?? []
    if (!configured.length) {
      try { configured = (await client.listDocuments<PosPaymentMethod>('POS Payment Method', { fields: ['name', 'parent', 'parenttype', 'parentfield', 'mode_of_payment', 'default', 'allow_in_returns'], filters: [['parent', '=', profileName], ['parenttype', '=', 'POS Profile'], ['parentfield', '=', 'payments']], pageLength: 100, orderBy: 'idx asc' })).data } catch { configured = [] }
    }
    const rows = await Promise.all(configured.map(async (item): Promise<PosPaymentMethod> => {
      const name = item.mode_of_payment || (item as PosPaymentMethod & { name?: string }).name || ''
      if (!name) return { mode_of_payment: '' }
      try {
        const mode = await client.getDocument<{ type?: string }>('Mode of Payment', name)
        return { mode_of_payment: name, default: item.default, allow_in_returns: item.allow_in_returns, type: mode.type }
      } catch { return { mode_of_payment: name, default: item.default, allow_in_returns: item.allow_in_returns } }
    }))
    return rows.filter((payment) => payment.mode_of_payment)
  } })
  const customers = useQuery({ queryKey: queryKeys.pos.customers(profileId), queryFn: async () => (await client.listDocuments<{ name: string; customer_name?: string }>('Customer', { fields: ['name', 'customer_name'], filters: [['disabled', '=', 0]], pageLength: 500, orderBy: 'customer_name asc' })).data })
  const catalog = useQuery(catalogQueryOptions.item(profileId))
  const prices = useQuery(catalogQueryOptions.price(profileId))
  const variantCatalog = useQuery(catalogQueryOptions.variant(profileId))
  const stock = useQuery({ queryKey: queryKeys.catalog.stock(profileId), queryFn: () => readStockCache(profileId), staleTime: Infinity })
  const currency = selectedProfile?.currency || 'MXN'
  const paymentMethods = useMemo(() => methods.data ?? [], [methods.data])
  const cashMethods = useMemo(() => paymentMethods.filter((method) => method.type === 'Cash').map((method) => method.mode_of_payment), [paymentMethods])
  const closingPaymentMethods = useMemo(() => {
    const known = new Set(paymentMethods.map((method) => method.mode_of_payment))
    const extra = preparedClosing?.payments.filter((payment) => !known.has(payment.mode_of_payment)).map((payment) => ({ mode_of_payment: payment.mode_of_payment })) ?? []
    return [...paymentMethods, ...extra]
  }, [paymentMethods, preparedClosing?.payments])
  const totals = cartTotals(lines, taxRows)
  const paymentError = useMemo(() => { try { validatePayments(payments, totals.total, cashMethods); return '' } catch (error) { return error instanceof Error ? error.message : t('errors.unknown') } }, [cashMethods, payments, t, totals.total])
  const preparedSummary = preparedClosing ? closingSummary({ openingBalances: preparedClosing.openingBalances, balances: closingBalances, payments: preparedClosing.payments, invoices: preparedClosing.invoices, taxes: preparedClosing.taxes }) : undefined
  const cartCount = lines.reduce((sum, line) => sum + line.qty, 0)
  const posItems = useMemo(() => {
    const merged = new Map<string, CachedItem>()
    for (const item of catalog.data?.items ?? []) merged.set(item.name, { ...item })
    for (const item of variantCatalog.data?.items ?? []) merged.set(item.name, { ...merged.get(item.name), ...item })
    const stockByItem = new Map((stock.data?.bins ?? []).filter((bin) => bin.warehouse === selectedProfile?.warehouse).map((bin) => [bin.item_code, { actual: Number(bin.actual_qty ?? 0), reserved: Number(bin.reserved_qty ?? 0) }]))
    for (const item of merged.values()) {
      const quantities = stockByItem.get(item.name) ?? { actual: 0, reserved: 0 }
      item.actual_qty = quantities.actual
      item.available_qty = quantities.actual - quantities.reserved
      item.stock_known = Boolean(stock.data)
      if (item.disabled || !item.variant_of || merged.has(item.variant_of)) continue
      merged.set(item.variant_of, { name: item.variant_of, item_name: item.variant_of, has_variants: true, stock_uom: item.stock_uom, sales_uom: item.sales_uom, actual_qty: 0 })
    }
    for (const item of merged.values()) if (!item.variant_of) {
      const variants = Array.from(merged.values()).filter((variant) => variant.variant_of === item.name)
      if (variants.length) { item.actual_qty = variants.reduce((sum, variant) => sum + Number(variant.actual_qty ?? 0), 0); item.available_qty = variants.reduce((sum, variant) => sum + Number(variant.available_qty ?? 0), 0); item.stock_known = variants.every((variant) => Boolean(variant.stock_known)) }
    }
    return Array.from(merged.values())
  }, [catalog.data?.items, selectedProfile?.warehouse, stock.data?.bins, variantCatalog.data?.items])
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
  const history = useQuery({ queryKey: queryKeys.pos.history(profileId, shift?.name, invoiceMode), enabled: Boolean(shift && showHistory && !posSettings.isPending), queryFn: async () => (await client.listDocuments<PosSaleSummary>(invoiceMode, { fields: ['name', 'customer', 'posting_date', 'grand_total', 'status'], filters: [['pos_opening_entry', '=', shift?.name], ['docstatus', '=', 1], ['is_return', '=', 0]], pageLength: 100, orderBy: 'creation desc' })).data.map((invoice) => ({ ...invoice, doctype: invoiceMode })) })
  const drafts = useQuery({ queryKey: queryKeys.pos.drafts(profileId, selectedProfile?.name, invoiceMode), enabled: Boolean(shift && selectedProfile && showDrafts && !posSettings.isPending), queryFn: async () => (await client.listDocuments<PosDraftSummary>(invoiceMode, { fields: ['name', 'customer', 'grand_total', 'modified', 'posting_date', 'docstatus'], filters: [['docstatus', '=', 0], ['is_pos', '=', 1], ['pos_profile', '=', selectedProfile!.name]], pageLength: 100, orderBy: 'modified desc' })).data })

  useEffect(() => { if (profiles.data?.length && (!profileName || !profiles.data.some((profile) => profile.name === profileName))) setProfileName(profiles.data.find((profile) => profile.name === posPreferences.profileName)?.name ?? profiles.data[0].name) }, [profileName, profiles.data, posPreferences.profileName])
  useEffect(() => {
    if (!selectedProfile?.name) return
    let active = true
    setLocalCartsHydrated(false)
    readLocalPosCarts(profileId, selectedProfile.name).then((cache) => {
      if (!active) return
      setLocalCarts(cache.carts)
      setActiveLocalCartId(cache.activeCartId)
      setLines(cache.activeCartId ? cache.carts.find((cart) => cart.id === cache.activeCartId)?.lines ?? cache.current.lines : cache.current.lines)
      setCustomer(cache.activeCartId ? cache.carts.find((cart) => cart.id === cache.activeCartId)?.customer ?? cache.current.customer : cache.current.customer)
      setLocalCartsHydrated(true)
    }).catch(() => { if (active) { setLocalCarts([]); setActiveLocalCartId(null); setLocalCartsHydrated(true); setMessage(t('pos.localCarts.storageError')) } })
    return () => { active = false }
  }, [profileId, selectedProfile?.name, t])
  useEffect(() => {
    if (!localCartsHydrated || !selectedProfile?.name) return
    const timer = window.setTimeout(() => {
      const scope = localCartsScope(profileId, selectedProfile.name)
      const current = { lines, customer }
      const nextCarts = localCarts.map((cart) => cart.id === activeLocalCartId && (cart.lines !== lines || cart.customer !== customer) ? { ...cart, ...current, updatedAt: new Date().toISOString() } : cart)
      void writeLocalPosCarts({ profileId: scope, schemaVersion: 1, activeCartId: activeLocalCartId, current, carts: nextCarts }).catch(() => setMessage(t('pos.localCarts.storageError')))
      if (nextCarts.some((cart, index) => cart !== localCarts[index])) setLocalCarts(nextCarts)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [activeLocalCartId, customer, lines, localCarts, localCartsHydrated, profileId, selectedProfile?.name, t])
  useEffect(() => { if (customers.data && customer && !customers.data.some((entry) => entry.name === customer)) { setCustomer(''); setMessage(t('pos.messages.defaultCustomerMissing')) } }, [customer, customers.data, t])
  useEffect(() => { setOpeningBalances(paymentLines(paymentMethods)); setClosingBalances(paymentLines(paymentMethods)) }, [paymentMethods])
  useEffect(() => { if (!cartFeedback) return; const timer = window.setTimeout(() => setCartFeedback(null), 1800); return () => window.clearTimeout(timer) }, [cartFeedback])
  useEffect(() => { const onScroll = () => { setShowScrollTop(mobileView === 'products' && window.scrollY > 420); setShowMobileTabs(window.scrollY > 240) }; onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll) }, [mobileView])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F4') { event.preventDefault(); document.querySelector<HTMLInputElement>('[data-pos-product-search]')?.focus() }
      if (event.key === 'F8') { event.preventDefault(); document.querySelector<HTMLInputElement>('[data-pos-customer-search]')?.focus() }
      if (event.key === 'F9') { event.preventDefault(); beginPaymentRef.current() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  useEffect(() => {
    const existing = openEntries.data?.[0]
    if (!existing || shift || !selectedProfile) return
    client.getCurrentUser().then((currentUser) => {
      if (existing.user && existing.user !== currentUser) {
        setMessage(t('pos.messages.shiftOwnedBy', { name: existing.name, user: existing.user }))
        return
      }
      const next = { name: existing.name, profileName: existing.pos_profile || selectedProfile.name, user: currentUser }
      setShift(next); localStorage.setItem(storageKey(profileId), JSON.stringify(next)); setMessage(t('pos.messages.shiftDetected', { name: existing.name }))
    }).catch(() => setMessage(t('pos.messages.userCheckError')))
  }, [client, openEntries.data, profileId, selectedProfile, shift, t])
  useEffect(() => {
    if (!shift) return
    Promise.all([client.getDocument<{ name: string; status?: string; user?: string }>('POS Opening Entry', shift.name), client.getCurrentUser()]).then(([entry, currentUser]) => {
      if (entry.status && entry.status !== 'Open') {
        localStorage.removeItem(storageKey(profileId)); setShift(null); setMessage(t('pos.messages.shiftNoLongerOpen'))
      } else if (entry.user && entry.user !== currentUser) {
        localStorage.removeItem(storageKey(profileId)); setShift(null); setMessage(t('pos.messages.shiftWrongUser', { name: entry.name, owner: entry.user, user: currentUser }))
      }
    }).catch(() => { localStorage.removeItem(storageKey(profileId)); setShift(null); setMessage(t('pos.messages.shiftCheckError')) })
  }, [client, profileId, shift, t])

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
      setMessage(t('pos.messages.itemAddedWithPrice', { item: pendingPriceResume.item.item_name || pendingPriceResume.item.name }))
    } else {
      setMessage(t('pos.messages.savedPriceMismatch'))
    }
    setPendingPriceResume(null)
  // The callback is declared below to keep the POS handlers grouped together.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPriceResume, prices.data, selectedProfile?.selling_price_list])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === pendingSaleKey(profileId) && event.newValue) {
        const next = readPendingSale(profileId)
        if (next) setPendingSale(next)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [profileId])

  function addItem(item: CachedItem) {
    const uom = defaultUom(item)
    addConfiguredItem(item, uom, defaultPrice(item, prices.data?.prices ?? [], selectedProfile?.selling_price_list))
  }

  function addConfiguredItem(item: CachedItem, uom: ItemUom, rate: number) {
    if (pendingSale) return
    if (!Number.isFinite(rate) || rate <= 0) return setMissingPrice({ item, uom })
    setLines((current) => { const existing = current.find((line) => line.itemCode === item.name && line.uom === uom.uom); return existing ? current.map((line) => line.itemCode === item.name && line.uom === uom.uom ? { ...line, qty: line.qty + 1 } : line) : [...current, { itemCode: item.name, itemName: item.item_name || item.name, qty: 1, rate, priceListRate: rate, rateOverride: false, uom: uom.uom, stockUom: item.stock_uom || uom.uom, conversionFactor: uom.conversion_factor || 1, weightPerUnit: item.weight_per_unit, weightUom: item.weight_uom, warehouse: selectedProfile?.warehouse }] })
    setCartFeedback({ text: `${item.item_name || item.name} agregado`, id: Date.now() })
  }

  function addMissingPrice() {
    if (!missingPrice || pendingSale) return
    const resume: PendingPriceResume = { lines, payments, customer, activeDraftName, item: missingPrice.item, uom: missingPrice.uom }
    sessionStorage.setItem(pendingPriceKey(profileId), JSON.stringify(resume))
    const params = new URLSearchParams({ returnTo: '/pos', priceList: selectedProfile?.selling_price_list || 'Standard Selling', uom: missingPrice.uom.uom })
    setMissingPrice(null)
    navigate(`/prices/manage/${encodeURIComponent(missingPrice.item.name)}?${params.toString()}`)
  }

  function decreaseItem(item: CachedItem) {
    if (pendingSale) return
    const uom = defaultUom(item).uom
    setLines((current) => current.flatMap((line) => line.itemCode === item.name && line.uom === uom ? (line.qty <= 1 ? [] : [{ ...line, qty: line.qty - 1 }]) : [line]))
  }

  async function openTemplate(template: CachedItem) {
    if (pendingSale) return
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
    } catch (error) { setVariantError(error instanceof Error ? error.message : t('pos.variant.loadError')) } finally { setVariantLoading(false) }
  }

  function closeTemplate() { setVariantTemplate(null); setVariantOptions([]); setVariantError('') }

  function saveLocalCart(name: string) {
    if (pendingSale) return
    if (!selectedProfile || !lines.length) return setMessage(t('pos.messages.addProductToSave'))
    const now = new Date().toISOString()
    const cart: LocalPosCart = { id: crypto.randomUUID(), name, lines, customer, createdAt: now, updatedAt: now }
    setLocalCarts((current) => [...current, cart])
    setActiveLocalCartId(cart.id)
    setMessage(t('pos.localCarts.saved', { name }))
    setShowLocalCarts(false)
  }

  function resumeLocalCart(cart: LocalPosCart) {
    if (pendingSale) return
    if (lines.length && activeLocalCartId !== cart.id && !window.confirm(t('pos.localCarts.replaceConfirm'))) return
    setLines(cart.lines)
    setCustomer(cart.customer)
    setActiveLocalCartId(cart.id)
    setShowLocalCarts(false)
    setMessage(t('pos.localCarts.loaded', { name: cart.name }))
  }

  function renameLocalCart(cart: LocalPosCart, name: string) {
    setLocalCarts((current) => current.map((entry) => entry.id === cart.id ? { ...entry, name, updatedAt: new Date().toISOString() } : entry))
  }

  function deleteLocalCart(cart: LocalPosCart) {
    if (pendingSale) return
    setLocalCarts((current) => current.filter((entry) => entry.id !== cart.id))
    if (activeLocalCartId === cart.id) { setActiveLocalCartId(null); setLines([]); setCustomer('') }
    setMessage(t('pos.localCarts.deleted', { name: cart.name }))
  }

  function setActiveShift(next: ActiveShift | null) { setShift(next); if (!next) setMobileView('products'); if (next) localStorage.setItem(storageKey(profileId), JSON.stringify(next)); else localStorage.removeItem(storageKey(profileId)) }

  function storePendingSale(next: PendingSale | null) {
    if (next) localStorage.setItem(pendingSaleKey(profileId), JSON.stringify(next))
    else { try { localStorage.removeItem(pendingSaleKey(profileId)) } catch { /* A stale submitted record is safe; it will be verified on the next visit. */ } }
    setPendingSale(next)
  }

  async function openShift() {
    if (pendingSale) return
    if (!selectedProfile) return setMessage(t('pos.messages.selectProfile'))
    if (methods.isPending || openEntries.isPending) return setMessage(t('pos.messages.waitShiftData'))
    if (methods.isError || !paymentMethods.length) return setMessage(t('pos.messages.noValidPaymentMethods'))
    if (openEntries.data?.[0]) {
      const existing = openEntries.data[0]
      const currentUser = await client.getCurrentUser()
      if (existing.user && existing.user !== currentUser) return setMessage(t('pos.messages.shiftOwnedBy', { name: existing.name, user: existing.user }))
      const next = { name: existing.name, profileName: existing.pos_profile || selectedProfile.name, user: currentUser }
      setActiveShift(next)
      return setMessage(t('pos.messages.shiftDetected', { name: existing.name }))
    }
    setBusy(true); setMessage('')
    try { const user = await client.getCurrentUser(); const current = currentDateTime(); const balances = openingBalances.length ? openingBalances : paymentLines(paymentMethods); const created = await client.createDocument<{ name: string }>('POS Opening Entry', openingPayload({ profile: selectedProfile, user, openingAt: current.at, balances })); await client.submitDocument('POS Opening Entry', created.name); setActiveShift({ name: created.name, profileName: selectedProfile.name, user }); setPayments(paymentLines(paymentMethods, 0)); setMessage(t('pos.messages.shiftOpened', { name: created.name })) } catch (error) { await openEntries.refetch(); setMessage(error instanceof Error ? error.message : t('pos.messages.openShiftError')) } finally { setBusy(false) }
  }

  async function prepareClose() {
    if (!selectedProfile || !shift || busy || closingLoading || pendingSale) return
    setShowClosing(true); setClosingLoading(true); setClosingError(''); setMessage('')
    try {
      if (lines.length) throw new Error(t('pos.messages.pendingCartClose'))
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
      const next = error instanceof Error ? error.message : t('pos.messages.prepareCloseError')
      setClosingError(next); setMessage(next)
      if (next.includes('ya no está abierto')) { setActiveShift(null); setShowClosing(false) }
    } finally { setClosingLoading(false) }
  }

  async function closeShift() {
    if (!selectedProfile || !shift || !preparedClosing || busy || pendingSale) return
    setBusy(true); setClosingError(''); setMessage('')
    let createdName = closingDocument?.name
    try {
      if (closingDocument?.status === 'Submitted') {
        setActiveShift(null); setLines([]); setPayments([]); setPreparedClosing(null); setShowClosing(false); setMessage(t('pos.messages.shiftClosed', { name: closingDocument.name }))
        return
      }
      validateClosingInput({ profile: selectedProfile, user: preparedClosing.user, opening: preparedClosing.opening, periodEndAt: preparedClosing.periodEndAt, balances: closingBalances, invoices: preparedClosing.invoices, payments: preparedClosing.payments, cartLines: lines })
      const current = currentDateTime()
      const payload = closingPayload({ profile: selectedProfile, user: preparedClosing.user, openingEntry: shift.name, periodStartAt: preparedClosing.opening.period_start_date!, periodEndAt: preparedClosing.periodEndAt, closingDate: current.date, closingTime: current.time, openingBalances: preparedClosing.openingBalances, balances: closingBalances, invoices: preparedClosing.invoices, payments: preparedClosing.payments, taxes: preparedClosing.taxes })
      if (!createdName) createdName = (await client.createDocument<{ name: string }>('POS Closing Entry', payload)).name
      setClosingDocument({ name: createdName, status: 'Draft' })
      await client.submitDocument('POS Closing Entry', createdName)
      const closed = await client.getDocument<{ status?: string; docstatus?: number }>('POS Closing Entry', createdName)
      if (closed.status !== 'Submitted' && closed.docstatus !== 1) throw new Error(t('pos.messages.closingStateError', { status: closed.status || 'desconocido', name: createdName }))
      setClosingDocument({ name: createdName, status: 'Submitted' }); setActiveShift(null); setLines([]); setPayments([]); setPreparedClosing(null); setShowClosing(false); setMessage(t('pos.messages.shiftClosed', { name: createdName }))
    } catch (error) {
      const next = error instanceof Error ? error.message : t('pos.messages.closeShiftError')
      setClosingError(createdName ? `${next} POS Closing Entry: ${createdName}.` : next); setMessage(next)
      if (createdName) {
        try { const status = await client.getDocument<{ status?: string; docstatus?: number }>('POS Closing Entry', createdName); setClosingDocument({ name: createdName, status: status.status || (status.docstatus === 1 ? 'Submitted' : 'Desconocido') }) } catch { setClosingDocument({ name: createdName, status: 'Desconocido' }) }
      }
    } finally { setBusy(false) }
  }

  const beginPayment = useCallback(() => {
    if (pendingSale) return
    if (!lines.length) return
    if (!customer) return setMessage(t('pos.messages.selectCustomerToCharge'))
    setShowPayment(true)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }, [customer, lines.length, pendingSale, t])
  beginPaymentRef.current = beginPayment

  async function finishPendingSale(sale: PendingSale) {
    const sameProfile = profileName === sale.profileName
    try {
      const cache = await readLocalPosCarts(profileId, sale.profileName)
      const keptCustomer = posPreferences.rememberCustomer ? (sameProfile ? customer : cache.current.customer) : ''
      const current = sameProfile ? { lines: [], customer: keptCustomer } : cache.current
      const carts = cache.carts.map((cart) => cart.id === sale.localCartId ? { ...cart, lines: [], customer: posPreferences.rememberCustomer ? cart.customer : '', updatedAt: new Date().toISOString() } : cart)
      const activeCartId = cache.activeCartId === sale.localCartId ? null : cache.activeCartId
      await writeLocalPosCarts({ ...cache, activeCartId, current, carts })
      if (sameProfile) {
        setLocalCarts(carts)
        setActiveLocalCartId(activeCartId)
        setLines([])
        setPayments(paymentLines(paymentMethods))
        setShowPayment(false)
        setActiveDraftName(null)
        if (!posPreferences.rememberCustomer) setCustomer('')
      }
    } catch {
      storePendingSale({ ...sale, status: 'submitted' })
      setMessage(t('pos.messages.pendingSaleSubmitted', { name: sale.name }))
      return
    }
    storePendingSale(null)
    setMessage(t('pos.messages.saleConfirmed', { name: sale.name }))
    setShowHistory(true)
    void drafts.refetch()
  }

  async function resolvePendingSale(sale: PendingSale) {
    let current: { docstatus?: number }
    try {
      current = await client.getDocument<{ docstatus?: number }>(sale.doctype, sale.name)
    } catch {
      storePendingSale({ ...sale, status: 'unknown' })
      setMessage(t('pos.messages.pendingSaleUnknown', { name: sale.name }))
      return
    }

    if (current.docstatus === 1) return finishPendingSale(sale)
    if (current.docstatus !== 0) {
      storePendingSale({ ...sale, status: 'unknown' })
      setMessage(t('pos.messages.pendingSaleUnknown', { name: sale.name }))
      return
    }

    const draft = { ...sale, status: 'draft' as const }
    storePendingSale(draft)
    try {
      await client.submitDocument(sale.doctype, sale.name)
      current = await client.getDocument<{ docstatus?: number }>(sale.doctype, sale.name)
    } catch {
      try {
        current = await client.getDocument<{ docstatus?: number }>(sale.doctype, sale.name)
      } catch {
        storePendingSale({ ...sale, status: 'unknown' })
        setMessage(t('pos.messages.pendingSaleUnknown', { name: sale.name }))
        return
      }
    }

    if (current.docstatus === 1) return finishPendingSale(sale)
    if (current.docstatus === 0) {
      storePendingSale(draft)
      setMessage(t('pos.messages.pendingSaleDraft', { name: sale.name }))
      return
    }
    storePendingSale({ ...sale, status: 'unknown' })
    setMessage(t('pos.messages.pendingSaleUnknown', { name: sale.name }))
  }

  async function submitSale() {
    if (busy) return
    if (pendingSale) {
      setBusy(true); setMessage('')
      try { await resolvePendingSale(pendingSale) } catch { setMessage(t('pos.messages.pendingSaleUnknown', { name: pendingSale.name })) } finally { setBusy(false) }
      return
    }
    if (!selectedProfile || !shift) return setMessage(t('pos.messages.openShiftToCharge'))
    if (!customer) return setMessage(t('pos.messages.selectCustomerToCharge'))
    setBusy(true); setMessage('')
    let pending: PendingSale | null = null
    try {
      const current = currentDateTime()
      const payload = salesInvoicePayload({ profile: selectedProfile, customer, postingDate: current.date, postingTime: current.time, lines, posOpeningEntry: shift.name, invoiceMode })
      let name = activeDraftName
      if (name) await client.updateDocument(invoiceMode, name, payload)
      else name = (await client.createDocument<{ name: string }>(invoiceMode, payload)).name
      setActiveDraftName(name)
      const calculated = await client.getDocument<{ grand_total?: number }>(invoiceMode, name)
      const serverTotal = Number(calculated.grand_total)
      if (!Number.isFinite(serverTotal)) throw new Error('ERPNext no devolvió un total calculado válido; la factura sigue como borrador.')
      const confirmedPayments = invoicePayments(payments, serverTotal, cashMethods)
      validatePayments(confirmedPayments, serverTotal)
      await client.updateDocument(invoiceMode, name, { payments: confirmedPayments.map((payment) => ({ mode_of_payment: payment.modeOfPayment, amount: payment.amount })) })
      const verified = await client.getDocument<{ grand_total?: number }>(invoiceMode, name)
      if (Number(verified.grand_total) !== serverTotal) throw new Error('El total de ERPNext cambió al guardar el pago; revisa la factura en borrador antes de continuar.')
      pending = { name, doctype: invoiceMode, profileName: selectedProfile.name, localCartId: activeLocalCartId, status: 'draft' }
      storePendingSale(pending)
      await resolvePendingSale(pending)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('pos.messages.confirmSaleError'))
    } finally { setBusy(false) }
  }

  async function saveDraft() {
    if (pendingSale) return
    if (!selectedProfile || !shift) return setMessage(t('pos.messages.openShiftToSave'))
    if (!customer) return setMessage(t('pos.messages.selectCustomerToSave'))
    if (!lines.length) return setMessage(t('pos.messages.addProductToSave'))
    setBusy(true); setMessage('')
    try { const current = currentDateTime(); const payload = draftInvoicePayload({ profile: selectedProfile, customer, postingDate: current.date, postingTime: current.time, lines, taxes: taxRows, posOpeningEntry: shift.name, invoiceMode }); const saved = activeDraftName ? { name: activeDraftName } : await client.createDocument<{ name: string }>(invoiceMode, payload); if (activeDraftName) await client.updateDocument(invoiceMode, activeDraftName, payload); setLines([]); setPayments(paymentLines(paymentMethods)); setShowPayment(false); setActiveDraftName(null); if (!posPreferences.rememberCustomer) setCustomer(''); setMessage(t('pos.messages.cartSaved', { name: saved.name })); setShowDrafts(false); await drafts.refetch() } catch (error) { setMessage(error instanceof Error ? error.message : t('pos.messages.saveCartError')) } finally { setBusy(false) }
  }

  async function resumeDraft(summary: PosDraftSummary) {
    if (pendingSale) return
    if (lines.length) return setMessage(t('pos.messages.clearBeforeResume'))
    setBusy(true); setMessage('')
    try { const draft = await client.getDocument<PosDraftDocument>(invoiceMode, summary.name); if (!draft.items?.length) throw new Error(t('pos.messages.draftNoItems')); setLines(draftToCartLines(draft.items)); setCustomer(draft.customer || ''); setSearchCustomer(''); setPayments(paymentLines(paymentMethods)); setActiveDraftName(draft.name); setShowPayment(false); setShowDrafts(false); setMessage(t('pos.messages.draftLoaded', { name: draft.name })) } catch (error) { setMessage(error instanceof Error ? error.message : t('pos.messages.loadDraftError')) } finally { setBusy(false) }
  }

  async function deleteDraft(draft: PosDraftSummary) {
    if (pendingSale) return
    setBusy(true); setMessage('')
    try { await client.deleteDocument(invoiceMode, draft.name); setMessage(t('pos.messages.draftDiscarded', { name: draft.name })); await drafts.refetch() } catch (error) { setMessage(error instanceof Error ? error.message : t('pos.messages.discardDraftError')) } finally { setBusy(false) }
  }

  async function returnSale(name: string) {
    if (pendingSale || busy) return
    setBusy(true)
    setReturnError('')
    try {
      const invoice = await client.getDocument<PosReturnDocument>(invoiceMode, name)
      const related = await client.listDocuments<{ name: string }>(invoiceMode, { fields: ['name'], filters: [['return_against', '=', name], ['is_return', '=', 1], ['docstatus', '=', 1]], pageLength: 100, orderBy: 'creation asc' })
      const returnedDocs = await Promise.all(related.data.map((entry) => client.getDocument<{ items?: Array<{ sales_invoice_item?: string; qty: number }> }>(invoiceMode, entry.name)))
      const returnedBySource = new Map<string, number>()
      for (const document of returnedDocs) for (const item of document.items ?? []) if (item.sales_invoice_item) returnedBySource.set(item.sales_invoice_item, (returnedBySource.get(item.sales_invoice_item) ?? 0) + Math.abs(Number(item.qty)))
      const remaining = invoice.items.map((item) => Math.max(0, Math.abs(Number(item.qty)) - Math.min(Math.abs(Number(item.qty)), returnedBySource.get(item.name) ?? 0)))
      if (!remaining.some((quantity) => quantity > 0)) throw new Error(t('posExtra.returnFullyProcessed'))
      setReturnInvoice(invoice)
      setReturnRemaining(remaining)
      setReturnQuantities(remaining.map(() => 0))
      setReturnDraftName(localStorage.getItem(pendingReturnKey(profileId, name)))
    } catch (error) {
      setReturnError(error instanceof Error ? error.message : t('posExtra.returnFailed'))
    } finally { setBusy(false) }
  }

  async function submitReturn() {
    if (!returnInvoice || busy) return
    let name = returnDraftName
    setBusy(true)
    setReturnError('')
    try {
      validateReturnQuantities(returnInvoice.items, returnQuantities, returnRemaining.map((sold, index) => Math.abs(returnInvoice.items[index].qty) - sold))
      if (!window.confirm(t('pos.messages.returnConfirm', { name: returnInvoice.name }))) return
      const payload = returnInvoicePayload(returnInvoice, returnQuantities)
      if (!name) name = (await client.createDocument<{ name: string }>(returnInvoice.doctype || invoiceMode, payload)).name
      else {
        const current = await client.getDocument<{ docstatus?: number }>(returnInvoice.doctype || invoiceMode, name)
        if (current.docstatus === 1) {
          setMessage(t('pos.messages.returnConfirmed', { name }))
          setReturnInvoice(null)
          setReturnDraftName(null)
          localStorage.removeItem(pendingReturnKey(profileId, returnInvoice.name))
          await history.refetch()
          return
        }
        await client.updateDocument(returnInvoice.doctype || invoiceMode, name, payload)
      }
      setReturnDraftName(name)
      localStorage.setItem(pendingReturnKey(profileId, returnInvoice.name), name)
      await client.submitDocument(returnInvoice.doctype || invoiceMode, name)
      const submitted = await client.getDocument<{ docstatus?: number }>(returnInvoice.doctype || invoiceMode, name)
      if (submitted.docstatus !== 1) throw new Error(t('posExtra.returnNotSubmitted', { name }))
      setMessage(t('pos.messages.returnConfirmed', { name }))
      setReturnInvoice(null)
      setReturnDraftName(null)
      localStorage.removeItem(pendingReturnKey(profileId, returnInvoice.name))
      await history.refetch()
    } catch (error) {
      if (name) {
        try {
          const current = await client.getDocument<{ docstatus?: number }>(returnInvoice.doctype || invoiceMode, name)
          if (current.docstatus === 1) {
            setMessage(t('pos.messages.returnConfirmed', { name }))
            setReturnInvoice(null)
            setReturnDraftName(null)
            localStorage.removeItem(pendingReturnKey(profileId, returnInvoice.name))
            await history.refetch()
            return
          }
        } catch { /* Keep the draft identity so retry cannot create a second return. */ }
      }
      setReturnDraftName(name)
      setReturnError(error instanceof Error ? error.message : t('posExtra.returnFailed'))
    } finally { setBusy(false) }
  }

  async function printSale(name: string) {
    const printWindow = window.open('', '_blank')
    if (!printWindow) { setMessage(t('posExtra.popupBlocked')); return }
    printWindow.opener = null
    try {
      const invoice = await client.getDocument<{ name: string; customer: string; posting_date?: string; currency?: string; net_total?: number; total_taxes_and_charges?: number; grand_total?: number; items: Array<{ item_name?: string; item_code: string; qty: number; uom?: string; rate: number; amount?: number }> }>(invoiceMode, name)
      const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
      const currencyCode = escape(invoice.currency || currency)
      const rows = invoice.items.map((item) => `<tr><td>${escape(item.item_name || item.item_code)}<small>${escape(item.item_code)} · ${escape(item.uom || '')}</small></td><td>${escape(item.qty)}</td><td>${escape(formatMoney(Number(item.rate), currencyCode))}</td><td>${escape(formatMoney(Number(item.amount ?? item.qty * item.rate), currencyCode))}</td></tr>`).join('')
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(invoice.name)}</title><style>body{font:14px system-ui,sans-serif;margin:24px;color:#172033}h1{font-size:20px}small{display:block;color:#64748b}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;padding:8px 4px;border-bottom:1px solid #ddd}td:nth-child(n+2),th:nth-child(n+2){text-align:right}.totals{margin:20px 0 0 auto;width:240px}.totals p{display:flex;justify-content:space-between} @media print{body{margin:8mm}}</style></head><body><h1>${escape(invoice.name)}</h1><p>${escape(invoice.customer)} · ${escape(invoice.posting_date || '')}</p><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><p><span>Subtotal</span><b>${escape(formatMoney(Number(invoice.net_total ?? 0), currencyCode))}</b></p><p><span>Impuestos</span><b>${escape(formatMoney(Number(invoice.total_taxes_and_charges ?? 0), currencyCode))}</b></p><p><span>Total</span><b>${escape(formatMoney(Number(invoice.grand_total ?? 0), currencyCode))}</b></p></div><script>window.onload=()=>{window.focus();window.print()}</script></body></html>`)
      printWindow.document.close()
    } catch (error) {
      printWindow.close()
      setMessage(error instanceof Error ? error.message : t('posExtra.receiptFailed'))
    }
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

  function updatePayment(next: PosPaymentLine[]) { if (!pendingSale) setPayments(next.filter((payment) => payment.amount > 0)) }

  async function createCustomer(name: string, mobile: string) {
    if (busy || !shift || pendingSale) return
    setBusy(true)
    setCustomerCreateError('')
    try {
      const created = await client.createDocument<{ name: string; customer_name?: string }>('Customer', { customer_name: name, customer_type: 'Individual', ...(mobile ? { mobile_no: mobile } : {}) })
      queryClient.setQueryData<Array<{ name: string; customer_name?: string }>>(queryKeys.pos.customers(profileId), (current = []) => [...current.filter((item) => item.name !== created.name), { name: created.name, customer_name: created.customer_name || name }])
      setCustomer(created.name)
      setSearchCustomer('')
      setShowCustomerCreate(false)
      setMessage(t('posExtra.customerCreated', { name: created.customer_name || name }))
    } catch (error) {
      setCustomerCreateError(error instanceof Error ? error.message : t('posExtra.customerCreateError'))
    } finally { setBusy(false) }
  }

  function cancelSale() {
    if (pendingSale || !lines.length || !window.confirm(t('pos.messages.cancelSaleConfirm'))) return
    setActiveLocalCartId(null)
    setLines([])
    setPayments([])
    setShowPayment(false)
    setActiveDraftName(null)
  }
  const selectedCustomer = customers.data?.find((item) => item.name === customer)
  const priceLine = priceLineIndex === null ? null : lines[priceLineIndex] ?? null
  function applyManualRate(rate: number) {
    if (priceLineIndex === null || !Number.isFinite(rate) || rate <= 0) return
    setLines((current) => current.map((line, index) => index === priceLineIndex ? { ...line, rate, rateOverride: rate !== (line.priceListRate ?? line.rate) } : line))
    setShowPriceSheet(false)
  }

  function PosClosingPanel(props: PosClosingPanelProps) {
    return <BasePosClosingPanel {...props} open={showClosing} paymentMethods={closingPaymentMethods} summary={preparedSummary} busy={busy || closingLoading} error={closingError || (closingLoading ? t('pos.messages.closingLoading') : undefined)} onSubmit={props.onClose ?? closeShift} onOpenChange={setShowClosing} />
  }

  return <><section className="pos-workspace"><PageHeader title={t("posPage.title")} description={t("posPage.description")} status={<><span>{shift ? t("posPage.shiftStatus", { name: shift.name }) : t("posPage.noShift")}</span>{selectedProfile && <span>{selectedProfile.name} · {selectedProfile.company} · {selectedProfile.warehouse}</span>}{message && <span className="font-medium text-blue-700">{message}</span>}</>} /><div className="pos-toolbar card"><div className="pos-toolbar-main"><Field label={t("posPage.profileLabel")}><Select value={selectedProfile?.name ?? undefined} onValueChange={(value) => { setProfileName(value); setCustomer(posPreferences.defaultCustomer); setSearchCustomer('') }} disabled={Boolean(shift) || Boolean(pendingSale)}><SelectTrigger aria-label={t("posPage.profileLabel")} className="pos-shift-selector"><SelectValue placeholder={t("posPage.selectProfile")} /></SelectTrigger><SelectContent align="start">{(profiles.data ?? []).map((item) => <SelectItem value={item.name} key={item.name}>{item.name}</SelectItem>)}</SelectContent></Select></Field><PosCustomerPicker enabled={Boolean(shift) && !pendingSale} value={selectedCustomer?.customer_name || customer} search={searchCustomer} customers={customers.data ?? []} onSearch={(value) => { setCustomer(""); setSearchCustomer(value) }} onSelect={(name) => { setCustomer(name); setSearchCustomer("") }} onCreate={() => { setCustomerCreateError(""); setShowCustomerCreate(true) }} /></div><div className="pos-toolbar-actions">{!shift ? <Button onClick={openShift} disabled={busy || Boolean(pendingSale) || !selectedProfile || !paymentMethods.length || methods.isPending || openEntries.isPending}>{busy ? <><Spinner /> {t("posPage.opening")}</> : methods.isPending ? <><Spinner /> {t("posPage.loadingPayments")}</> : t("posPage.openShift")}</Button> : <Button variant="danger" onClick={prepareClose} disabled={busy || Boolean(pendingSale)}>{busy ? <><Spinner /> {t("posPage.closing")}</> : t("posPage.prepareClose")}</Button>}<DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" disabled={busy}>{t("pos.mobile.moreActions")}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><PosAuxiliaryActions showHistory={showHistory} onToggleHistory={() => setShowHistory((current) => !current)} onOpenDrafts={() => { if (!pendingSale) setShowDrafts(true) }} onOpenLocalCarts={() => { if (!pendingSale) setShowLocalCarts(true) }} onOpenQuotations={featureFlags.quotationsView ? () => navigate('/pos/cotizaciones?profile=' + encodeURIComponent(selectedProfile?.name ?? '')) : undefined} historyDisabled={!shift} draftsDisabled={!shift || Boolean(pendingSale)} localCartsDisabled={Boolean(pendingSale)} /></DropdownMenuContent></DropdownMenu></div></div>{!profiles.isPending && !profiles.data?.length && <Notice>{t("posPage.noProfiles")}</Notice>}{methods.isError && <Notice>{methods.error instanceof Error ? methods.error.message : t("posPage.paymentMethodsError")}</Notice>}{!methods.isPending && !methods.data?.length && <Notice tone="warning">{t("posPage.paymentMethodsInvalid")}</Notice>}{(!methods.isPending && !paymentMethods.length) && <Notice tone="warning">{t("posPage.paymentMethodsMissing")}</Notice>}{posSettings.isError && <Notice tone="warning">{t("posPage.settingsFallback")}</Notice>}{!catalog.data && <Notice tone="warning">{t("posPage.catalogMissing")}</Notice>}{shift && <PosMobileTabs value={mobileView} count={cartCount} fixed={showMobileTabs} showHistory={showHistory} onChange={setMobileView} onToggleHistory={() => setShowHistory((current) => !current)} onOpenDrafts={() => { if (!pendingSale) setShowDrafts(true) }} onOpenQuotations={featureFlags.quotationsView ? () => navigate('/pos/cotizaciones?profile=' + encodeURIComponent(selectedProfile?.name ?? '')) : undefined} onOpenLocalCarts={() => { if (!pendingSale) setShowLocalCarts(true) }} draftsDisabled={!shift || Boolean(pendingSale)} localCartsDisabled={Boolean(pendingSale)} />}{showScrollTop && <button type="button" className="pos-scroll-top is-visible" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label={t("posPage.scrollTop")}>↑</button>}{cartFeedback && <div className="pos-cart-feedback" role="status" aria-live="polite">{cartFeedback.text}</div>}{pendingSale && <Notice tone="warning"><div className="pos-pending-sale" role="status"><div><strong>{pendingSale.status === 'draft' ? t('pos.messages.pendingSaleDraft', { name: pendingSale.name }) : pendingSale.status === 'submitted' ? t('pos.messages.pendingSaleSubmitted', { name: pendingSale.name }) : t('pos.messages.pendingSaleUnknown', { name: pendingSale.name })}</strong><span>{t('pos.sales.linesTotal', { count: lines.length, total: money(totals.total, currency) })}</span></div><Button variant="secondary" size="compact" onClick={submitSale} disabled={busy}>{busy ? <><Spinner /> {t('posPage.confirming')}</> : t('pos.messages.verifyPendingSale')}</Button></div></Notice>}{shift && <div className="pos-layout" inert={Boolean(pendingSale)}><div className={`pos-mobile-products ${mobileView === 'products' ? 'is-visible' : ''}`}><ProductPicker items={posItems} prices={prices.data?.prices ?? []} priceList={selectedProfile?.selling_price_list} currency={currency} lines={lines} variantsByTemplate={variantsByTemplate} autoFocus={posPreferences.autoFocusProductSearch} onAdd={addItem} onDecrease={decreaseItem} onOpenTemplate={openTemplate} /></div><div className={`pos-mobile-cart ${mobileView === 'cart' ? 'is-visible' : ''}`}><div className="pos-sale-column"><Cart lines={lines} taxRows={taxRows} currency={currency} canEditRate={canEditRate} canDiscount={canDiscount} onEditPrice={(index) => { if (!pendingSale) { setPriceLineIndex(index); setShowPriceSheet(true) } }} onChange={(index, patch) => { if (!pendingSale) setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line)) }} onRemove={(index) => { if (!pendingSale) setLines((current) => current.filter((_, lineIndex) => lineIndex !== index)) }} />{showPayment && <Payments methods={paymentMethods} payments={payments} total={totals.total} currency={currency} cashMethods={cashMethods} onChange={updatePayment} />}<div className="pos-sale-actions">{showPayment ? <Button fullWidth onClick={submitSale} disabled={busy || Boolean(pendingSale) || !lines.length || Boolean(paymentError)}>{busy ? <><Spinner /> {t("posPage.confirming")}</> : t("posPage.confirmCharge", { total: money(totals.total, currency) })}</Button> : <Button fullWidth onClick={beginPayment} disabled={busy || Boolean(pendingSale) || !lines.length}>{t("posPage.charge", { total: money(totals.total, currency) })}</Button>}<Button fullWidth onClick={saveDraft} disabled={busy || Boolean(pendingSale) || !lines.length}>{activeDraftName ? t("posPage.saveChanges") : t("posPage.saveCart")}</Button><Button fullWidth variant="secondary" onClick={cancelSale} disabled={Boolean(pendingSale) || !lines.length}>{t("posPage.cancelSale")}</Button></div></div></div></div>}{variantTemplate && <PosVariantSheet template={variantTemplate} variants={variantOptions} prices={prices.data?.prices ?? []} priceList={selectedProfile?.selling_price_list} currency={currency} cartLines={lines} open={Boolean(variantTemplate)} loading={variantLoading} error={variantError} onClose={closeTemplate} onAdd={(item, uom, rate) => { addConfiguredItem(item, uom, rate); closeTemplate() }} resolvePrice={resolvePosPrice} onMissingPrice={(item, uom) => setMissingPrice({ item, uom })} />}{showClosing && shift && <PosClosingPanel paymentMethods={paymentMethods} balances={closingBalances} busy={busy} onChange={setClosingBalances} onClose={closeShift} />}{showHistory && shift && <SaleHistory sales={history.data ?? []} loading={history.isPending} error={history.error instanceof Error ? history.error.message : undefined} currency={currency} onRefresh={() => history.refetch()} onReturn={returnSale} onPrint={printSale} />}{!shift && selectedProfile && <section className="pos-opening card"><div className="pos-section-heading"><div><h2>{t("posPage.openingTitle")}</h2><span>{selectedProfile.company} · {selectedProfile.warehouse}</span></div><span>{t("posPage.openingFund")}</span></div><div className="pos-opening-lines">{paymentMethods.map((method) => <Field label={method.mode_of_payment} key={method.mode_of_payment}><Input type="number" min="0" step="0.01" value={openingBalances.find((line) => line.modeOfPayment === method.mode_of_payment)?.amount ?? 0} onChange={(event) => setOpeningBalances((current) => paymentMethods.map((candidate) => ({ modeOfPayment: candidate.mode_of_payment, amount: candidate.mode_of_payment === method.mode_of_payment ? Number(event.target.value) : current.find((line) => line.modeOfPayment === candidate.mode_of_payment)?.amount ?? 0 })))} /></Field>)}</div><p className="muted">{t("posPage.openingHelp")}</p></section>}</section><PosLocalCartsSheet carts={localCarts} activeCartId={activeLocalCartId} open={showLocalCarts} currency={currency} onOpenChange={setShowLocalCarts} onSave={saveLocalCart} onResume={resumeLocalCart} onRename={renameLocalCart} onDelete={deleteLocalCart} />{shift && selectedProfile && <PosDraftsSheet drafts={drafts.data ?? []} open={showDrafts} loading={drafts.isPending || busy} error={drafts.error instanceof Error ? drafts.error.message : undefined} currency={currency} onOpenChange={setShowDrafts} onResume={resumeDraft} onDelete={deleteDraft} />}<PosPriceSheet line={priceLine} currency={currency} canEdit={canEditRate} open={showPriceSheet} onClose={() => setShowPriceSheet(false)} onApply={applyManualRate} /><PosMissingPriceDialog itemName={missingPrice?.item.item_name || missingPrice?.item.name || ''} uom={missingPrice?.uom.uom || ''} open={Boolean(missingPrice)} onOpenChange={(open) => { if (!open) setMissingPrice(null) }} onAddPrice={addMissingPrice} /><PosReturnSheet invoice={returnInvoice} remaining={returnRemaining} quantities={returnQuantities} open={Boolean(returnInvoice)} busy={busy} error={returnError} currency={currency} onChange={(index, quantity) => setReturnQuantities((current) => current.map((value, lineIndex) => lineIndex === index ? quantity : value))} onClose={() => { if (!returnDraftName) setReturnInvoice(null) }} onSubmit={submitReturn} /><PosCustomerCreateSheet open={showCustomerCreate} busy={busy} error={customerCreateError} onOpenChange={setShowCustomerCreate} onCreate={createCustomer} /></>
}
