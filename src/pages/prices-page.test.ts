import { describe, expect, it } from 'vitest'
import { collectVisibleNames, type PriceFilters } from './prices-page'

const emptyFilters: PriceFilters = { minPrice: '', maxPrice: '', brand: '', itemGroup: '', supplier: '', priceList: '', uom: '', priceType: '', status: '' }

describe('price hierarchy search', () => {
  it('expands a template match and reveals its variants', () => {
    const template = { name: 'DOG-TEMPLATE', item_name: 'Croquetas perro', has_variants: 1 }
    const variant = { name: 'DOG-10', item_name: 'Croquetas perro 10 kg', variant_of: 'DOG-TEMPLATE' }
    const children = new Map([[template.name, [variant]]])

    const result = collectVisibleNames([template], children, new Map(), 'Croquetas perro', emptyFilters)

    expect(result.directNames.has(template.name)).toBe(true)
    expect(result.expandedNames.has(template.name)).toBe(true)
    expect(result.visibleNames).toEqual(new Set([template.name, variant.name]))
  })
})
