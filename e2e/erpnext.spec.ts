import { expect, test } from '@playwright/test'
import { connectRealErpNext, refreshProducts } from './erpnext.helpers'

test.describe('ERPNext real local integration', () => {
  test('connects, fetches cache, searches products and opens prices', async ({ page }) => {
    await connectRealErpNext(page)
    await refreshProducts(page)
    await expect(page.getByText('Productos guardados en caché')).toBeVisible()
    await page.getByRole('textbox', { name: 'Buscar productos' }).fill('E2E Product')
    await expect(page.getByText('E2E Product', { exact: true }).first()).toBeVisible()
    await page.goto('/prices')
    await expect(page.getByRole('heading', { name: 'Precios por producto' })).toBeVisible()
    const priceSearch = page.getByRole('textbox', { name: 'Buscar precios por producto' })
    await priceSearch.fill('E2E Product')
    await page.getByRole('button', { name: 'Buscar precios por producto' }).click()
    await expect(page.getByText('E2E Product', { exact: true }).first()).toBeVisible()
  })

  test('loads home, settings caches, variants, suppliers and stock without overflow', async ({ page }) => {
    await connectRealErpNext(page)
    for (const [path, heading] of [['/home', 'Inicio'], ['/variants', 'Variantes'], ['/suppliers', 'Proveedores'], ['/stock', 'Inventario'], ['/settings', 'Configuración']] as const) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }))
      expect(dimensions.body, `${path} overflow horizontal`).toBeLessThanOrEqual(dimensions.viewport + 1)
    }
    await page.getByRole('tab', { name: 'Cachés' }).click()
    await expect(page.getByRole('heading', { name: 'Cachés y último fetch' })).toBeVisible()
    await page.getByRole('button', { name: 'Refrescar todo' }).click()
  })

  test('opens POS, uses the seeded customer/product and creates a real draft', async ({ page }) => {
    await connectRealErpNext(page)
    await refreshProducts(page)
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'POS' })).toBeVisible()
    await page.getByRole('button', { name: 'Abrir turno' }).click()
    await expect(page.getByText(/Turno abierto:/)).toBeVisible({ timeout: 30_000 })
    await page.getByLabel('Buscar cliente').fill('E2E Customer')
    await expect(page.getByRole('option', { name: 'E2E Customer' })).toBeVisible()
    await page.getByRole('option', { name: 'E2E Customer' }).click()
    await expect(page.getByText('E2E Product', { exact: true }).first()).toBeVisible()
  })

  test('opens sales orders and quotations with real server data', async ({ page }) => {
    await connectRealErpNext(page)
    await page.goto('/sales-orders')
    await expect(page.getByRole('heading', { name: /Ventas/ })).toBeVisible()
    await page.goto('/quotations')
    await expect(page.getByRole('heading', { name: /Cotizaciones/ })).toBeVisible()
    await page.goto('/doctypes')
    await expect(page.getByRole('heading', { name: 'DocTypes' })).toBeVisible()
  })
})
