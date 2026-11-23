import { expect, test } from '@playwright/test'

async function openThemeSettings(page) {
  await page.getByRole('link', { name: /Settings$/ }).click()
  await page.getByText('General', { exact: true }).click()
}

test('graphite is the initial theme; Light and System persist across reloads', async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: "window.__FLEET_CONFIG__ = { useMocks: true, mqttUrl: '' }",
  }))
  await page.addInitScript(() => sessionStorage.setItem('fm.demo.signedIn', '1'))
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('maps')

  const root = page.locator('html')
  const newMap = page.getByRole('button', { name: '+ New map', exact: true })
  const maps = page.getByRole('link', { name: /Maps$/ })
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(newMap).toBeEnabled()
  await expect(newMap).toHaveCSS('background-color', 'rgb(180, 237, 114)')
  await expect(newMap).toHaveCSS('color', 'rgb(16, 28, 32)')

  await openThemeSettings(page)
  const light = page.getByRole('radio', { name: /Light/ })
  const system = page.getByRole('radio', { name: /System/ })
  await page.locator('label').filter({ has: light }).click()
  await expect(root).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  await page.getByText('General', { exact: true }).click()
  await expect(light).toBeChecked()
  await expect(root).toHaveAttribute('data-theme', 'light')
  await maps.click()
  await expect(newMap).toHaveCSS('background-color', 'rgb(65, 103, 33)')
  await expect(newMap).toHaveCSS('color', 'rgb(255, 255, 255)')

  await openThemeSettings(page)
  await page.locator('label').filter({ has: system }).click()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await page.getByText('General', { exact: true }).click()
  await expect(system).toBeChecked()
  await maps.click()
  await expect(newMap).toHaveCSS('background-color', 'rgb(180, 237, 114)')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(newMap).toHaveCSS('background-color', 'rgb(65, 103, 33)')
  await expect(newMap).toHaveCSS('color', 'rgb(255, 255, 255)')
})
