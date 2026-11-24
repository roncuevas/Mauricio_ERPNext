import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyConnection } from './erpnext'
import i18n from './i18n'

const connection = { id: 'p', label: 'Tienda', baseUrl: 'https://erp.example.com', apiKey: 'key', apiSecret: 'secret' }
const reply = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

describe('verifyConnection', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the ERPNext user and their full name when the credentials are accepted', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('get_logged_user')
      ? new Response(JSON.stringify({ message: 'ventas@example.com' }), { status: 200 })
      : new Response(JSON.stringify({ data: { name: 'ventas@example.com', first_name: 'Ana', last_name: 'López' } }), { status: 200 })))
    await expect(verifyConnection(connection)).resolves.toEqual({ user: 'ventas@example.com', userName: 'Ana López' })
  })

  it('leaves the name out when the user record cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('get_logged_user')
      ? new Response(JSON.stringify({ message: 'ventas@example.com' }), { status: 200 })
      : new Response('{}', { status: 403 })))
    await expect(verifyConnection(connection)).resolves.toEqual({ user: 'ventas@example.com', userName: undefined })
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
