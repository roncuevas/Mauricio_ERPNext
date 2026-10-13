import { describe, expect, it } from 'vitest'
import { filterItems } from './item-cache'

describe('local item catalog cache', () => {
  const items = [
    { name: 'GAN-AD-20', item_name: 'Ganador Adulto 20 Kg' },
    { name: 'NUPEC-ADULTO', item_name: 'Nupec Adulto' },
  ]

  it('filters locally by code or product name', () => {
    expect(filterItems(items, 'ganador')).toEqual([items[0]])
    expect(filterItems(items, 'nupec-adulto')).toEqual([items[1]])
    expect(filterItems(items, '')).toEqual(items)
  })
})
