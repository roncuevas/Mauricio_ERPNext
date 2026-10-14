export type ConnectionProfile = {
  id: string
  label: string
  baseUrl: string
  apiKey: string
  apiSecret: string
}

export type StoredProfile = {
  version: 1
  id: string
  label: string
  baseUrl: string
  salt: string
  iv: string
  ciphertext: string
}

export type ListOptions = {
  fields?: string[]
  filters?: Array<[string, string, unknown]>
  orderBy?: string
  start?: number
  pageLength?: number
}

export type ListResult<T> = { data: T[]; total?: number }

export type CachedItem = {
  name: string
  item_name?: string
  item_group?: string
  stock_uom?: string
  sales_uom?: string
  purchase_uom?: string
  uoms?: ItemUom[]
  disabled?: number | boolean
  [key: string]: unknown
}

export type ItemCatalogCache = {
  profileId: string
  updatedAt: string
  locallyModified?: boolean
  items: CachedItem[]
}

export type UomCatalogCache = {
  profileId: string
  updatedAt: string
  uoms: string[]
}

export type ItemPrice = {
  name: string
  item_code?: string
  price_list?: string
  price_list_rate?: number
  buying?: number | boolean
  selling?: number | boolean
  uom?: string
  currency?: string
  customer?: string
  supplier?: string
  valid_from?: string
  valid_upto?: string
}

export type ItemPriceCatalogCache = {
  profileId: string
  updatedAt: string
  locallyModified?: boolean
  prices: ItemPrice[]
}

export type PriceList = {
  name: string
  selling?: number | boolean
  buying?: number | boolean
  enabled?: number | boolean
}

export type Supplier = {
  name: string
  supplier_name?: string
  supplier_group?: string
  supplier_type?: string
  country?: string
  disabled?: number | boolean
}

export type SupplierCatalogCache = {
  profileId: string
  updatedAt: string
  suppliers: Supplier[]
}

export type DocTypeCatalogCache = {
  profileId: string
  updatedAt: string
  locallyModified?: boolean
  doctypes: Array<{ name: string }>
}

export type VariantItem = {
  name: string
  item_name?: string
  brand?: string
  item_group?: string
  stock_uom?: string
  variant_of?: string
  has_variants?: number | boolean
  disabled?: number | boolean
  uoms?: ItemUom[]
  attributes?: VariantAttribute[]
}

export type VariantAttribute = {
  attribute: string
  attribute_value?: string
  values?: string[]
}

export type ItemUom = {
  uom: string
  conversion_factor: number
}

export type VariantCatalogCache = {
  profileId: string
  updatedAt: string
  locallyModified?: boolean
  items: VariantItem[]
}

export type DocTypeField = {
  fieldname: string
  label?: string
  fieldtype?: string
  reqd?: boolean | number
  read_only?: boolean | number
  options?: string
  hidden?: boolean | number
}

export type DocTypeMeta = { name: string; fields: DocTypeField[]; is_single?: boolean | number; issingle?: boolean | number; istable?: boolean | number }
