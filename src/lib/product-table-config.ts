export const PRODUCT_TABLE_CONFIG_VERSION = 1
export const PRODUCT_TABLE_CONFIG_KEY_PREFIX = 'mauricio-erpnext:product-table-config:v1:'

export const PRODUCT_TABLE_COLUMN_IDS = ['product', 'group', 'brand', 'stockUom', 'salesUom', 'purchaseUom', 'weight', 'variants', 'barcode', 'purchasePrice', 'salePrice', 'margin', 'status', 'actions'] as const
export type ProductTableColumnId = typeof PRODUCT_TABLE_COLUMN_IDS[number]

export type ProductTableConfig = {
  version: typeof PRODUCT_TABLE_CONFIG_VERSION
  visibleIds: ProductTableColumnId[]
  widths: Partial<Record<ProductTableColumnId, number>>
}

export const PRODUCT_TABLE_DEFAULT_VISIBLE_IDS: ProductTableColumnId[] = ['product', 'group', 'stockUom', 'status', 'actions']

export const PRODUCT_TABLE_INITIAL_WIDTHS: Record<ProductTableColumnId, number> = {
  product: 280,
  group: 170,
  brand: 140,
  stockUom: 130,
  salesUom: 150,
  purchaseUom: 160,
  weight: 120,
  variants: 110,
  barcode: 150,
  purchasePrice: 150,
  salePrice: 150,
  margin: 150,
  status: 130,
  actions: 190,
}

export const PRODUCT_TABLE_WIDTH_LIMITS: Record<ProductTableColumnId, { min: number; max: number }> = {
  product: { min: 220, max: 480 }, group: { min: 130, max: 280 }, brand: { min: 110, max: 240 }, stockUom: { min: 110, max: 220 },
  salesUom: { min: 130, max: 260 }, purchaseUom: { min: 140, max: 280 }, weight: { min: 100, max: 220 }, variants: { min: 100, max: 180 },
  barcode: { min: 130, max: 280 }, purchasePrice: { min: 130, max: 240 }, salePrice: { min: 130, max: 240 }, margin: { min: 140, max: 260 },
  status: { min: 115, max: 200 }, actions: { min: 175, max: 230 },
}

export function clampProductTableWidth(id: ProductTableColumnId, value: number) {
  const limits = PRODUCT_TABLE_WIDTH_LIMITS[id]
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)))
}

export function defaultProductTableConfig(): ProductTableConfig {
  return { version: PRODUCT_TABLE_CONFIG_VERSION, visibleIds: [...PRODUCT_TABLE_DEFAULT_VISIBLE_IDS], widths: { ...PRODUCT_TABLE_INITIAL_WIDTHS } }
}

export function normalizeProductTableConfig(value: unknown): ProductTableConfig {
  const fallback = defaultProductTableConfig()
  if (!value || typeof value !== 'object') return fallback
  const candidate = value as { version?: unknown; visibleIds?: unknown; widths?: unknown }
  if (candidate.version !== PRODUCT_TABLE_CONFIG_VERSION) return fallback
  const visibleIds = Array.isArray(candidate.visibleIds) ? candidate.visibleIds.filter((id): id is ProductTableColumnId => typeof id === 'string' && PRODUCT_TABLE_COLUMN_IDS.includes(id as ProductTableColumnId)) : []
  const uniqueVisibleIds = Array.from(new Set(visibleIds))
  for (const required of ['product', 'actions'] as const) if (!uniqueVisibleIds.includes(required)) uniqueVisibleIds.push(required)
  const rawWidths = candidate.widths && typeof candidate.widths === 'object' ? candidate.widths as Record<string, unknown> : {}
  const widths = { ...fallback.widths }
  for (const id of PRODUCT_TABLE_COLUMN_IDS) if (typeof rawWidths[id] === 'number' && Number.isFinite(rawWidths[id])) widths[id] = clampProductTableWidth(id, rawWidths[id])
  return { version: PRODUCT_TABLE_CONFIG_VERSION, visibleIds: uniqueVisibleIds, widths }
}

export function readProductTableConfig(profileId: string): ProductTableConfig {
  try { return normalizeProductTableConfig(JSON.parse(localStorage.getItem(`${PRODUCT_TABLE_CONFIG_KEY_PREFIX}${profileId}`) ?? 'null')) } catch { return defaultProductTableConfig() }
}

export function writeProductTableConfig(profileId: string, value: ProductTableConfig) {
  const normalized = normalizeProductTableConfig(value)
  localStorage.setItem(`${PRODUCT_TABLE_CONFIG_KEY_PREFIX}${profileId}`, JSON.stringify(normalized))
  return normalized
}
