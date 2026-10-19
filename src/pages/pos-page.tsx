import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input, Notice, PageHeader, SearchButton, Spinner } from '../components/ui'
import { PosCart as Cart, PosPayments as Payments, PosSaleHistory as SaleHistory } from '../components/pos-sales'
import { PosProductCard } from '../components/pos-product-card'
import { PosVariantSheet } from '../components/pos-variant-sheet'
import { PosClosingPanel as BasePosClosingPanel, PosCustomerPicker, PosMobileTabs } from '../components/pos-shadcn'
import { PosDraftsSheet } from '../components/pos-drafts-sheet'
import { PosMissingPriceDialog } from '../components/pos-missing-price-dialog'
import { PosPriceSheet } from '../components/pos-price-sheet'
import { VirtualizedCollection } from '../components/virtualized-collection'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { filterItems } from '../lib/item-cache'
import { catalogQueryOptions } from '../lib/catalog-query-options'
import { cartTotals, closingPayload, closingSummary, draftInvoicePayload, draftToCartLines, formatMoney, normalizeClosingResponse, openingPayload, paymentLines, returnInvoicePayload, salesInvoicePayload, validateClosingInput } from '../lib/pos'
import type { CachedItem, ItemPrice, ItemUom, PosCartLine, PosDraftDocument, PosDraftSummary, PosPaymentLine, PosPaymentMethod, PosProfile, PosSaleSummary, PosTaxRow, PosTaxTemplate } from '../lib/types'
import type { createErpNextClient } from '../lib/erpnext'
import { queryKeys } from '../lib/query-keys'
import { defaultPrice, defaultUom, priceForUom, variantPriceRange } from '../lib/pos-catalog'
import { readPosPreferences } from '../lib/pos-preferences'

type Client = ReturnType<typeof createErpNextClient>
type ActiveShift = { name: string; profileName: string; user: string }
type PendingPriceResume = { lines: PosCartLine[]; payments: PosPaymentLine[]; customer: string; activeDraftName: string | null; item: CachedItem; uom: ItemUom }
type PreparedClosing = { opening: { name: string; status?: string; company?: string; pos_profile?: string; user?: string; period_start_date?: string }; periodEndAt: string; user: string; openingBalances: PosPaymentLine[]; invoices: Array<{ name: string; doctype: 'Sales Invoice' | 'POS Invoice'; posting_date?: string; grand_total?: number; customer?: string; is_return?: number | boolean; return_against?: string; net_total?: number; total_qty?: number; total_taxes_and_charges?: number }>; payments: Array<{ mode_of_payment: string; amount: number; account?: string }>; taxes: Array<{ account_head: string; amount: number }> }
type PosClosingPanelProps = ComponentProps<typeof BasePosClosingPanel>
function currentDateTime() { const date = new Date(); return { date: date.toISOString().slice(0, 10), time: date.toTimeString().slice(0, 8), at: date.toISOString() } }

