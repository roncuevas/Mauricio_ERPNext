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
  },
} as const
