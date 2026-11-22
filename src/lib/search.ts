function normalize(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase()
}

function splitTokens(value: string) {
  return value.split(/[^a-z0-9]+/).filter(Boolean)
}

/** Levenshtein distance, giving up early once it exceeds `limit`. */
function distance(left: string, right: string, limit: number) {
  if (Math.abs(left.length - right.length) > limit) return limit + 1
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]
    row[0] = i
    let rowMin = row[0]
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1))
      diagonal = above
      rowMin = Math.min(rowMin, row[j])
    }
    if (rowMin > limit) return limit + 1
  }
  return row[right.length]
}

function valuesOf(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap(valuesOf)
  if (typeof value === 'object') return Object.values(value).flatMap(valuesOf)
  return [String(value)]
}

/** Values of one key from child rows (e.g. `uom` from UOM rows), or the value itself when it is already plain. */
function pick(value: unknown, key: string): unknown {
  if (!Array.isArray(value)) return value
  return value.map((entry) => entry && typeof entry === 'object' && key in entry ? (entry as Record<string, unknown>)[key] : entry)
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

type PreparedField = { weight: number; values: string[]; tokens: string[]; tokenSet: Set<string> }

function prepareField(field: SearchField): PreparedField {
  const values = valuesOf(field.value).map(normalize)
  const tokens = values.flatMap(splitTokens)
  return { weight: field.weight ?? 1, values, tokens, tokenSet: new Set(tokens) }
}

const hasDigit = /\d/

function scoreToken(token: string, field: PreparedField) {
  let best = 0
  for (const value of field.values) {
    if (value === token) best = Math.max(best, 120)
    else if (token.length >= 3 && value.includes(token)) best = Math.max(best, 82)
  }
  // Typos are tolerated only in words: codes, barcodes and sizes must match exactly or as a prefix.
  const typoLimit = token.length >= 4 && !hasDigit.test(token) ? Math.max(1, Math.floor(token.length / 5)) : 0
  for (const candidate of field.tokens) {
    if (candidate === token) best = Math.max(best, 100)
    else if (candidate.startsWith(token)) best = Math.max(best, 70)
    else if (token.length >= 3 && candidate.includes(token)) best = Math.max(best, 42)
    // Plurals and suffixes ("arenas" → "arena"), never short words inside the query ("verde" → "de").
    else if (candidate.length >= 4 && token.startsWith(candidate) && token.length - candidate.length <= 2) best = Math.max(best, 42)
    else if (typoLimit && !hasDigit.test(candidate) && distance(token, candidate, typoLimit) <= typoLimit) best = Math.max(best, 18)
    if (best >= 120) break
  }
  return best * field.weight
}

function scorePrepared(query: string, fields: PreparedField[]): SearchMatch | null {
  const normalizedQuery = normalize(query).trim()
  const queryTokens = splitTokens(normalizedQuery)
  if (!queryTokens.length) return { score: 0, matchedFields: [] }
  let score = 0
  const matchedFields = new Set<number>()
  // Every query word must match some field; each word counts its best field.
  for (const token of queryTokens) {
    let best = 0
    let bestField = -1
    fields.forEach((field, index) => {
      const candidateScore = scoreToken(token, field)
      if (candidateScore > best) { best = candidateScore; bestField = index }
    })
    if (!best) return null
    score += best
    matchedFields.add(bestField)
  }
  // Bonuses: the whole query inside one field, and a field made of exactly the query words.
  fields.forEach((field) => {
    if (field.values.some((value) => value.includes(normalizedQuery))) score += 300 * field.weight
    if (field.tokens.length === queryTokens.length && queryTokens.every((token) => field.tokenSet.has(token))) score += 90 * field.weight
  })
  return { score, matchedFields: Array.from(matchedFields) }
}

export function searchScore(query: string, fields: SearchField[]): SearchMatch | null {
  return scorePrepared(query, fields.map(prepareField))
}

function productFields(item: ProductSearchable): SearchField[] {
  return [
    { value: item.item_name, weight: 5 },
    { value: item.name, weight: 5 },
    { value: item.item_code, weight: 5 },
    { value: item.brand, weight: 3 },
    { value: item.item_group, weight: 2 },
    { value: item.tags, weight: 4 },
    { value: pick(item.barcodes, 'barcode'), weight: 4 },
    { value: item.barcode, weight: 4 },
    { value: item.sku, weight: 4 },
    { value: item.stock_uom, weight: 1 },
    { value: item.sales_uom, weight: 1 },
    { value: item.variant_of, weight: 3 },
    { value: item.attributes, weight: 2 },
    // Unit names only: conversion factors would make "20" match every item sold by the 20.
    { value: pick(item.uoms, 'uom'), weight: 1 },
  ]
}

// Cached catalog objects are searched on every keystroke or submit; normalize each one once.
const preparedProducts = new WeakMap<object, PreparedField[]>()

function preparedProduct(item: ProductSearchable) {
  let prepared = preparedProducts.get(item)
  if (!prepared) { prepared = productFields(item).map(prepareField); preparedProducts.set(item, prepared) }
  return prepared
}

export function productSearchScore(item: ProductSearchable, query: string) {
  return scorePrepared(query, preparedProduct(item))
}

export function rankProductSearch<T>(items: T[], query: string, getProduct: (item: T) => ProductSearchable = (item) => item as ProductSearchable) {
  if (!query.trim()) return items
  return items.map((item, index) => ({ item, index, match: productSearchScore(getProduct(item), query) }))
    .filter((entry) => entry.match)
    .sort((left, right) => (right.match?.score ?? 0) - (left.match?.score ?? 0) || left.index - right.index)
    .map((entry) => entry.item)
}

export function fuzzyMatch(query: string, values: unknown[]) {
  return searchScore(query, values.map((value) => ({ value, weight: 1 }))) !== null
}
