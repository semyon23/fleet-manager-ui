import { test, expect } from '@playwright/test'

const ROUTES = {
  dashboard: 'Dashboard', live: 'Live Map', maps: 'Maps', robots: 'Robots',
  missions: 'Missions', alarms: 'Events', settings: 'Settings',
}

test.describe('Smoke: все роуты рендерятся без ошибок', () => {
  for (const [route, title] of Object.entries(ROUTES)) {
    test(`route ${route}`, async ({ page }) => {
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => {
        if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text())
      })
      await page.goto(route)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
      await page.waitForTimeout(1500)
      expect(errors, `Errors on ${route}: ${errors.join('|')}`).toEqual([])
    })
  }
})
