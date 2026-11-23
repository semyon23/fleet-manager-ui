import { expect, test } from '@playwright/test'

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`demo sign-in opens the original route after the traffic splash (${reducedMotion})`, async ({ page }) => {
    const apiCalls = []
    let mqttConnections = 0
    await page.route('**/config.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: `window.__FLEET_CONFIG__ = {
        apiBaseUrl: '/entry-test-api', useMocks: false,
        mqttUrl: location.origin.replace('http', 'ws') + '/entry-test-mqtt'
      }`,
    }))
    // A disconnected fleet must not prevent the operator from opening the UI.
    await page.route('**/entry-test-api/**', route => {
      apiCalls.push(new URL(route.request().url()).pathname)
      return route.fulfill({ status: 503, json: { message: 'Fleet offline' } })
    })
    await page.routeWebSocket('**/entry-test-mqtt', () => { mqttConnections++ })
    await page.emulateMedia({ reducedMotion })
    await page.clock.install({ time: new Date('2026-01-01T08:00:00Z') })
    await page.goto('settings?source=entry#traffic')
    const originalUrl = /\/settings\?source=entry#traffic$/
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    const password = page.getByLabel('Password', { exact: true })
    await expect(page.getByLabel('Username', { exact: true })).toHaveValue('admin')
    await expect(password).toHaveValue('admin')
    await password.fill('admin ')
    await password.press('Enter')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)

    await password.fill('admin')
    await page.clock.pauseAt(new Date('2026-01-01T09:00:00Z'))
    await password.press('Enter')
    const splash = page.getByRole('status').filter({ hasText: 'FMS traffic control' })
    await expect(splash).toBeVisible()
    const fleet = page.locator('.ce-fleet:visible')
    await expect(fleet.locator('[data-amr]')).toHaveCount(3)
    const loadedRobot = fleet.locator('[data-amr="01"]')
    await expect(loadedRobot.locator('.ce-cargo')).toHaveCount(1)
    await expect(fleet.locator('.ce-cargo')).toHaveCount(1)
    const initialPose = await loadedRobot.getAttribute('transform')
    await page.clock.runFor(900)
    if (reducedMotion === 'reduce') {
      await expect(loadedRobot).toHaveAttribute('transform', initialPose)
    } else {
      await expect(loadedRobot).not.toHaveAttribute('transform', initialPose)
    }
    await page.clock.fastForward(2599)
    await expect(splash).toBeVisible()
    expect(apiCalls).toEqual([])
    expect(mqttConnections).toBe(0)
    await page.clock.fastForward(1)
    const settings = page.getByRole('heading', { name: 'Settings', level: 1 })
    await expect(settings).toBeVisible()
    await page.clock.resume()
    await expect(page).toHaveURL(originalUrl)
    await expect.poll(() => apiCalls.length).toBeGreaterThan(0)
    await expect.poll(() => mqttConnections).toBeGreaterThan(0)

    await page.reload()
    await expect(settings).toBeVisible()
    await expect(page).toHaveURL(originalUrl)
  })
}
