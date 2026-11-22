import { expect, test } from '@playwright/test'
import { company, connect, mockStock, warehouse } from './stock-helpers'

test('counts stock and submits only counted rows, keeping ERPNext valuation and posting time', async ({ page }) => {
  const erp = await mockStock(page)
  await connect(page)
  await page.goto('/stock')
  await expect(page.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible()
  const actions = page.locator('details.mobile-actions')
  if (await actions.isVisible()) await actions.locator('summary').click()
  await page.getByRole('button', { name: 'Refrescar inventario' }).click()
  await page.getByRole('link', { name: 'Ajustar' }).click()

  await expect(page.getByRole('heading', { name: 'Reconciliar existencia' })).toBeVisible()
  const counted = page.getByRole('spinbutton', { name: 'Cantidad contada de Croquetas Adulto Premium' })
  await expect(counted).toBeFocused()
  await counted.fill('7')
  await expect(page.getByRole('listitem').filter({ hasText: 'Croquetas Adulto Premium' })).toContainText('-3')

  const search = page.getByRole('textbox', { name: 'Buscar producto' })
  await search.fill('ITEM-002')
  await search.press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Cantidad contada de Arena para gato' })).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'contados' })).toHaveText('1 contados · 1 con diferencia · 1 por contar')

  await page.getByRole('button', { name: 'Enviar reconciliación (1)' }).click()
  await expect(page.getByText('Reconciliación MAT-RECO-0001 enviada con 1 producto.')).toBeVisible()
  expect(erp.submitted).toEqual(['MAT-RECO-0001'])
  expect(erp.created).toHaveLength(1)
  expect(erp.created[0]).toMatchObject({ doctype: 'Stock Reconciliation', purpose: 'Stock Reconciliation', company: company.name })
  expect(erp.created[0]).not.toHaveProperty('set_posting_time')
  expect(erp.created[0].items).toEqual([{ item_code: 'ITEM-001', warehouse: warehouse.name, qty: 7 }])
  await expect(page.locator('.stock-card-current strong')).toHaveText('7')
})
