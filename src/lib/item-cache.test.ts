import { describe, expect, it } from 'vitest'
import { filterItems, rankItems } from './item-cache'

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

  it('orders matches by relevance while preserving the source order as a tie breaker', () => {
    const results = rankItems([
      { name: 'GAN-AD-20', item_name: 'Ganador Adulto 20 Kg' },
      { name: 'GAN-AD', item_name: 'Ganador Adulto' },
    ], 'ganador adulto')
    expect(results.map((entry) => entry.item.name)).toEqual(['GAN-AD', 'GAN-AD-20'])
  })
})
