import { describe, expect, it } from 'vitest'
import { emptyLocalCarts, localCartsScope } from './pos-local-carts'

describe('local POS carts', () => {
  it('isolates carts by connection and POS Profile', () => {
    expect(localCartsScope('connection-1', 'Caja A')).not.toBe(localCartsScope('connection-1', 'Caja B'))
    expect(localCartsScope('connection-1', 'Caja A')).not.toBe(localCartsScope('connection-2', 'Caja A'))
  })

  it('starts with an empty current cart and no active saved cart', () => {
    expect(emptyLocalCarts('connection-1', 'Caja A')).toMatchObject({ activeCartId: null, current: { lines: [], customer: '' }, carts: [] })
  })
})
