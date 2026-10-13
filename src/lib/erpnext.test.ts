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
})
