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

async function openLiveMap(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: "window.__FLEET_CONFIG__ = { apiBaseUrl: '/api', useMocks: false, mqttUrl: '' }",
  }))
  const responses = {
    '/api/health': { status: 'OK' },
    '/api/fms/maps': [map],
    '/api/fms/maps/workshop': { ...map, pgmDataUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="160"%3E%3Crect width="200" height="160" fill="gray"/%3E%3C/svg%3E' },
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
  return responses['/api/fms/robots']
}

test('Live Map selects an oriented chassis independently of hover and robot names', async ({ page }) => {
  await openLiveMap(page)
  const idle = page.getByRole('button', { name: 'AMR-07 · Idle', exact: true })
  const charging = page.getByRole('button', { name: 'AMR-12 · Charging', exact: true })
  const details = page.getByRole('button', { name: 'Robot details', exact: true })
  const mapWidth = () => idle.evaluate(marker => marker.ownerSVGElement.getBoundingClientRect().width)
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  const fullWidth = await mapWidth()
  await idle.click()
  const portrait = page.getByRole('img', { name: 'AMR-07 · Idle', exact: true })
  await expect(details).toHaveAttribute('aria-expanded', 'true')
  expect(await mapWidth()).toBeLessThan(fullWidth)
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

  await details.click()
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  await expect(portrait).toBeHidden()
  await expect(idle).toHaveAttribute('aria-pressed', 'true')
  expect(await mapWidth()).toBe(fullWidth)
  await details.click()
  await expect(portrait).toBeVisible()
  await page.getByRole('button', { name: 'Hide robot details' }).click()
  await expect(details).toBeFocused()
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  await charging.press('Enter')
  await expect(details).toHaveAttribute('aria-expanded', 'true')
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

test('Live Map covers the viewport with its grid and follows a moving robot', async ({ page }) => {
  const fleet = await openLiveMap(page)
  const first = page.getByRole('button', { name: 'AMR-07 · Idle', exact: true })
  const second = page.getByRole('button', { name: 'AMR-12 · Charging', exact: true })
  const grid = page.locator('rect[fill="url(#live-map-grid)"]')
  const image = page.locator('svg image').first()

  const centerOffset = marker => marker.evaluate(node => {
    const box = node.ownerSVGElement.getBoundingClientRect()
    const { e: x, f: y } = node.getScreenCTM()
    return Math.hypot(x - box.left - box.width / 2, y - box.top - box.height / 2)
  })
  const expectGridCoverage = () => expect.poll(() => grid.evaluate(node => {
    const viewport = node.ownerSVGElement.getBoundingClientRect()
    const bounds = node.getBoundingClientRect()
    return Math.max(bounds.left - viewport.left, viewport.right - bounds.right,
      bounds.top - viewport.top, viewport.bottom - bounds.bottom)
  })).toBeLessThan(1)
  const imageLeft = () => image.evaluate(node => node.getBoundingClientRect().left)

  await expect(first).toBeVisible()
  await expectGridCoverage()
  expect(await grid.evaluate(node => Boolean(
    node.ownerSVGElement.querySelector('image').compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
  ))).toBe(true)

  await first.click()
  await expect.poll(() => centerOffset(first)).toBeLessThan(2)
  await page.getByTitle('Zoom in', { exact: true }).click()
  await expect.poll(() => centerOffset(first)).toBeLessThan(2)
  await expectGridCoverage()
  const details = page.getByRole('button', { name: 'Robot details', exact: true })
  await details.click()
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(() => centerOffset(first)).toBeLessThan(2)
  await details.click()
  await expect(details).toHaveAttribute('aria-expanded', 'true')

  const beforeMove = await imageLeft()
  Object.assign(fleet[0].status.pose, { x: 7, y: 11 })
  await expect(page.getByText('7.00, 11.00 m', { exact: true })).toBeVisible()
  await expect.poll(() => centerOffset(first)).toBeLessThan(2)
  await expect.poll(imageLeft).toBeLessThan(beforeMove - 10)
  await expectGridCoverage()

  const start = await first.evaluate(node => {
    const { left, top } = node.ownerSVGElement.getBoundingClientRect()
    return { x: left + 16, y: top + 50 }
  })
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 64, start.y + 36, { steps: 6 })
  await page.mouse.up()
  await expect.poll(() => centerOffset(first)).toBeGreaterThan(40)
  const afterPan = await imageLeft()
  fleet[0].status.pose.x = 9
  await expect(page.getByText('9.00, 11.00 m', { exact: true })).toBeVisible()
  expect(await imageLeft()).toBeCloseTo(afterPan, 0)
  await expectGridCoverage()

  await second.press('Enter')
  await expect.poll(() => centerOffset(second)).toBeLessThan(2)
  await page.getByTitle('Fit to map', { exact: true }).click()
  await expect.poll(() => centerOffset(second)).toBeGreaterThan(20)
  await expectGridCoverage()
})
