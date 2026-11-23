import { expect, test } from '@playwright/test'

const map = {
  id: 'workshop', name: 'Workshop', version: 1,
  width: 200, height: 160, meta: { resolution: 0.1, origin: [0, 0] },
}

function robot(id, state, x, theta) {
  const timestamp = '2026-01-01T12:00:00Z'
  return {
    id, name: id, manufacturer: 'AMR', serialNumber: id, lifecycle: 'ACTIVE',
    createdAt: timestamp, updatedAt: timestamp, graphPosition: null, info: null,
    availability: { state },
    status: {
      connection: 'ONLINE', operatingMode: 'AUTOMATIC', localized: true,
      pose: { x, y: 8, mapId: map.id, theta }, lastNodeId: '',
      driving: false, paused: false, missionId: null,
      power: { stateOfCharge: 80, charging: state === 'CHARGING', voltage: null, range: null },
      safety: { emergencyStop: 'NONE', fieldViolation: false },
      lastStateAt: timestamp, factsheetReceivedAt: null,
    },
  }
}

test('Live Map selects an oriented chassis independently of hover and robot names', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: "window.__FLEET_CONFIG__ = { apiBaseUrl: '/api', useMocks: false, mqttUrl: '' }",
  }))
  const responses = {
    '/api/health': { status: 'OK' },
    '/api/fms/maps': [map],
    '/api/fms/maps/workshop': map,
    '/api/fms/robots': [robot('AMR-07', 'IDLE', 4, Math.PI / 2), robot('AMR-12', 'CHARGING', 16, 0)],
    '/api/fms/routes': { items: [] },
    '/api/fms/alarms': { items: [], nextCursor: null },
  }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    return Object.hasOwn(responses, path)
      ? route.fulfill({ json: responses[path] })
      : route.fulfill({ status: 404 })
  })
  await page.goto('live')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  const idle = page.getByRole('button', { name: 'AMR-07 · Idle', exact: true })
  const charging = page.getByRole('button', { name: 'AMR-12 · Charging', exact: true })
  await idle.click()
  const portrait = page.getByRole('img', { name: 'AMR-07 · Idle', exact: true })
  const chassis = 'g[transform^="rotate("]'
  await expect(idle.locator(chassis)).toHaveAttribute('transform', /^rotate\(-90\)/)
  await expect(portrait.locator(chassis)).toHaveAttribute('transform', /^rotate\(-90\)/)
  await expect(idle.locator('path[fill="#22c55e"]')).toBeVisible()
  await expect(charging.locator('path[fill="#eab308"]')).toBeVisible()

  await charging.hover()
  await expect(idle).toHaveAttribute('aria-pressed', 'true')
  await expect(charging).toHaveAttribute('aria-pressed', 'false')
  await expect(idle.locator('.selection-corners')).toBeVisible()
  await expect(charging.locator('.selection-corners')).toHaveCount(0)
  await expect(portrait).toBeVisible()
  await charging.press('Enter')
  await expect(charging).toHaveAttribute('aria-pressed', 'true')
  await expect(idle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('img', { name: 'AMR-12 · Charging', exact: true })).toBeVisible()

  const name = charging.getByText('AMR-12', { exact: true })
  await expect(name).toBeVisible()
  await page.getByRole('button', { name: /^Layers/ }).click()
  const names = page.getByRole('checkbox', { name: 'Robot names' })
  await names.click()
  await expect(name).toBeHidden()
  await expect(charging).toBeVisible()
  await names.click()
  await expect(name).toBeVisible()
})
