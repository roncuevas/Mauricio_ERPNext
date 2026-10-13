import { describe, expect, it } from 'vitest'
import { buildVariantTree, getVariantAttributeCoverage } from './variant-cache'

describe('variant catalog tree', () => {
  it('groups variants below their template and keeps orphan variants visible', () => {
    const template = { name: 'DOG-TEMPLATE', has_variants: 1 }
    const variant = { name: 'DOG-10', variant_of: 'DOG-TEMPLATE' }
    const orphan = { name: 'CAT-10', variant_of: 'MISSING-TEMPLATE' }
    const tree = buildVariantTree([template, variant, orphan])

    expect(tree.roots.map((item) => item.name)).toEqual(['DOG-TEMPLATE', 'CAT-10'])
    expect(tree.children.get('DOG-TEMPLATE')?.map((item) => item.name)).toEqual(['DOG-10'])
  })

  it('reports attribute values that are missing from a template variants set', () => {
    const template = { name: 'DOG-TEMPLATE', attributes: [{ attribute: 'Color', values: ['Rojo', 'Azul', 'Verde'] }] }
    const variants = [
      { name: 'DOG-RED', variant_of: 'DOG-TEMPLATE', attributes: [{ attribute: 'Color', attribute_value: 'Rojo' }] },
      { name: 'DOG-BLUE', variant_of: 'DOG-TEMPLATE', attributes: [{ attribute: 'Color', attribute_value: 'Azul' }] },
    ]

    expect(getVariantAttributeCoverage(template, variants)).toEqual([{ attribute: 'Color', expected: ['Rojo', 'Azul', 'Verde'], created: ['Rojo', 'Azul'], missing: ['Verde'] }])
  })
})
