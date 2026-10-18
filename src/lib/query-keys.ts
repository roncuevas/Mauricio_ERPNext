export const queryKeys = {
  catalog: {
    item: (profileId: string) => ['item-catalog', profileId] as const,
    variant: (profileId: string) => ['variant-catalog', profileId] as const,
    price: (profileId: string) => ['item-price-catalog', profileId] as const,
    stock: (profileId: string) => ['stock-catalog', profileId] as const,
    supplier: (profileId: string) => ['supplier-catalog', profileId] as const,
    doctype: (profileId: string) => ['doctype-catalog', profileId] as const,
  },
  metadata: {
    doctype: (profileId: string, doctype: string) => ['doctype-meta', profileId, doctype] as const,
    document: (profileId: string, doctype: string, name: string | null) => ['metadata-editor', profileId, doctype, name] as const,
    list: (profileId: string, doctype: string, fields: string[]) => ['doctype-list', profileId, doctype, fields] as const,
    single: (profileId: string, doctype: string) => ['doctype-single', profileId, doctype] as const,
  },
  item: {
    detail: (profileId: string, name: string) => ['item-uoms', profileId, name] as const,
  },
  uom: {
    options: (profileId: string) => ['uom-options', profileId] as const,
  },
  pos: {
    profiles: (profileId: string) => ['pos-profiles', profileId] as const,
    currentUser: (profileId: string) => ['pos-current-user', profileId] as const,
    openings: (profileId: string) => ['pos-shift-openings', profileId] as const,
    profileDetails: (profileId: string, names: string) => ['pos-shift-profile-details', profileId, names] as const,
    settings: (profileId: string) => ['pos-settings', profileId] as const,
    customers: (profileId: string) => ['pos-customers', profileId] as const,
    paymentMethods: (profileId: string, profileName?: string) => ['pos-payment-methods', profileId, profileName] as const,
    openEntry: (profileId: string, profileName?: string, shiftName?: string) => ['pos-open-entry', profileId, profileName, shiftName] as const,
    salesTaxTemplate: (profileId: string, profileName?: string, template?: string) => ['pos-sales-tax-template', profileId, profileName, template] as const,
    history: (profileId: string, shiftName?: string, invoiceMode?: string) => ['pos-history', profileId, shiftName, invoiceMode] as const,
    drafts: (profileId: string, profileName?: string, invoiceMode?: string) => ['pos-drafts', profileId, profileName, invoiceMode] as const,
  },
  prices: {
    lists: (profileId: string) => ['price-lists', profileId] as const,
  },
  quotations: {
    list: (profileId: string, company?: string) => ['quotations', profileId, company] as const,
    editor: (profileId: string, name?: string) => ['quotation-editor', profileId, name] as const,
    profiles: (profileId: string) => ['quotation-pos-profiles', profileId] as const,
    companies: (profileId: string) => ['quotation-companies', profileId] as const,
    parties: (profileId: string) => ['quotation-parties', profileId] as const,
    taxes: (profileId: string) => ['quotation-tax-templates', profileId] as const,
    items: (profileId: string) => ['quotation-items', profileId] as const,
    warehouses: (profileId: string) => ['quotation-warehouses', profileId] as const,
  },
  salesOrders: {
    list: (profileId: string, company: string, date: string) => ['sales-orders', profileId, company, date] as const,
    cache: (profileId: string) => ['sales-orders-cache', profileId] as const,
    document: (profileId: string, name: string | null) => ['sales-order', profileId, name] as const,
    customers: (profileId: string) => ['sales-order-customers', profileId] as const,
    profiles: (profileId: string) => ['sales-order-profiles', profileId] as const,
  },
  settings: {
    userProfile: (profileId: string) => ['settings-user-profile', profileId] as const,
  },
} as const
