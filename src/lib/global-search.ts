import { productSearchScore, searchScore, type ProductSearchable, type SearchMatch } from './search'

export type GlobalSearchKind = 'product' | 'price' | 'supplier' | 'customer' | 'order'

export type GlobalSearchEntry = {
  id: string
  title: string
  detail: string
  kind: GlobalSearchKind
  href: string
  match: (query: string) => SearchMatch | null
}

/** Products (and prices, through their product) use the catalog search: name, code, brand, tags, barcodes, attributes… */
export function productMatcher(product: ProductSearchable) {
  return (query: string) => productSearchScore(product, query)
}

export function textMatcher(title: string, detail: string) {
  return (query: string) => searchScore(query, [{ value: title, weight: 5 }, { value: detail, weight: 2 }])
}

export function rankGlobalSearch(entries: GlobalSearchEntry[], query: string, limit = 20) {
  if (!query.trim()) return entries.slice(0, limit)
  return entries
    .map((entry, index) => ({ entry, index, match: entry.match(query) }))
    .filter((ranked) => ranked.match)
    .sort((left, right) => (right.match?.score ?? 0) - (left.match?.score ?? 0) || left.index - right.index)
    .slice(0, limit)
    .map((ranked) => ranked.entry)
}
