import { describe, expect, it } from 'vitest'
import { queryKeys } from './query-keys'

describe('query keys', () => {
  it('separates every profile-scoped catalog', () => {
    expect(queryKeys.catalog.item('profile-a')).not.toEqual(queryKeys.catalog.item('profile-b'))
    expect(queryKeys.catalog.variant('profile-a')).toEqual(['variant-catalog', 'profile-a'])
    expect(queryKeys.catalog.stock('profile-a')).toEqual(['stock-catalog', 'profile-a'])
  })

  it('scopes ERPNext metadata and POS queries by profile', () => {
    expect(queryKeys.metadata.doctype('profile-a', 'Item')).toEqual(['doctype-meta', 'profile-a', 'Item'])
    expect(queryKeys.metadata.document('profile-a', 'Item', 'ITEM-001')).toEqual(['metadata-editor', 'profile-a', 'Item', 'ITEM-001'])
    expect(queryKeys.pos.currentUser('profile-a')).not.toEqual(queryKeys.pos.currentUser('profile-b'))
  })
})
