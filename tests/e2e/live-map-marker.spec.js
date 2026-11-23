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

async function openLiveMap(page, fleet = [robot('AMR-07', 'IDLE', 4, Math.PI / 2), robot('AMR-12', 'CHARGING', 16, 0)],
                           { waypoints = [], edges = [], routes = [], missions = [] } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: "window.__FLEET_CONFIG__ = { apiBaseUrl: '/api', useMocks: false, mqttUrl: '' }",
  }))
  const responses = {
    '/api/health': { status: 'OK' },
    '/api/fms/maps': [map],
    '/api/fms/maps/workshop': { ...map, waypoints, edges, pgmDataUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="160"%3E%3Crect width="200" height="160" fill="gray"/%3E%3C/svg%3E' },
    '/api/fms/robots': fleet,
    '/api/fms/routes': { items: routes },
    '/api/fms/alarms': { items: [], nextCursor: null },
  }
  for (const mission of missions) responses[`/api/fms/missions/${mission.id}`] = mission
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
  await expect(idle.locator('.robot-chassis path[fill="#305df4"]')).toBeVisible()
  await expect(idle.locator('.robot-status-light')).toHaveAttribute('fill', '#22c55e')
  await expect(charging.locator('.robot-status-light')).toHaveAttribute('fill', '#eab308')
  await expect(idle.locator('.robot-hub')).toBeVisible()
  await expect(idle.locator('.robot-heading')).toHaveAttribute('fill', '#f7f8f9')
  await expect(idle.locator('.robot-mission text')).toHaveText('No mission')

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

test('Live Map shows reported loads independently of missions and updates the selected portrait', async ({ page }) => {
  const loaded = robot('AMR-07', 'OFFLINE', 4, 0)
  // Driving in the last offline snapshot must not show current movement.
  Object.assign(loaded.status, { connection: 'OFFLINE', driving: true, loads: [{ loadId: '', loadType: '' }] })
  const busy = robot('AMR-12', 'BUSY', 16, 0)
  Object.assign(busy.status, { missionId: 'M-102', loads: [] })
  await openLiveMap(page, [loaded, busy])

  const offline = page.getByRole('button', { name: 'AMR-07 · Offline', exact: true })
  const onMission = page.getByRole('button', { name: 'AMR-12 · Busy', exact: true })
  const details = page.locator('#live-map-robot-details')
  await expect(offline.locator('.robot-load')).toBeVisible()
  await expect(offline.locator('.robot-hub')).toHaveCount(0)
  await expect(offline.locator('.robot-heading')).toHaveAttribute('fill', '#f7f8f9')
  await expect(onMission.locator('.robot-load')).toHaveCount(0)
  await expect(onMission.locator('.robot-heading')).toHaveAttribute('fill', '#f7f8f9')
  await expect(onMission.locator('.robot-mission text')).toHaveText('M-102')
  const roster = page.getByRole('button', { name: 'Robots (2)', exact: true })
  await roster.click()
  const search = page.getByRole('searchbox', { name: 'Search robots by ID' })
  await search.fill('amr-07')
  const results = page.getByRole('list', { name: 'Fleet robots' })
  await expect(results.getByRole('button')).toHaveCount(1)
  await results.getByRole('button').click()
  await expect(offline).toHaveAttribute('aria-pressed', 'true')
  await search.press('Escape')
  await expect(roster).toHaveAttribute('aria-expanded', 'false')
  await expect(details.locator('.robot-load')).toBeVisible()
  await expect(details.getByText('Last reported load', { exact: true })).toBeVisible()
  await expect(details.getByText('Load reported', { exact: true })).toBeVisible()

  await onMission.press('Enter')
  await expect(onMission.locator('.robot-mission text')).toHaveText('M-102')
  await expect(details.getByText('No load reported')).toBeVisible()
  await page.getByRole('button', { name: /^Layers/ }).click()
  await page.getByRole('checkbox', { name: 'Robot names' }).click()
  await expect(page.locator('.robot-mission')).toHaveCount(0)
  await expect(offline.locator('.robot-load')).toBeVisible()

  busy.status.driving = true
  busy.status.loads = [{ loadId: 'PAL-41', loadType: 'EUR' }, { loadId: 'BOX-12', loadType: '' }]
  await expect(onMission.locator('.robot-load')).toBeVisible()
  await expect(onMission.locator('.robot-hub')).toHaveCount(0)
  await expect(onMission.locator('.robot-heading')).toHaveAttribute('fill', '#94e87d')
  await expect(details.locator('.robot-heading')).toHaveAttribute('fill', '#94e87d')
  await expect(details.locator('.robot-load')).toBeVisible()
  await expect(details.getByText('ID · PAL-41')).toBeVisible()
  await expect(details.getByText('Type · EUR')).toBeVisible()
  await expect(details.getByText('ID · BOX-12')).toBeVisible()
  busy.status.loads = []
  await expect(onMission.locator('.robot-load')).toHaveCount(0)
  await expect(details.locator('.robot-load')).toHaveCount(0)
  await expect(onMission.locator('.robot-hub')).toBeVisible()
})

test('Live Map diagnoses the selected robot from its current mission and hides stale error hints', async ({ page }) => {
  const waiting = robot('AMR-07', 'BUSY', 4, 0)
  waiting.status.missionId = 'M-184'
  const stateAt = waiting.status.lastStateAt
  const missionAt = '2026-01-01T12:00:03Z'
  const mission = {
    id: 'M-184', name: 'Deliver to dock', mapId: map.id, priority: 'NORMAL', state: 'RUNNING',
    requestedRobotId: null, robotId: waiting.id, currentStep: 1, steps: [{ nodeId: 'N-11' }, { nodeId: 'N-23' }],
    stepStates: [
      { state: 'COMPLETED', startedAt: stateAt, finishedAt: stateAt, waitingForTraffic: false },
      { state: 'RUNNING', startedAt: stateAt, finishedAt: null, waitingForTraffic: true },
    ],
    error: null, createdBy: null, createdAt: stateAt, assignedAt: stateAt, startedAt: stateAt,
    updatedAt: missionAt, finishedAt: null,
  }
  const faulted = robot('AMR-12', 'ERROR', 16, 0)
  const error = { errorType: 'LIFT_ENCODER', level: 'CRITICAL', description: 'Lift encoder signal lost',
    hint: 'Inspect the encoder connector.' }
  faulted.status.errors = [error]
  await openLiveMap(page, [waiting, faulted], { missions: [mission] })

  const diagnostics = page.getByRole('region', { name: 'Robot diagnostics' })
  const traffic = diagnostics.getByText('Waiting for traffic clearance', { exact: true })
  await page.getByRole('button', { name: 'AMR-07 · Busy', exact: true }).press('Enter')
  await expect(traffic).toBeVisible()
  await expect(diagnostics).toContainText('M-184')
  await expect(diagnostics).toContainText('N-23')
  await expect(diagnostics.locator(`time[datetime="${stateAt}"]`)).toBeVisible()
  await expect(diagnostics.locator(`time[datetime="${missionAt}"]`)).toBeVisible()

  await page.getByRole('button', { name: 'AMR-12 · Error', exact: true }).press('Enter')
  await expect(diagnostics).toContainText(error.errorType)
  await expect(diagnostics).toContainText(error.description)
  await expect(diagnostics).toContainText(error.hint)
  await expect(traffic).toHaveCount(0)
  await expect(diagnostics).not.toContainText('M-184')

  faulted.availability.state = 'OFFLINE'
  faulted.status.connection = 'OFFLINE'
  await expect(diagnostics.getByText('Robot connection lost', { exact: true })).toBeVisible()
  await expect(diagnostics).not.toContainText(error.hint)
  await expect(diagnostics.locator(`time[datetime="${stateAt}"]`)).toBeVisible()
})

test('Live Map distinguishes road directions and released and planned routes for each robot', async ({ page }) => {
  const fleet = [robot('AMR-07', 'BUSY', 4, 0), robot('AMR-12', 'BUSY', 5, 0)]
  fleet[0].status.missionId = 'M-184'
  fleet[1].status.missionId = 'M-191'
  const waypoints = [
    { id: 'A', u: 20, v: 80 }, { id: 'B', u: 95, v: 105 }, { id: 'C', u: 165, v: 70 },
  ]
  const edges = [
    { id: 'ab', from: 'A', to: 'B' }, { id: 'ba', from: 'B', to: 'A' }, { id: 'bc', from: 'B', to: 'C' },
  ]
  const routes = fleet.map(r => ({
    robotId: r.id, mapId: map.id, missionId: r.status.missionId, stepIndex: 0,
    released: { nodes: ['A', 'B'], edges: ['ab'] }, planned: { nodes: ['B', 'C'], edges: ['bc'] },
    goals: ['C'], nextMissionId: null,
  }))
  await openLiveMap(page, fleet, { waypoints, edges, routes })

  await expect(page.locator('.map-road[data-two-way="true"]')).toHaveCount(1)
  await expect(page.locator('.map-road[data-two-way="false"]')).toHaveCount(1)
  await expect(page.locator('.road-direction').first()).toBeVisible()
  const first = page.locator('.fleet-route[data-robot-id="AMR-07"]')
  const second = page.locator('.fleet-route[data-robot-id="AMR-12"]')
  const released = first.locator('.route-released')
  const planned = first.locator('.route-planned')
  await expect(released).toBeVisible()
  await expect(planned).toBeVisible()
  await expect(released).toHaveCSS('stroke-dasharray', 'none')
  await expect(planned).not.toHaveCSS('stroke-dasharray', 'none')
  const color = await released.evaluate(line => getComputedStyle(line).stroke)
  await expect(planned).toHaveCSS('stroke', color)
  await expect(second.locator('.route-released')).not.toHaveCSS('stroke', color)
  const releasedEnd = (await released.getAttribute('points')).trim().split(/\s+/).at(-1)
  expect((await planned.getAttribute('points')).trim().split(/\s+/)[0]).toBe(releasedEnd)

  await page.getByRole('button', { name: 'AMR-07 · Busy', exact: true }).press('Enter')
  await expect(page.locator('.fleet-route').last()).toHaveAttribute('data-robot-id', 'AMR-07')
  const routeOpacity = element => element.evaluate(group => Number(getComputedStyle(group).opacity))
  expect(await routeOpacity(first)).toBeGreaterThan(await routeOpacity(second))
  // A new availability state changes the robot status indicator, independently of its route color.
  fleet[0].availability.state = 'PAUSED'
  await expect(page.getByRole('button', { name: 'AMR-07 · Paused', exact: true })).toBeVisible()
  await expect(released).toHaveCSS('stroke', color)

  await page.getByRole('button', { name: /^Layers/ }).click()
  await page.getByRole('checkbox', { name: 'Planned by traffic (waiting for release)' }).click()
  await expect(planned).toHaveCount(0)
  await expect(released).toBeVisible()
  await page.getByRole('checkbox', { name: 'Roads', exact: true }).click()
  await expect(page.locator('.map-road')).toHaveCount(0)
  await expect(released).toBeVisible()
  await page.getByRole('checkbox', { name: 'Routes from fms (released)' }).click()
  await expect(released).toHaveCount(0)
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
