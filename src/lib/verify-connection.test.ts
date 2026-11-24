import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyConnection } from './erpnext'
import i18n from './i18n'

const connection = { id: 'p', label: 'Tienda', baseUrl: 'https://erp.example.com', apiKey: 'key', apiSecret: 'secret' }
const reply = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

describe('verifyConnection', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the ERPNext user when the credentials are accepted', async () => {
    reply(200, { message: 'ventas@example.com' })
    await expect(verifyConnection(connection)).resolves.toBe('ventas@example.com')
  })

  it('explains rejected credentials, including a Guest session', async () => {
    const message = i18n.t('connection.verify.credentials')
    reply(401, { exc_type: 'AuthenticationError' })
    await expect(verifyConnection(connection)).rejects.toThrow(message)
    reply(200, { message: 'Guest' })
    await expect(verifyConnection(connection)).rejects.toThrow(message)
  })

  it('names the host and this origin when the instance cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(verifyConnection(connection)).rejects.toThrow(i18n.t('connection.verify.unreachable', { host: 'erp.example.com', origin: window.location.origin }))
  })

  it('flags a site that answers but is not ERPNext', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html></html>', { status: 200 })))
    await expect(verifyConnection(connection)).rejects.toThrow(i18n.t('connection.verify.notErpNext', { host: 'erp.example.com' }))
  })
})
