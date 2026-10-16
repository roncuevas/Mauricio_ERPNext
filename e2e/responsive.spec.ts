import { expect, test, type Page } from '@playwright/test'

async function mockErpNext(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = request.url()
    const item = { name: 'ITEM-001', item_code: 'SKU-001', item_name: 'Croquetas Adulto Premium', brand: 'Nupec', item_group: 'Alimento', stock_uom: 'Kg', sales_uom: 'Kg', purchase_uom: 'Bulto', disabled: 0, uoms: [{ uom: 'Kg', conversion_factor: 1 }, { uom: 'Bulto', conversion_factor: 20 }] }
    const profile = { name: 'Caja Demo', company: 'Mauricio Demo', warehouse: 'Almacén Demo', currency: 'MXN', selling_price_list: 'Standard Selling', customer: 'Cliente Mostrador', allow_user_to_edit_rate: 1, payments: [{ mode_of_payment: 'Efectivo', default: 1 }] }
    if (url.includes('frappe.auth.get_logged_user')) return route.fulfill({ json: { message: 'Administrator' } })
    if (url.includes('POS%20Profile?')) return route.fulfill({ json: { data: [profile] } })
    if (url.includes('POS%20Profile/')) return route.fulfill({ json: { data: profile } })
    if (url.includes('POS%20Settings/')) return route.fulfill({ json: { data: { invoice_type: 'Sales Invoice' } } })
    if (url.includes('Customer?')) return route.fulfill({ json: { data: [{ name: 'CUST-001', customer_name: 'Cliente Demo' }] } })
    if (url.includes('POS%20Opening%20Entry?')) return route.fulfill({ json: { data: [] } })
    if (url.includes('POS%20Opening%20Entry/')) return route.fulfill({ json: { data: { name: 'SUP-001', status: 'Open', company: profile.company, pos_profile: profile.name, user: 'Administrator', period_start_date: '2026-10-14T09:00:00.000Z', balance_details: [{ mode_of_payment: 'Efectivo', opening_amount: 100 }] } } })
    if (url.includes('pos_closing_entry.pos_closing_entry.get_invoices')) return route.fulfill({ json: { message: { invoices: [{ name: 'SINV-001', doctype: 'Sales Invoice', posting_date: '2026-10-14', grand_total: 50, net_total: 50, total_qty: 1, total_taxes_and_charges: 0 }], payments: [{ mode_of_payment: 'Efectivo', amount: 50 }], taxes: [] } } })
    if (url.includes('POS%20Closing%20Entry/')) return route.fulfill({ json: { data: { name: 'PCE-001', status: 'Submitted', docstatus: 1 } } })
    if (url.includes('POS%20Closing%20Entry')) return route.fulfill({ json: { data: { name: 'PCE-001' } } })
    if (request.method() === 'POST') return route.fulfill({ status: 200, json: { data: { name: 'SUP-001' } } })
    if (url.includes('/meta')) return route.fulfill({ json: { data: { fields: [] } } })
    if (url.includes('Item%20Barcode')) return route.fulfill({ status: 403, json: { message: 'Forbidden' } })
    if (url.includes('UOM%20Conversion%20Detail')) return route.fulfill({ json: { data: [{ parent: 'ITEM-001', uom: 'Bulto', conversion_factor: 20 }] } })
    if (url.includes('Item%20Price')) return route.fulfill({ json: { data: [{ name: 'PRICE-BUY-001', item_code: 'ITEM-001', price_list: 'Standard Buying', price_list_rate: 100, buying: 1, selling: 0, uom: 'Kg', currency: 'MXN', supplier: 'Proveedor demo' }, { name: 'PRICE-SELL-001', item_code: 'ITEM-001', price_list: 'Standard Selling', price_list_rate: 150, buying: 0, selling: 1, uom: 'Kg', currency: 'MXN' }] } })
    if (url.includes('/api/resource/Item?')) return route.fulfill({ json: { data: [item] } })
    if (url.includes('/api/resource/Item/')) return route.fulfill({ json: { data: item } })
    return route.fulfill({ json: { data: [] } })
  })
}

async function createConnection(page: Page) {
  await page.goto('/')
  await page.getByLabel('Nombre del perfil').fill('E2E local')
  await page.getByLabel('URL de ERPNext').fill('https://erp.example.test')
  await page.getByLabel('API Key').fill('e2e-key')
  await page.getByLabel('API Secret').fill('e2e-secret')
  await page.getByLabel('Contraseña local').fill('e2e-passphrase')
  await page.getByRole('button', { name: 'Cifrar y conectar' }).click()
  await expect(page).toHaveURL(/\/items$/)
}

