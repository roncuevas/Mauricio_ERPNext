import { describe, expect, it } from 'vitest'
import { buildShareUrl, clearSharedConnectionParams, readSharedConnection } from './share-link'

describe('credential share links', () => {
  const profile = { id: 'profile-1', label: 'Mi ERP', baseUrl: 'https://erp.example.com', apiKey: 'key/one', apiSecret: 'secret+two' }

  it('builds an encoded link and reads the shared credentials', () => {
    const url = buildShareUrl(profile, 'https://mauricio.roncuevas.com/')
    expect(readSharedConnection(new URL(url).search)).toEqual({ baseUrl: profile.baseUrl, label: profile.label, apiKey: profile.apiKey, apiSecret: profile.apiSecret })
  })

  it('does not treat an incomplete credential pair as a share link', () => {
    expect(readSharedConnection('?api_key=only-key')).toBeNull()
  })

  it('removes credential parameters before the app continues', () => {
    expect(clearSharedConnectionParams('https://mauricio.roncuevas.com/?api_key=key&api_secret=secret&keep=1#connect')).toBe('/?keep=1#connect')
  })
})
