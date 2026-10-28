import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

export function localEnv() {
  const values: Record<string, string> = {}
  for (const line of readFileSync('.env.erpnext.local', 'utf8').split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) values[match[1]] = match[2]
  }
  return values
}

export async function connectRealErpNext(page: Page) {
  const env = localEnv()
  await page.addInitScript(() => localStorage.setItem('mauricio-erpnext:language', 'es'))
  await page.goto('/')
  const fields = page.getByRole('textbox')
  await fields.nth(0).fill('ERPNext local E2E')
  await fields.nth(1).fill('http://localhost:4173')
  await fields.nth(2).fill(env.E2E_ERP_API_KEY)
  await fields.nth(3).fill(env.E2E_ERP_API_SECRET)
  await fields.nth(4).fill(env.E2E_LOCAL_PASSPHRASE ?? 'e2e-local-passphrase')
  await page.getByRole('button', { name: /Cifrar y conectar|Encrypt and connect/ }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible()
}

export async function refreshProducts(page: Page) {
  await page.goto('/items')
  await expect(page.getByRole('heading', { name: 'Productos', exact: true })).toBeVisible()
  const actions = page.locator('details.mobile-actions')
  if (await actions.isVisible()) await actions.locator('summary').click()
  await page.getByRole('button', { name: 'Refrescar catálogo' }).click()
  await expect(page.locator('.product-table-title:visible').filter({ hasText: 'E2E Product' }).first()).toBeVisible({ timeout: 30_000 })
}
