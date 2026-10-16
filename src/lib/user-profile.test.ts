import { describe, expect, it } from 'vitest'
import { normalizeUserProfile } from './user-profile'

describe('user profile helpers', () => {
  it('normalizes identity, email fallback, status and unique roles', () => {
    expect(normalizeUserProfile({ name: 'cashier@example.com', first_name: 'Ana', last_name: 'López', enabled: 1, roles: [{ role: 'Sales User' }, { role: 'Sales User' }, {}, { role: ' Stock User ' }] })).toMatchObject({ displayName: 'Ana López', email: 'cashier@example.com', enabled: true, roles: ['Sales User', 'Stock User'] })
  })

  it('prefers full name and omits blank optional values', () => {
    expect(normalizeUserProfile({ name: 'Administrator', full_name: 'Admin Principal', phone: ' ', language: ' es ', roles: [{ role: ' ' }] })).toEqual({ name: 'Administrator', displayName: 'Admin Principal', email: undefined, username: undefined, userType: undefined, enabled: undefined, mobile: undefined, phone: undefined, language: 'es', timeZone: undefined, lastLogin: undefined, creation: undefined, roles: [] })
  })
})