function storageKey(profileId: string) { return `mauricio-erpnext:pos-shift:${profileId}` }
function pendingPriceKey(profileId: string) { return `mauricio-erpnext:pos-price-return:${profileId}` }
function money(value: number, currency = 'MXN') { return formatMoney(value, currency) }
function ProductPicker({ items, prices, priceList, currency, lines, variantsByTemplate, autoFocus, onAdd, onDecrease, onOpenTemplate }: { items: CachedItem[]; prices: ItemPrice[]; priceList?: string; currency: string; lines: PosCartLine[]; variantsByTemplate: Map<string, CachedItem[]>; autoFocus: boolean; onAdd: (item: CachedItem) => void; onDecrease: (item: CachedItem) => void; onOpenTemplate: (item: CachedItem) => void }) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const roots = items.filter((item) => !item.disabled && !item.variant_of)
    const matchingRoots = filterItems(roots, search)
    if (!search) return matchingRoots
    const matchingVariantParents = new Set(filterItems(Array.from(variantsByTemplate.values()).flat(), search).map((item) => item.variant_of).filter(Boolean))
    const included = new Set(matchingRoots.map((item) => item.name))
    return [...matchingRoots, ...roots.filter((item) => matchingVariantParents.has(item.name) && !included.has(item.name))]
  }, [items, search, variantsByTemplate])
  return <section className="pos-products card"><div className="pos-section-heading"><div><h2>{t('common.products')}</h2><span>{t('pos.products.availableCached', { available: filtered.length, cached: items.length })}</span></div><span className="pos-hint">{t('pos.products.selectCard')}</span></div><form className="pos-search" onSubmit={(event) => { event.preventDefault(); setSearch(input.trim()) }}><Input value={input} onChange={(event) => setInput(event.target.value)} placeholder={t('pos.products.searchPlaceholder')} aria-label={t('pos.products.searchLabel')} autoFocus={autoFocus} /><SearchButton label={t('pos.products.searchLabel')} /></form><VirtualizedCollection virtualize={false} className="pos-product-grid" items={filtered} getKey={(item) => item.name} estimateSize={128} renderItem={(item) => { const variants = variantsByTemplate.get(item.name) ?? []; const isTemplate = Boolean(item.has_variants) || variants.length > 0; const itemUom = defaultUom(item); const quantity = lines.find((line) => line.itemCode === item.name && line.uom === itemUom.uom)?.qty ?? 0; const inCart = isTemplate ? variants.some((variant) => lines.some((line) => line.itemCode === variant.name && line.qty > 0)) : quantity > 0; const priceHref = isTemplate ? `/prices?search=${encodeURIComponent(item.name)}` : `/prices/manage/${encodeURIComponent(item.name)}?returnTo=/pos`; return <PosProductCard item={item} price={isTemplate ? null : defaultPrice(item, prices, priceList)} priceLabel={isTemplate ? variantPriceRange(variants, prices, priceList, currency) : undefined} priceHref={priceHref} currency={currency} quantity={quantity} inCart={inCart} isTemplate={isTemplate} variantCount={variants.length} uomCount={item.uoms?.length ?? 0} onAdd={() => onAdd(item)} onDecrease={() => onDecrease(item)} onOpenTemplate={() => onOpenTemplate(item)} /> }}>{!filtered.length && <p className="muted p-4">{t('pos.products.noMatches')}</p>}</VirtualizedCollection></section>
}

