import { afterEach, describe, expect, it, vi } from 'vitest'
import { createErpNextClient } from './erpnext'

describe('ERPNext REST client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes ERPNext list responses into ListResult', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ name: 'GAN-SOB-PREM-22', item_name: 'Ganador - Sobre Premium Surtido Perro' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const client = createErpNextClient({ id: 'test', label: 'Test', baseUrl: 'https://erp.example.com', apiKey: 'key', apiSecret: 'secret' })
    await expect(client.listDocuments('Item', { fields: ['name', 'item_name'] })).resolves.toEqual({
      data: [{ name: 'GAN-SOB-PREM-22', item_name: 'Ganador - Sobre Premium Surtido Perro' }],
    })
  })

  it('refreshes a document before submitting to avoid stale timestamps', async () => {
    const responses = [
      new Response(JSON.stringify({ data: { name: 'POS-O-0001', doctype: 'POS Opening Entry', modified: '2026-10-15 17:47:13.569608', docstatus: 0 } }), { status: 200 }),
      new Response(JSON.stringify({ message: { name: 'POS-O-0001', docstatus: 1 } }), { status: 200 }),
    ]
    const fetchMock = vi.fn(async () => responses.shift()!)
    vi.stubGlobal('fetch', fetchMock)

    const client = createErpNextClient({ id: 'test', label: 'Test', baseUrl: 'https://erp.example.com', apiKey: 'key', apiSecret: 'secret' })
    await expect(client.submitDocument('POS Opening Entry', 'POS-O-0001')).resolves.toEqual({ name: 'POS-O-0001', docstatus: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const submitCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(JSON.parse(submitCall[1].body as string).doc).toContain('2026-10-15 17:47:13.569608')
  })
})
