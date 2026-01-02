import { test, expect } from '@playwright/test'

test('scenarios page loads', async ({ page }) => {
  await page.goto('/scenarios')
  await expect(page.getByRole('heading', { name: 'Scenarios' })).toBeVisible()
})
