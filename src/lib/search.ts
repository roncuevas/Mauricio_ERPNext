function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

function distance(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[right.length]
}

function valuesOf(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap(valuesOf)
  if (typeof value === 'object') return Object.values(value).flatMap(valuesOf)
  return [String(value)]
}

export type SearchField = {
  value: unknown
  weight?: number
}

export type SearchMatch = {
  score: number
  matchedFields: number[]
}

export type ProductSearchable = {
  name?: unknown
  item_name?: unknown
  item_code?: unknown
  brand?: unknown
  item_group?: unknown
  tags?: unknown
  barcodes?: unknown
  barcode?: unknown
  sku?: unknown
  stock_uom?: unknown
  sales_uom?: unknown
  variant_of?: unknown
  attributes?: unknown
  uoms?: unknown
}

function tokensOf(value: unknown) {
  return valuesOf(value).flatMap((entry) => normalize(entry).split(/[^a-z0-9]+/).filter(Boolean))
}

function scoreToken(token: string, field: SearchField) {
  const weight = field.weight ?? 1
  const values = valuesOf(field.value).map(normalize)
  const candidates = values.flatMap((value) => value.split(/[^a-z0-9]+/).filter(Boolean))
  let best = 0
  for (const value of values) {
    if (value === token) best = Math.max(best, 120 * weight)
    else if (value.includes(token)) best = Math.max(best, 82 * weight)
  }
  for (const candidate of candidates) {
    if (candidate === token) best = Math.max(best, 100 * weight)
    else if (candidate.startsWith(token)) best = Math.max(best, 70 * weight)
    else if (candidate.includes(token) || token.includes(candidate)) best = Math.max(best, 42 * weight)
    else if (token.length >= 4 && distance(token, candidate) <= Math.max(1, Math.floor(token.length / 5))) best = Math.max(best, 18 * weight)
  }
  return best
}

export function searchScore(query: string, fields: SearchField[]): SearchMatch | null {
  const queryTokens = normalize(query).split(/[^a-z0-9]+/).filter(Boolean)
  if (!queryTokens.length) return { score: 0, matchedFields: [] }
  const normalizedQuery = normalize(query).trim()
  let score = 0
  const matchedFields = new Set<number>()
  for (const token of queryTokens) {
    let best = 0
    let bestField = -1
    fields.forEach((field, index) => {
      const candidateScore = scoreToken(token, field)
      if (candidateScore > best) { best = candidateScore; bestField = index }
    })
    if (!best) return null
    score += best
    if (bestField >= 0) matchedFields.add(bestField)
  }
  fields.forEach((field, index) => {
    if (valuesOf(field.value).some((value) => normalize(value).includes(normalizedQuery))) score += 300 * (field.weight ?? 1)
    if (tokensOf(field.value).length === queryTokens.length && queryTokens.every((token) => tokensOf(field.value).includes(token))) score += 90 * (field.weight ?? 1)
    if (scoreToken(queryTokens[0], field) > 0 && matchedFields.has(index)) matchedFields.add(index)
  })
  return { score, matchedFields: Array.from(matchedFields) }
}

export function productSearchScore(item: ProductSearchable, query: string) {
  return searchScore(query, [
    { value: item.item_name, weight: 5 },
    { value: item.name, weight: 5 },
    { value: item.item_code, weight: 5 },
    { value: item.brand, weight: 3 },
    { value: item.item_group, weight: 2 },
    { value: item.tags, weight: 4 },
    { value: item.barcodes, weight: 4 },
    { value: item.barcode, weight: 4 },
    { value: item.sku, weight: 4 },
    { value: item.stock_uom, weight: 1 },
    { value: item.sales_uom, weight: 1 },
    { value: item.variant_of, weight: 3 },
    { value: item.attributes, weight: 2 },
    { value: item.uoms, weight: 1 },
  ])
}

export function rankProductSearch<T>(items: T[], query: string, getProduct: (item: T) => ProductSearchable = (item) => item as ProductSearchable) {
  return items.map((item, index) => ({ item, index, match: productSearchScore(getProduct(item), query) }))
    .filter((entry) => entry.match)
    .sort((left, right) => (right.match?.score ?? 0) - (left.match?.score ?? 0) || left.index - right.index)
    .map((entry) => entry.item)
}

export function fuzzyMatch(query: string, values: unknown[]) {
  return searchScore(query, values.map((value) => ({ value, weight: 1 }))) !== null
}
