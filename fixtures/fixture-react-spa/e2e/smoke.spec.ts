import { expect, test } from '@playwright/test'

test('renders the application heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'fixture-react-spa' })).toBeVisible()
})

test('increments the counter', async ({ page }) => {
  await page.goto('/')
  const button = page.getByRole('button', { name: /count is/i })
  await expect(button).toHaveText('Count is 0')
  await button.click()
  await button.click()
  await expect(button).toHaveText('Count is 2')
})
