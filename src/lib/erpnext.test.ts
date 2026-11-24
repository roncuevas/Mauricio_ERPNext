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

  it('loads image blobs with the configured token and rejects cross-origin URLs', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => ({ type: 'image/png', size: 5 }) } as Response))
    vi.stubGlobal('fetch', fetchMock)
    const client = createErpNextClient({ id: 'test', label: 'Test', baseUrl: 'https://erp.example.com', apiKey: 'key', apiSecret: 'secret' })
    await expect(client.getImage('/files/item.png')).resolves.toMatchObject({ type: 'image/png', size: 5 })
    const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new Headers(request.headers).get('Authorization')).toBe('token key:secret')
    await expect(client.getImage('https://other.example.com/private.png')).rejects.toThrow('no pertenece al servidor')
    await expect(client.getImage('https://user@erp.example.com/private.png')).rejects.toThrow('no pertenece al servidor')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('builds the desk URL of a submitted document', () => {
    const client = createErpNextClient({ id: 'test', label: 'Test', baseUrl: 'https://erp.example.com/', apiKey: 'key', apiSecret: 'secret' })
    expect(client.documentUrl('Purchase Receipt', 'MAT-PRE-0001')).toBe('https://erp.example.com/app/purchase-receipt/MAT-PRE-0001')
    expect(client.documentUrl('Stock Reconciliation', 'A/B 1')).toBe('https://erp.example.com/app/stock-reconciliation/A%2FB%201')
  })

  it('builds the desk URL of a new document with prefilled fields', () => {
    const client = createErpNextClient({ id: 'test', label: 'Test', baseUrl: 'https://erp.example.com/', apiKey: 'key', apiSecret: 'secret' })
    expect(client.newDocumentUrl('Stock Entry', { stock_entry_type: 'Material Transfer', to_warehouse: 'Tienda - M', from_warehouse: '' })).toBe('https://erp.example.com/app/stock-entry/new?stock_entry_type=Material+Transfer&to_warehouse=Tienda+-+M')
    expect(client.newDocumentUrl('Material Request')).toBe('https://erp.example.com/app/material-request/new')
  })
})
