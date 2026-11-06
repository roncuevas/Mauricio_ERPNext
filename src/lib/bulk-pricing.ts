import type { ItemPrice } from './types'

export type BulkPriceChange = { price: ItemPrice; nextRate: number }
export type BulkPriceCsvResult = { changes: BulkPriceChange[]; errors: string[] }

const csvHeaders = ['name', 'item_code', 'price_list', 'price_list_rate', 'currency', 'uom', 'buying', 'selling', 'customer', 'supplier', 'batch_no', 'packing_unit', 'valid_from', 'valid_upto', 'modified'] as const
const identityHeaders = ['item_code', 'price_list', 'currency', 'uom', 'buying', 'selling', 'customer', 'supplier', 'batch_no', 'packing_unit', 'valid_from', 'valid_upto', 'modified'] as const

function rateOf(price: ItemPrice) {
  const rate = Number(price.price_list_rate ?? 0)
  return Number.isFinite(rate) ? rate : 0
}

export function makeFixedPriceChanges(prices: ItemPrice[], rate: number): BulkPriceChange[] {
  return prices.filter((price) => rateOf(price) !== rate).map((price) => ({ price, nextRate: rate }))
}

export function makePercentagePriceChanges(prices: ItemPrice[], percent: number): BulkPriceChange[] {
  return prices.flatMap((price) => {
    const nextRate = rateOf(price) * (1 + percent / 100)
    return nextRate === rateOf(price) ? [] : [{ price, nextRate }]
  })
}

function detectDelimiter(source: string) {
  let quoted = false
  let comma = 0
  let semicolon = 0
  let tab = 0
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '"') {
      if (quoted && source[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && character === '\n') break
    else if (!quoted && character === ',') comma += 1
    else if (!quoted && character === ';') semicolon += 1
    else if (!quoted && character === '\t') tab += 1
  }
  return tab > comma && tab > semicolon ? '\t' : semicolon > comma ? ';' : ','
}

function parseRows(source: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index += 1 }
      else quoted = !quoted
    } else if (!quoted && character === delimiter) { row.push(cell); cell = '' }
    else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += character
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.')
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function decodeSpreadsheetText(value: string) {
  const text = value.trim()
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text
}

function normalizeIdentity(value: unknown, field: (typeof identityHeaders)[number]) {
  if (field === 'buying' || field === 'selling') {
    if (value === true || value === 1 || value === '1' || value === 'true') return '1'
    if (value === false || value === 0 || value === '0' || value === 'false' || value == null) return '0'
  }
  return String(value ?? '').trim()
}

function parseRate(source: string) {
  let normalized = source.trim().replace(/\s/g, '')
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.') ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '')
  } else normalized = normalized.replace(',', '.')
  const rate = Number(normalized)
  return Number.isFinite(rate) && rate >= 0 ? rate : null
}

export function parseBulkPriceCsv(source: string, prices: ItemPrice[]): BulkPriceCsvResult {
  let rows: string[][]
  try { rows = parseRows(source.replace(/^\uFEFF/, ''), detectDelimiter(source)) }
  catch (error) { return { changes: [], errors: [error instanceof Error ? error.message : 'CSV could not be read.'] } }
  if (rows.length < 2) return { changes: [], errors: ['CSV must include a header and at least one price row.'] }
  const headers = rows[0].map((header) => header.trim())
  const errors: string[] = []
  if (new Set(headers).size !== headers.length) errors.push('CSV has duplicate column names.')
  for (const required of ['name', 'price_list_rate']) if (!headers.includes(required)) errors.push(`CSV is missing required column: ${required}.`)
  for (const header of headers) if (!(csvHeaders as readonly string[]).includes(header)) errors.push(`CSV has an unsupported column: ${header}.`)
  if (errors.length) return { changes: [], errors }

  const byName = new Map(prices.map((price) => [price.name, price]))
  const seen = new Set<string>()
  const changes: BulkPriceChange[] = []
  rows.slice(1).forEach((values, index) => {
    const rowNumber = index + 2
    if (values.length !== headers.length) { errors.push(`Row ${rowNumber} has ${values.length} values; expected ${headers.length}.`); return }
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column]]))
    const name = decodeSpreadsheetText(row.name ?? '')
    const price = byName.get(name)
    if (!name || !price) { errors.push(`Row ${rowNumber}: Item Price “${name || '—'}” is not in the current cache.`); return }
    if (seen.has(name)) { errors.push(`Row ${rowNumber}: Item Price “${name}” appears more than once.`); return }
    seen.add(name)
    const nextRate = parseRate(row.price_list_rate ?? '')
    if (nextRate === null) { errors.push(`Row ${rowNumber}: price_list_rate must be a valid non-negative number.`); return }
    for (const field of identityHeaders) {
      if (field === 'modified' && !String(row[field] ?? '').trim()) continue
      if (headers.includes(field) && normalizeIdentity(decodeSpreadsheetText(row[field] ?? ''), field) !== normalizeIdentity(price[field], field)) {
        errors.push(`Row ${rowNumber}: ${field} does not match cached Item Price “${name}”.`)
        return
      }
    }
    if (rateOf(price) !== nextRate) changes.push({ price, nextRate })
  })
  return { changes: errors.length ? [] : changes, errors }
}

function csvText(value: unknown) {
  let text = String(value ?? '')
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function exportBulkPriceCsv(prices: ItemPrice[]) {
  const rows = [csvHeaders.join(',')]
  for (const price of prices) rows.push(csvHeaders.map((header) => csvText(header === 'price_list_rate' ? rateOf(price) : header === 'buying' || header === 'selling' ? normalizeIdentity(price[header], header) : price[header])).join(','))
  return `${rows.join('\r\n')}\r\n`
}

export function bulkPriceSnapshotMatches(expected: ItemPrice, current: ItemPrice) {
  if (expected.modified && expected.modified !== current.modified) return false
  if (rateOf(expected) !== rateOf(current)) return false
  return identityHeaders.filter((field) => field !== 'modified').every((field) => normalizeIdentity(expected[field], field) === normalizeIdentity(current[field], field))
}
