import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandSearchInput, CommandList } from './ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { GlobalSearchContext } from './global-search-context'
import { readItemCatalog } from '../lib/item-cache'
import { readItemPriceCatalog } from '../lib/price-cache'
import { readCustomerCatalog, readSalesOrderCatalog } from '../lib/sales-order-cache'
import { readSupplierCatalog } from '../lib/supplier-cache'
import { productMatcher, rankGlobalSearch, textMatcher, type GlobalSearchEntry } from '../lib/global-search'

export function GlobalSearch({ profileId, children }: { profileId: string; children: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<GlobalSearchEntry[]>([])

  function openSearch() {
    setOpen(true)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(true) }
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)) { event.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void Promise.all([readItemCatalog(profileId), readItemPriceCatalog(profileId), readSupplierCatalog(profileId), readCustomerCatalog(profileId), readSalesOrderCatalog(profileId)]).then(([items, prices, suppliers, customers, orders]) => {
      if (cancelled) return
      const next: GlobalSearchEntry[] = []
      const text = (entry: Omit<GlobalSearchEntry, 'match'>): GlobalSearchEntry => ({ ...entry, match: textMatcher(entry.title, entry.detail) })
      const itemsByCode = new Map(items?.items.map((item) => [item.name, item]))
      items?.items.forEach((item) => next.push({ id: `item-${item.name}`, title: item.item_name || item.name, detail: `${item.item_code || item.name} · ${t('globalSearch.products')}`, kind: 'product', href: `/items?search=${encodeURIComponent(search.trim() || item.item_name || item.name)}`, match: productMatcher(item) }))
      prices?.prices.forEach((price) => {
        const code = price.item_code || price.name
        const item = price.item_code ? itemsByCode.get(price.item_code) : undefined
        const entry = { id: `price-${price.name}`, title: item?.item_name || code, detail: `${code} · ${price.price_list || t('globalSearch.price')} · ${t('globalSearch.prices')}`, kind: 'price' as const, href: `/prices/manage/${encodeURIComponent(code)}` }
        next.push(item ? { ...entry, match: productMatcher(item) } : text(entry))
      })
      suppliers?.suppliers.forEach((supplier) => next.push(text({ id: `supplier-${supplier.name}`, title: supplier.supplier_name || supplier.name, detail: `${supplier.name} · ${t('globalSearch.suppliers')}`, kind: 'supplier', href: '/suppliers' })))
      customers?.customers.forEach((customer) => next.push(text({ id: `customer-${customer.name}`, title: customer.customer_name || customer.name, detail: `${customer.name} · ${t('globalSearch.customers')}`, kind: 'customer', href: `/pos/ventas` })))
      orders?.buckets.flatMap((bucket) => bucket.salesOrders).forEach((order) => next.push(text({ id: `order-${order.name}`, title: order.name, detail: `${order.customer_name || order.customer || t('globalSearch.unknownCustomer')} · ${t('globalSearch.sales')}`, kind: 'order', href: `/pos/ventas/${encodeURIComponent(order.name)}/editar` })))
      setResults(next)
    })
    return () => { cancelled = true }
  }, [open, profileId, t])

  const filtered = useMemo(() => rankGlobalSearch(results, search), [results, search])

  function select(result: GlobalSearchEntry) {
    setOpen(false)
    navigate(result.href)
  }

  return <GlobalSearchContext.Provider value={openSearch}>
    {children}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="global-search-dialog"><DialogHeader><DialogTitle>{t('globalSearch.title')}</DialogTitle><DialogDescription>{t('globalSearch.description')}</DialogDescription></DialogHeader><Command shouldFilter={false}><CommandSearchInput value={search} onValueChange={setSearch} onClear={() => setSearch('')} placeholder={t('globalSearch.placeholder')} autoFocus /><CommandList><CommandEmpty>{results.length ? t('globalSearch.noResults') : t('globalSearch.noCache')}</CommandEmpty><CommandGroup>{filtered.map((result) => <CommandItem key={result.id} value={result.id} onSelect={() => select(result)}><span className="min-w-0"><strong className="block [overflow-wrap:anywhere]">{result.title}</strong><small className="muted block [overflow-wrap:anywhere]">{result.detail}</small></span></CommandItem>)}</CommandGroup></CommandList></Command></DialogContent></Dialog>
  </GlobalSearchContext.Provider>
}