async function refreshCatalog(page: Page) {
  await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible()
  const actions = page.locator('details.mobile-actions')
  if (await actions.isVisible()) {
    await actions.locator('summary').click()
    await expect(page.getByRole('button', { name: 'Refrescar catálogo' })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Refrescar catálogo' }).click()
}

test.describe('responsive navigation and empty states', () => {
  test.beforeEach(async ({ page }) => {
    await mockErpNext(page)
  })

  test('mobile uses compact navigation and keeps pages inside the viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Este caso corresponde al proyecto móvil')
    await createConnection(page)
    await expect(page.getByRole('button', { name: 'Menú' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Menú' }).click()
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
    const menuLayout = await page.evaluate(() => {
      const menu = document.querySelector('.mobile-navigation')
      return { height: menu?.getBoundingClientRect().height ?? 0, viewport: window.innerHeight, bodyOverflow: document.body.style.overflow }
    })
    expect(menuLayout.height).toBeGreaterThanOrEqual(menuLayout.viewport)
    expect(menuLayout.bodyOverflow).toBe('hidden')
    await page.getByRole('link', { name: 'Variantes' }).click()
    await expect(page).toHaveURL(/\/variants$/)
    await expect(page.getByRole('button', { name: 'Menú' })).toBeVisible()

    const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }))
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1)
  })

  test('imports shared credentials, pre-fills the form, and removes secrets from the URL', async ({ page }) => {
    await page.goto('/#share=eyJiYXNlVXJsIjoiaHR0cHM6Ly9lcnAuZXhhbXBsZS50ZXN0IiwibGFiZWwiOiJFbmxhY2UgY29tcGFydGlkbyIsImFwaUtleSI6ImUyZS1rZXkiLCJhcGlTZWNyZXQiOiJlMmUtc2VjcmV0In0')
    await expect(page.getByLabel('Nombre del perfil')).toHaveValue('Enlace compartido')
    await expect(page.getByLabel('URL de ERPNext')).toHaveValue('https://erp.example.test')
    await expect(page.getByLabel('API Key')).toHaveValue('e2e-key')
    await expect(page).not.toHaveURL(/api_secret/)
    await page.getByLabel('Contraseña local').fill('e2e-passphrase')
    await page.getByRole('button', { name: 'Cifrar y conectar' }).click()
    await expect(page).toHaveURL(/\/items$/)
  })

  test('mobile routes remain usable screen by screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Este caso corresponde al proyecto móvil')
    await createConnection(page)
    await refreshCatalog(page)
    await expect(page.getByText('Croquetas Adulto Premium', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Cards' }).click()
    await expect(page.getByRole('alert')).toContainText('La vista Cards carga información enriquecida')
    await page.getByRole('button', { name: 'Cargar y guardar en caché' }).click()
    await expect(page.getByText('Precios, UOM y conversiones guardados en caché')).toBeVisible()
    await expect(page.locator('.product-card')).toHaveCount(1)
    await expect(page.getByText('Ganancia aprox.')).toBeVisible()
    await expect(page.getByText('$50.00', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Tabla' }).click()
    await page.getByRole('button', { name: 'Cards' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.goto('/prices')
    await expect(page.getByRole('heading', { name: 'Precios por producto' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Buscar precios por producto' }).fill('Croquetas')
    await page.getByRole('button', { name: 'Buscar precios por producto' }).click()
    await expect(page.getByText('Croquetas Adulto Premium')).toBeVisible()
    const pricesFilter = page.getByRole('button', { name: 'Filtros de precios' })
    await expect(pricesFilter).toHaveAttribute('aria-expanded', 'false')
    await pricesFilter.click()
    await expect(page.getByRole('heading', { name: 'Filtros de Precios' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Marca' }).click()
    await page.getByRole('option', { name: 'Nupec' }).click()
    await expect(page.getByText('Croquetas Adulto Premium')).toBeVisible()
    await page.locator('input[aria-label="Precio mínimo"]:visible').last().fill('151')
    await expect(page.getByText('No hay productos para la búsqueda actual.')).toBeVisible()
    await page.locator('input[aria-label="Precio mínimo"]:visible').last().fill('100')
    await expect(page.getByText('Croquetas Adulto Premium')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Filtros de Precios' })).toBeHidden()
    await page.getByRole('textbox', { name: 'Buscar precios por producto' }).fill('producto que no existe')
    await page.getByRole('button', { name: 'Buscar precios por producto' }).click()
    await expect(page.getByText('No hay productos para la búsqueda actual.')).toBeVisible()
    await page.getByRole('textbox', { name: 'Buscar precios por producto' }).fill('Croquetas')
    await page.getByRole('button', { name: 'Buscar precios por producto' }).click()
    await page.getByRole('button', { name: 'Agregar precio' }).first().click()
    await expect(page.locator('h1').filter({ hasText: 'Agregar precio' })).toBeVisible()
    await expect(page.getByLabel('Precio *')).toBeVisible()

    const routes = [
      ['/items', 'Productos'],
      ['/variants', 'Variantes'],
      ['/prices', 'Precios por producto'],
      ['/suppliers', 'Proveedores'],
      ['/doctypes', 'DocTypes'],
      ['/settings', 'Configuración'],
    ] as const

    for (const [path, heading] of routes) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      await expect(page.locator('.page-header')).toBeVisible()
      await expect(page.locator('.page-header')).toHaveCSS('position', 'static')
      if (['/items', '/suppliers'].includes(path)) await expect(page.locator('.page-header-toolbar')).toBeVisible()
      if (path === '/suppliers') {
        await page.getByRole('textbox', { name: 'Buscar proveedores' }).fill('demo')
        await page.getByRole('button', { name: 'Buscar proveedores' }).click()
      }
      const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }))
      expect(dimensions.body, `${path} has horizontal page overflow`).toBeLessThanOrEqual(dimensions.viewport + 1)
      if (path !== '/settings') await expect(page.locator('.mobile-actions')).toBeVisible()
    }
  })

  test('desktop preserves the sidebar and compact actions stay hidden', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Este caso corresponde al proyecto de escritorio')
    await createConnection(page)
    await expect(page.locator('.app-sidebar')).toBeVisible()
    await expect(page.locator('.app-sidebar .app-brand-name')).toHaveText('Mauricio')
    await expect(page.getByText('Conexión activa')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Productos' })).toBeVisible()
    await expect(page.locator('.mobile-actions')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Bloquear sesión' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Activar modo oscuro' })).toBeVisible()
    await page.getByRole('button', { name: 'Activar modo oscuro' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark')
    await expect(page.getByRole('button', { name: 'Activar modo claro' })).toBeVisible()
    await page.getByRole('button', { name: 'Activar modo claro' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'light')
    await page.getByRole('link', { name: 'Configuración' }).click()
    await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible()
  })

  test('POS keeps keyboard-accessible shadcn flows on mobile and desktop', async ({ page }, testInfo) => {
    await createConnection(page)
    await page.goto('/items')
    await refreshCatalog(page)
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'POS' })).toBeVisible()
    await page.getByRole('button', { name: 'Abrir turno' }).click()
    if (testInfo.project.name === 'mobile') {
      await expect(page.getByRole('tab', { name: 'Productos' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tab', { name: /Carrito/ })).toHaveAttribute('aria-selected', 'false')
      await page.getByRole('tab', { name: /Carrito/ }).click()
      await expect(page.getByRole('tab', { name: /Carrito/ })).toHaveAttribute('aria-selected', 'true')
      await page.getByRole('button', { name: 'Más acciones del POS' }).click()
      await expect(page.getByRole('menuitem', { name: 'Mostrar productos' })).toBeVisible()
      await page.getByRole('menuitem', { name: 'Mostrar contexto' }).click()
    }
    await page.getByLabel('Buscar cliente').fill('Cliente')
    await expect(page.getByRole('option', { name: 'Cliente Demo' })).toBeVisible()
    await page.keyboard.press('Escape')
    const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }))
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1)
    if (testInfo.project.name === 'desktop') await expect(page.locator('.pos-layout')).toBeVisible()
  })

  test('POS prepares and submits an ERPNext closing entry after explicit confirmation', async ({ page }, testInfo) => {
    await createConnection(page)
    await page.goto('/items')
    await refreshCatalog(page)
    await page.goto('/pos')
    await page.getByRole('button', { name: 'Abrir turno' }).click()
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Más acciones del POS' }).click()
      await page.getByRole('menuitem', { name: 'Mostrar contexto' }).click()
    }
    await expect(page.getByText(/Turno abierto:/)).toBeVisible()
    await page.getByRole('button', { name: 'Preparar cierre' }).click()
    await expect(page.getByRole('heading', { name: 'Arqueo de cierre' })).toBeVisible()
    await expect(page.getByText('Resumen del servidor')).toBeVisible()
    await expect(page.locator('.pos-closing-summary-row').first()).toContainText('150.00')
    await page.getByRole('button', { name: 'Cerrar turno' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar cierre' }).click()
    await expect(page.getByText('Turno cerrado: PCE-001')).toBeVisible()
  })

  test('opens a POS shift from the dedicated turn management view', async ({ page }) => {
    await createConnection(page)
    await page.goto('/pos/turnos')
    await expect(page.getByRole('heading', { name: 'Turnos' })).toBeVisible()
    await expect(page.getByText('Administrator', { exact: true })).toBeVisible()
    await expect(page.getByText('Disponible', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Abrir turno' }).click()
    await expect(page.getByRole('heading', { name: 'Abrir Caja Demo' })).toBeVisible()
    await page.getByLabel('Fondo inicial Efectivo').fill('500')
    await page.getByRole('button', { name: 'Confirmar apertura' }).click()
    await expect(page.getByRole('status')).toContainText('Turno abierto: SUP-001')
  })
})
