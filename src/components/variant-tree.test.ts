import { describe, expect, it } from 'vitest'
import { variantNodeIsVisible } from './variant-tree'

describe('variant tree visibility', () => {
  it('keeps matching descendants visible through their parent', () => {
    const parent = { name: 'DOG-TEMPLATE', item_name: 'Perro' }
    const child = { name: 'DOG-10', item_name: 'Perro 10 Kg', variant_of: parent.name }
    const children = new Map([[parent.name, [child]]])

    expect(variantNodeIsVisible(parent, children, false, '10 kg')).toBe(true)
    expect(variantNodeIsVisible(parent, children, false, 'gato')).toBe(false)
  })
})