export function PosPage({ client, profileId }: { client: Client; profileId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [posPreferences] = useState(() => readPosPreferences(profileId))
  const [profileName, setProfileName] = useState(posPreferences.profileName)
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
  const salesTaxTemplate = useQuery({ queryKey: queryKeys.pos.salesTaxTemplate(profileId, selectedProfile?.name, selectedProfile?.taxes_and_charges), enabled: Boolean(selectedProfile?.taxes_and_charges), queryFn: () => client.getDocument<PosTaxTemplate>('Sales Taxes and Charges Template', selectedProfile!.taxes_and_charges!) })
  const taxRows = useMemo<PosTaxRow[]>(() => salesTaxTemplate.data?.taxes ?? [], [salesTaxTemplate.data?.taxes])
  const openEntries = useQuery({ queryKey: queryKeys.pos.openEntry(profileId, selectedProfile?.name, shift?.name), enabled: Boolean(selectedProfile && !shift), queryFn: async () => (await client.listDocuments<{ name: string; user: string; pos_profile: string; company: string; period_start_date: string; status: string }>('POS Opening Entry', { fields: ['name', 'user', 'pos_profile', 'company', 'period_start_date', 'status'], filters: [['pos_profile', '=', selectedProfile!.name], ['status', '=', 'Open']], pageLength: 10, orderBy: 'creation desc' })).data })
  const posSettings = useQuery({ queryKey: queryKeys.pos.settings(profileId), queryFn: async () => client.getDocument<{ invoice_type?: 'Sales Invoice' | 'POS Invoice' }>('POS Settings', 'POS Settings') })
  const methods = useQuery({ queryKey: queryKeys.pos.paymentMethods(profileId, selectedProfile?.name), enabled: Boolean(selectedProfile), queryFn: async () => { const profileName = selectedProfile!.name; const profile = await client.getDocument<PosProfile>('POS Profile', profileName); let configured: PosPaymentMethod[] = profile.payments ?? []; if (!configured.length) { try { configured = (await client.listDocuments<PosPaymentMethod>('POS Payment Method', { fields: ['name', 'parent', 'parenttype', 'parentfield', 'mode_of_payment', 'default', 'allow_in_returns'], filters: [['parent', '=', profileName], ['parenttype', '=', 'POS Profile'], ['parentfield', '=', 'payments']], pageLength: 100, orderBy: 'idx asc' })).data } catch { configured = [] } } return configured.map((item) => ({ mode_of_payment: item.mode_of_payment || (item as PosPaymentMethod & { name?: string }).name || '', default: item.default, allow_in_returns: item.allow_in_returns })).filter((payment) => payment.mode_of_payment) } })
  const customers = useQuery({ queryKey: queryKeys.pos.customers(profileId), queryFn: async () => (await client.listDocuments<{ name: string; customer_name?: string }>('Customer', { fields: ['name', 'customer_name'], filters: [['disabled', '=', 0]], pageLength: 500, orderBy: 'customer_name asc' })).data })
  const catalog = useQuery(catalogQueryOptions.item(profileId))
  const prices = useQuery(catalogQueryOptions.price(profileId))
  const variantCatalog = useQuery(catalogQueryOptions.variant(profileId))
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
  const history = useQuery({ queryKey: queryKeys.pos.history(profileId, shift?.name, invoiceMode), enabled: Boolean(shift && showHistory && !posSettings.isPending), queryFn: async () => (await client.listDocuments<PosSaleSummary>(invoiceMode, { fields: ['name', 'customer', 'posting_date', 'grand_total', 'status'], filters: [['pos_opening_entry', '=', shift?.name], ['docstatus', '=', 1]], pageLength: 100, orderBy: 'creation desc' })).data.map((invoice) => ({ ...invoice, doctype: invoiceMode })) })
  const drafts = useQuery({ queryKey: queryKeys.pos.drafts(profileId, selectedProfile?.name, invoiceMode), enabled: Boolean(shift && selectedProfile && showDrafts && !posSettings.isPending), queryFn: async () => (await client.listDocuments<PosDraftSummary>(invoiceMode, { fields: ['name', 'customer', 'grand_total', 'modified', 'posting_date', 'docstatus'], filters: [['docstatus', '=', 0], ['is_pos', '=', 1], ['pos_profile', '=', selectedProfile!.name]], pageLength: 100, orderBy: 'modified desc' })).data })

  useEffect(() => { if (profiles.data?.length && (!profileName || !profiles.data.some((profile) => profile.name === profileName))) setProfileName(profiles.data.find((profile) => profile.name === posPreferences.profileName)?.name ?? profiles.data[0].name) }, [profileName, profiles.data, posPreferences.profileName])
  useEffect(() => { if (customers.data && customer && !customers.data.some((entry) => entry.name === customer)) { setCustomer(''); setMessage(t('pos.messages.defaultCustomerMissing')) } }, [customer, customers.data, t])
  useEffect(() => { setOpeningBalances(paymentLines(paymentMethods)); setClosingBalances(paymentLines(paymentMethods)) }, [paymentMethods])
  useEffect(() => { if (!cartFeedback) return; const timer = window.setTimeout(() => setCartFeedback(null), 1800); return () => window.clearTimeout(timer) }, [cartFeedback])
  useEffect(() => { const onScroll = () => { setShowScrollTop(mobileView === 'products' && window.scrollY > 420); setShowMobileTabs(window.scrollY > 240) }; onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll) }, [mobileView])
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
    } catch (error) { setVariantError(error instanceof Error ? error.message : t('pos.variant.loadError')) } finally { setVariantLoading(false) }
  }

  function closeTemplate() { setVariantTemplate(null); setVariantOptions([]); setVariantError('') }

  function setActiveShift(next: ActiveShift | null) { setShift(next); if (!next) setMobileView('products'); if (next) localStorage.setItem(storageKey(profileId), JSON.stringify(next)); else localStorage.removeItem(storageKey(profileId)) }

  async function openShift() {
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
    if (!selectedProfile || !shift || busy || closingLoading) return
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
    if (!selectedProfile || !shift || !preparedClosing || busy) return
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

  function beginPayment() {
    if (!lines.length) return
    if (!customer) return setMessage(t('pos.messages.selectCustomerToCharge'))
    setShowPayment(true)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  async function submitSale() {
    if (!selectedProfile || !shift) return setMessage(t('pos.messages.openShiftToCharge'))
    if (!customer) return setMessage(t('pos.messages.selectCustomerToCharge'))
    setBusy(true); setMessage('')
    try { const current = currentDateTime(); const payload = salesInvoicePayload({ profile: selectedProfile, customer, postingDate: current.date, postingTime: current.time, lines, payments, taxes: taxRows, posOpeningEntry: shift.name, invoiceMode }); const name = activeDraftName ?? (await client.createDocument<{ name: string }>(invoiceMode, payload)).name; if (activeDraftName) await client.updateDocument(invoiceMode, activeDraftName, payload); await client.submitDocument(invoiceMode, name); const confirmed = await client.getDocument<{ docstatus?: number }>(invoiceMode, name); if (confirmed.docstatus !== undefined && confirmed.docstatus !== 1) throw new Error(t('pos.messages.saleNotSubmitted', { name })); setLines([]); setPayments(paymentLines(paymentMethods)); setShowPayment(false); setActiveDraftName(null); if (!posPreferences.rememberCustomer) setCustomer(''); setMessage(t('pos.messages.saleConfirmed', { name })); setShowHistory(true); await drafts.refetch() } catch (error) { setMessage(error instanceof Error ? error.message : t('pos.messages.confirmSaleError')) } finally { setBusy(false) }
  }

  async function saveDraft() {
    if (!selectedProfile || !shift) return setMessage(t('pos.messages.openShiftToSave'))
    if (!customer) return setMessage(t('pos.messages.selectCustomerToSave'))
    if (!lines.length) return setMessage(t('pos.messages.addProductToSave'))
    setBusy(true); setMessage('')
    try { const current = currentDateTime(); const payload = draftInvoicePayload({ profile: selectedProfile, customer, postingDate: current.date, postingTime: current.time, lines, taxes: taxRows, posOpeningEntry: shift.name, invoiceMode }); const saved = activeDraftName ? { name: activeDraftName } : await client.createDocument<{ name: string }>(invoiceMode, payload); if (activeDraftName) await client.updateDocument(invoiceMode, activeDraftName, payload); setLines([]); setPayments(paymentLines(paymentMethods)); setShowPayment(false); setActiveDraftName(null); if (!posPreferences.rememberCustomer) setCustomer(''); setMessage(t('pos.messages.cartSaved', { name: saved.name })); setShowDrafts(false); await drafts.refetch() } catch (error) { setMessage(error instanceof Error ? error.message : t('pos.messages.saveCartError')) } finally { setBusy(false) }
  }

  async function resumeDraft(summary: PosDraftSummary) {
    if (lines.length) return setMessage(t('pos.messages.clearBeforeResume'))
    setBusy(true); setMessage('')
    try { const draft = await client.getDocument<PosDraftDocument>(invoiceMode, summary.name); if (!draft.items?.length) throw new Error(t('pos.messages.draftNoItems')); setLines(draftToCartLines(draft.items)); setCustomer(draft.customer || ''); setSearchCustomer(''); setPayments(paymentLines(paymentMethods)); setActiveDraftName(draft.name); setShowPayment(false); setShowDrafts(false); setMessage(t('pos.messages.draftLoaded', { name: draft.name })) } catch (error) { setMessage(error instanceof Error ? error.message : t('pos.messages.loadDraftError')) } finally { setBusy(false) }
  }

  async function deleteDraft(draft: PosDraftSummary) {
    setBusy(true); setMessage('')
    try { await client.deleteDocument(invoiceMode, draft.name); setMessage(t('pos.messages.draftDiscarded', { name: draft.name })); await drafts.refetch() } catch (error) { setMessage(error instanceof Error ? error.message : t('pos.messages.discardDraftError')) } finally { setBusy(false) }
  }

  async function returnSale(name: string) {
    if (!window.confirm(t('pos.messages.returnConfirm', { name }))) return
    setBusy(true); setMessage('')
    try { const invoice = await client.getDocument<{ name: string; customer: string; company: string; pos_profile?: string; items: Array<{ item_code: string; item_name?: string; qty: number; rate: number; uom?: string; warehouse?: string }> }>(invoiceMode, name); const created = await client.createDocument<{ name: string }>(invoiceMode, returnInvoicePayload({ ...invoice, doctype: invoiceMode })); await client.submitDocument(invoiceMode, created.name); setMessage(t('pos.messages.returnConfirmed', { name: created.name })); await history.refetch() } catch (error) { setMessage(error instanceof Error ? error.message : t('pos.messages.returnError')) } finally { setBusy(false) }
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
    return <BasePosClosingPanel {...props} open={showClosing} paymentMethods={closingPaymentMethods} summary={preparedSummary} busy={busy || closingLoading} error={closingError || (closingLoading ? t('pos.messages.closingLoading') : undefined)} onSubmit={props.onClose ?? closeShift} onOpenChange={setShowClosing} />
  }

  return <><section className="pos-workspace"><PageHeader title={t("posPage.title")} description={t("posPage.description")} status={<><span>{shift ? t("posPage.shiftStatus", { name: shift.name }) : t("posPage.noShift")}</span>{selectedProfile && <span>{selectedProfile.name} · {selectedProfile.company} · {selectedProfile.warehouse}</span>}{message && <span className="font-medium text-blue-700">{message}</span>}</>} /><div className="pos-toolbar card"><div className="pos-toolbar-main"><Field label={t("posPage.profileLabel")}><Select value={selectedProfile?.name ?? undefined} onValueChange={(value) => { setProfileName(value); setCustomer(posPreferences.defaultCustomer); setSearchCustomer('') }} disabled={Boolean(shift)}><SelectTrigger aria-label={t("posPage.profileLabel")} className="pos-shift-selector"><SelectValue placeholder={t("posPage.selectProfile")} /></SelectTrigger><SelectContent align="start">{(profiles.data ?? []).map((item) => <SelectItem value={item.name} key={item.name}>{item.name}</SelectItem>)}</SelectContent></Select></Field><PosCustomerPicker enabled={Boolean(shift)} value={selectedCustomer?.customer_name || customer} search={searchCustomer} customers={customers.data ?? []} onSearch={(value) => { setCustomer(""); setSearchCustomer(value) }} onSelect={(name) => { setCustomer(name); setSearchCustomer("") }} /></div><div className="pos-toolbar-actions">{!shift ? <Button onClick={openShift} disabled={busy || !selectedProfile || !paymentMethods.length || methods.isPending || openEntries.isPending}>{busy ? <><Spinner /> {t("posPage.opening")}</> : methods.isPending ? <><Spinner /> {t("posPage.loadingPayments")}</> : t("posPage.openShift")}</Button> : <Button variant="danger" onClick={prepareClose} disabled={busy}>{busy ? <><Spinner /> {t("posPage.closing")}</> : t("posPage.prepareClose")}</Button>}<Button variant="secondary" onClick={() => setShowHistory((current) => !current)} disabled={!shift}>{showHistory ? t("posPage.hideHistory") : t("posPage.history")}</Button><Button variant="secondary" onClick={() => setShowDrafts(true)} disabled={!shift}>{t("posPage.heldSales")}</Button><Button variant="secondary" onClick={() => navigate('/pos/cotizaciones?profile=' + encodeURIComponent(selectedProfile?.name ?? ''))}>{t("posPage.quotes")}</Button></div></div>{!profiles.isPending && !profiles.data?.length && <Notice>{t("posPage.noProfiles")}</Notice>}{methods.isError && <Notice>{methods.error instanceof Error ? methods.error.message : t("posPage.paymentMethodsError")}</Notice>}{!methods.isPending && !methods.data?.length && <Notice tone="warning">{t("posPage.paymentMethodsInvalid")}</Notice>}{(!methods.isPending && !paymentMethods.length) && <Notice tone="warning">{t("posPage.paymentMethodsMissing")}</Notice>}{posSettings.isError && <Notice tone="warning">{t("posPage.settingsFallback")}</Notice>}{!catalog.data && <Notice tone="warning">{t("posPage.catalogMissing")}</Notice>}{shift && <PosMobileTabs value={mobileView} count={cartCount} fixed={showMobileTabs} onChange={setMobileView} onOpenDrafts={() => setShowDrafts(true)} onOpenQuotations={() => navigate('/pos/cotizaciones?profile=' + encodeURIComponent(selectedProfile?.name ?? ''))} />}{showScrollTop && <button type="button" className="pos-scroll-top is-visible" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label={t("posPage.scrollTop")}>↑</button>}{cartFeedback && <div className="pos-cart-feedback" role="status" aria-live="polite">{cartFeedback.text}</div>}{shift && <div className="pos-layout"><div className={`pos-mobile-products ${mobileView === 'products' ? 'is-visible' : ''}`}><ProductPicker items={posItems} prices={prices.data?.prices ?? []} priceList={selectedProfile?.selling_price_list} currency={currency} lines={lines} variantsByTemplate={variantsByTemplate} autoFocus={posPreferences.autoFocusProductSearch} onAdd={addItem} onDecrease={decreaseItem} onOpenTemplate={openTemplate} /></div><div className={`pos-mobile-cart ${mobileView === 'cart' ? 'is-visible' : ''}`}><div className="pos-sale-column"><Cart lines={lines} taxRows={taxRows} currency={currency} canEditRate={canEditRate} onEditPrice={(index) => { setPriceLineIndex(index); setShowPriceSheet(true) }} onChange={(index, patch) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))} onRemove={(index) => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} />{showPayment && <Payments methods={paymentMethods} payments={payments} total={totals.total} currency={currency} onChange={updatePayment} />}<div className="pos-sale-actions">{showPayment ? <Button fullWidth onClick={submitSale} disabled={busy || !lines.length}>{busy ? <><Spinner /> {t("posPage.confirming")}</> : t("posPage.confirmCharge", { total: money(totals.total, currency) })}</Button> : <Button fullWidth onClick={beginPayment} disabled={busy || !lines.length}>{t("posPage.charge", { total: money(totals.total, currency) })}</Button>}<Button fullWidth onClick={saveDraft} disabled={busy || !lines.length}>{activeDraftName ? t("posPage.saveChanges") : t("posPage.saveCart")}</Button><Button fullWidth variant="secondary" onClick={() => { setLines([]); setPayments([]); setShowPayment(false); setActiveDraftName(null) }} disabled={!lines.length}>{t("posPage.cancelSale")}</Button></div></div></div></div>}{variantTemplate && <PosVariantSheet template={variantTemplate} variants={variantOptions} prices={prices.data?.prices ?? []} priceList={selectedProfile?.selling_price_list} currency={currency} open={Boolean(variantTemplate)} loading={variantLoading} error={variantError} onClose={closeTemplate} onAdd={(item, uom, rate) => { addConfiguredItem(item, uom, rate); closeTemplate() }} resolvePrice={resolvePosPrice} onMissingPrice={(item, uom) => setMissingPrice({ item, uom })} />}{showClosing && shift && <PosClosingPanel paymentMethods={paymentMethods} balances={closingBalances} busy={busy} onChange={setClosingBalances} onClose={closeShift} />}{showHistory && shift && <SaleHistory sales={history.data ?? []} loading={history.isPending} error={history.error instanceof Error ? history.error.message : undefined} currency={currency} onRefresh={() => history.refetch()} onReturn={returnSale} />}{!shift && selectedProfile && <section className="pos-opening card"><div className="pos-section-heading"><div><h2>{t("posPage.openingTitle")}</h2><span>{selectedProfile.company} · {selectedProfile.warehouse}</span></div><span>{t("posPage.openingFund")}</span></div><div className="pos-opening-lines">{paymentMethods.map((method) => <Field label={method.mode_of_payment} key={method.mode_of_payment}><Input type="number" min="0" step="0.01" value={openingBalances.find((line) => line.modeOfPayment === method.mode_of_payment)?.amount ?? 0} onChange={(event) => setOpeningBalances((current) => paymentMethods.map((candidate) => ({ modeOfPayment: candidate.mode_of_payment, amount: candidate.mode_of_payment === method.mode_of_payment ? Number(event.target.value) : current.find((line) => line.modeOfPayment === candidate.mode_of_payment)?.amount ?? 0 })))} /></Field>)}</div><p className="muted">{t("posPage.openingHelp")}</p></section>}</section>{shift && selectedProfile && <PosDraftsSheet drafts={drafts.data ?? []} open={showDrafts} loading={drafts.isPending || busy} error={drafts.error instanceof Error ? drafts.error.message : undefined} currency={currency} onOpenChange={setShowDrafts} onResume={resumeDraft} onDelete={deleteDraft} />}<PosPriceSheet line={priceLine} currency={currency} canEdit={canEditRate} open={showPriceSheet} onClose={() => setShowPriceSheet(false)} onApply={applyManualRate} /><PosMissingPriceDialog itemName={missingPrice?.item.item_name || missingPrice?.item.name || ''} uom={missingPrice?.uom.uom || ''} open={Boolean(missingPrice)} onOpenChange={(open) => { if (!open) setMissingPrice(null) }} onAddPrice={addMissingPrice} /></>
}
