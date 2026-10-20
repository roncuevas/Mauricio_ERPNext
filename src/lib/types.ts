export type ConnectionProfile = {
  id: string
  label: string
  baseUrl: string
  apiKey: string
  apiSecret: string
}

export type ErpNextUserRole = {
  role?: string
}

export type ErpNextUserProfile = {
  name: string
  full_name?: string
  first_name?: string
  last_name?: string
  email?: string
  username?: string
  user_type?: string
  enabled?: number | boolean
  mobile_no?: string
  phone?: string
  language?: string
  time_zone?: string
  last_login?: string
  last_active?: string
  creation?: string
  roles?: ErpNextUserRole[]
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
  item_code?: string
  item_name?: string
  brand?: string
  item_group?: string
  stock_uom?: string
  sales_uom?: string
  purchase_uom?: string
  weight_per_unit?: number
  weight_uom?: string
  variant_of?: string
  has_variants?: number | boolean
  attributes?: VariantAttribute[]
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
  modified?: string
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
  item_code?: string
  item_name?: string
  brand?: string
  item_group?: string
  stock_uom?: string
  sales_uom?: string
  weight_per_unit?: number
  weight_uom?: string
  variant_of?: string
  has_variants?: number | boolean
  disabled?: number | boolean
  is_stock_item?: number | boolean
  has_serial_no?: number | boolean
  has_batch_no?: number | boolean
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

export type Company = {
  name: string
  company_name?: string
  abbr?: string
  default_currency?: string
}

export type Warehouse = {
  name: string
  warehouse_name?: string
  parent_warehouse?: string
  company?: string
  warehouse_type?: string
  is_group?: number | boolean
  disabled?: number | boolean
}

export type StockBin = {
  name?: string
  item_code: string
  warehouse: string
  actual_qty?: number
  reserved_qty?: number
  ordered_qty?: number
  projected_qty?: number
  valuation_rate?: number
  stock_value?: number
}

export type StockCache = {
  profileId: string
  updatedAt: string
  companies: Company[]
  warehouses: Warehouse[]
  bins: StockBin[]
  items?: VariantItem[]
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

export type PosProfile = {
  name: string
  company?: string
  warehouse?: string
  currency?: string
  selling_price_list?: string
  customer?: string
  write_off_account?: string
  write_off_cost_center?: string
  taxes_and_charges?: string
  tax_category?: string
  allow_rate_change?: number | boolean
  allow_user_to_edit_rate?: number | boolean
  disabled?: number | boolean
  applicable_for_users?: Array<{ user?: string }>
  payments?: PosPaymentMethod[]
}

export type CustomerSummary = {
  name: string
  customer_name?: string
  customer_group?: string
  territory?: string
  default_price_list?: string
  default_currency?: string
  disabled?: number | boolean
}

export type CustomerCatalogCache = {
  profileId: string
  updatedAt: string
  customers: CustomerSummary[]
}

export type SalesOrderItem = {
  name?: string
  item_code: string
  item_name?: string
  description?: string
  uom?: string
  stock_uom?: string
  conversion_factor?: number
  qty: number
  rate: number
  price_list_rate?: number
  discount_percentage?: number
  warehouse?: string
  amount?: number
}

export type SalesOrderSummary = {
  name: string
  customer: string
  customer_name?: string
  company: string
  transaction_date: string
  delivery_date?: string
  status?: string
  docstatus?: number
  currency?: string
  selling_price_list?: string
  grand_total?: number
  total?: number
  modified?: string
  items?: SalesOrderItem[]
}

export type SalesOrderCatalogCache = {
  profileId: string
  schemaVersion: 2
  updatedAt: string
  buckets: SalesOrderCacheBucket[]
}

export type SalesOrderCacheBucket = {
  company: string
  date: string
  updatedAt: string
  salesOrders: SalesOrderSummary[]
  error?: string
}

export type SalesOrderFormState = {
  name?: string
  docstatus?: number
  customer: string
  transaction_date: string
  delivery_date: string
  company: string
  currency: string
  selling_price_list: string
  set_warehouse: string
  items: SalesOrderItem[]
}

export type PosOpeningEntry = {
  name: string
  user?: string
  pos_profile?: string
  company?: string
  status?: string
  period_start_date?: string
  period_end_date?: string
  posting_date?: string
  pos_closing_entry?: string
  docstatus?: number
  balance_details?: Array<{ mode_of_payment?: string; opening_amount?: number }>
}

export type PosTaxRow = {
  charge_type?: 'Actual' | 'On Net Total' | 'On Previous Row Amount' | 'On Previous Row Total' | 'On Item Quantity' | string
  account_head?: string
  description?: string
  rate?: number
  tax_amount?: number
  row_id?: string
  reference_row?: number | string
  included_in_print_rate?: number | boolean | string
  add_deduct_tax?: 'Add' | 'Deduct' | string
  category?: string
}

export type PosTaxTemplate = {
  name: string
  company?: string
  title?: string
  taxes?: PosTaxRow[]
}

export type PosPaymentMethod = {
  mode_of_payment: string
  default?: number | boolean
  opening_amount?: number
  account?: string
  allow_in_returns?: number | boolean
}

export type PosCartLine = {
  itemCode: string
  itemName: string
  qty: number
  rate: number
  price_list_rate?: number
  uom?: string
  stockUom?: string
  conversionFactor?: number
  weightPerUnit?: number
  weightUom?: string
  warehouse?: string
  discountPercentage?: number
  priceListRate?: number
  rateOverride?: boolean
}

export type PosPaymentLine = {
  modeOfPayment: string
  amount: number
}

export type PosSaleSummary = {
  name: string
  doctype?: 'Sales Invoice' | 'POS Invoice'
  customer?: string
  postingDate?: string
  grandTotal?: number
  grand_total?: number
  status?: string
}

export type PosDraftSummary = {
  name: string
  customer?: string
  grand_total?: number
  modified?: string
  posting_date?: string
  docstatus?: number
}

export type PosDraftItem = {
  item_code: string
  item_name?: string
  qty: number
  rate: number
  uom?: string
  stock_uom?: string
  conversion_factor?: number
  weight_per_unit?: number
  weight_uom?: string
  warehouse?: string
  discount_percentage?: number
}

export type PosDraftDocument = PosDraftSummary & {
  company: string
  pos_profile?: string
  items: PosDraftItem[]
}

export type QuotationStatus = 'Draft' | 'Open' | 'Replied' | 'Partially Ordered' | 'Ordered' | 'Lost' | 'Cancelled' | 'Expired'

export type QuotationSummary = {
  name: string
  docstatus?: number
  quotation_to?: string
  party_name?: string
  customer_name?: string
  company?: string
  transaction_date?: string
  delivery_date?: string
  valid_till?: string
  status?: QuotationStatus | string
  currency?: string
  grand_total?: number
  modified?: string
  amended_from?: string
  total_qty?: number
  total?: number
  net_total?: number
  total_taxes_and_charges?: number
  discount_amount?: number
  additional_discount_percentage?: number
  additional_discount_amount?: number
  apply_discount_on?: string
}

export type QuotationItem = {
  name?: string
  item_code: string
  item_name?: string
  description?: string
  qty: number
  uom?: string
  stock_uom?: string
  conversion_factor?: number
  rate: number
  amount?: number
  warehouse?: string
  prevdoc_docname?: string
  prevdoc_detail_docname?: string
  delivery_date?: string
  discount_percentage?: number
  discount_amount?: number
  margin_type?: string
  margin_rate_or_amount?: number
  item_tax_template?: string
  is_free_item?: number | boolean
  is_alternative?: number | boolean
  [key: string]: unknown
}

export type QuotationDocument = QuotationSummary & {
  quotation_to: string
  party_name: string
  company: string
  selling_price_list?: string
  taxes_and_charges?: string
  order_type?: string
  items: QuotationItem[]
  taxes?: QuotationTax[]
  payment_schedule?: QuotationPayment[]
  terms?: string
  shipping_address?: string
  shipping_address_name?: string
  shipping_rule?: string
  incoterm?: string
  named_place?: string
  tc_name?: string
  select_print_heading?: string
  letter_head?: string
  conversion_rate?: number
  price_list_currency?: string
  apply_discount_on?: string
  additional_discount_percentage?: number
  additional_discount_amount?: number
  [key: string]: unknown
}

export type QuotationTax = { name?: string; charge_type?: string; account_head?: string; description?: string; rate?: number; tax_amount?: number; row_id?: string; included_in_print_rate?: number | boolean; [key: string]: unknown }
export type QuotationPayment = { name?: string; due_date?: string; invoice_portion?: number; payment_amount?: number; [key: string]: unknown }
