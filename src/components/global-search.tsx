import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { Button } from './ui'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { readItemCatalog } from '../lib/item-cache'
import { readItemPriceCatalog } from '../lib/price-cache'
import { readCustomerCatalog, readSalesOrderCatalog } from '../lib/sales-order-cache'

type SearchResult = { id: string; title: string; detail: string; kind: string; href: string }

export function GlobalSearch({ profileId }: { profileId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])

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
    void Promise.all([readItemCatalog(profileId), readItemPriceCatalog(profileId), readCustomerCatalog(profileId), readSalesOrderCatalog(profileId)]).then(([items, prices, customers, orders]) => {
      if (cancelled) return
      const next: SearchResult[] = []
      items?.items.forEach((item) => next.push({ id: `item-${item.name}`, title: item.item_name || item.name, detail: `${item.item_code || item.name} · ${t('globalSearch.products')}`, kind: 'product', href: `/items/${encodeURIComponent(item.name)}` }))
      prices?.prices.forEach((price) => next.push({ id: `price-${price.name}`, title: price.item_code || price.name, detail: `${price.price_list || t('globalSearch.price')} · ${t('globalSearch.prices')}`, kind: 'price', href: `/prices/manage/${encodeURIComponent(price.item_code || price.name)}` }))
      customers?.customers.forEach((customer) => next.push({ id: `customer-${customer.name}`, title: customer.customer_name || customer.name, detail: `${customer.name} · ${t('globalSearch.customers')}`, kind: 'customer', href: `/pos/ventas` }))
      orders?.buckets.flatMap((bucket) => bucket.salesOrders).forEach((order) => next.push({ id: `order-${order.name}`, title: order.name, detail: `${order.customer_name || order.customer || t('globalSearch.unknownCustomer')} · ${t('globalSearch.sales')}`, kind: 'order', href: `/pos/ventas/${encodeURIComponent(order.name)}/editar` }))
      setResults(next)
    })
    return () => { cancelled = true }
  }, [open, profileId, t])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return results.slice(0, 20)
    return results.filter((result) => `${result.title} ${result.detail}`.toLocaleLowerCase().includes(query)).slice(0, 20)
  }, [results, search])

  function select(result: SearchResult) {
    setOpen(false)
    setSearch('')
    navigate(result.href)
  }

  return <>
    <Button type="button" variant="secondary" className="global-search-trigger" onClick={() => setOpen(true)}><Search className="h-4 w-4" aria-hidden="true" />{t('globalSearch.open')}<kbd>{t('globalSearch.shortcut')}</kbd></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="global-search-dialog"><DialogHeader><DialogTitle>{t('globalSearch.title')}</DialogTitle><DialogDescription>{t('globalSearch.description')}</DialogDescription></DialogHeader><Command shouldFilter={false}><CommandInput value={search} onValueChange={setSearch} placeholder={t('globalSearch.placeholder')} autoFocus /><CommandList><CommandEmpty>{results.length ? t('globalSearch.noResults') : t('globalSearch.noCache')}</CommandEmpty><CommandGroup>{filtered.map((result) => <CommandItem key={result.id} value={result.id} onSelect={() => select(result)}><span className="min-w-0"><strong className="block truncate">{result.title}</strong><small className="muted block truncate">{result.detail}</small></span></CommandItem>)}</CommandGroup></CommandList></Command></DialogContent></Dialog>
  </>
}
