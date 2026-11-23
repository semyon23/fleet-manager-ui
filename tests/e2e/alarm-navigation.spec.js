import { expect, test } from '@playwright/test'

const stateAt = '2026-11-23T08:00:00.000Z'
const alarmAt = '2026-11-22T08:00:08.000Z'
const clearedAt = '2026-11-22T08:05:00.000Z'
const assembly = {
  id: 'assembly', name: 'Assembly', version: 1,
  width: 200, height: 160, meta: { resolution: 0.1, origin: [0, 0] },
}
const packing = { ...assembly, id: 'packing', name: 'Packing' }
const offline = {
  id: 'AMR-07', name: 'Packing robot', manufacturer: 'AMR', serialNumber: '07',
  lifecycle: 'ACTIVE', createdAt: stateAt, updatedAt: stateAt, graphPosition: null, info: null,
  availability: { state: 'OFFLINE' },
  status: {
    connection: 'CONNECTION_BROKEN', operatingMode: 'AUTOMATIC', localized: true,
    pose: { mapId: packing.id, x: 3, y: 4, theta: 0 }, lastNodeId: 'dock-2',
    missionId: 'm-current', driving: false, paused: false, lastStateAt: stateAt, factsheetReceivedAt: null,
    power: { stateOfCharge: 80, charging: false, voltage: null, range: null },
    safety: { emergencyStop: 'NONE', fieldViolation: false },
  },
}
const idle = {
  ...offline, id: 'AMR-01', name: 'Assembly robot', serialNumber: '01', availability: { state: 'IDLE' },
  status: { ...offline.status, connection: 'ONLINE', pose: { ...offline.status.pose, mapId: assembly.id }, missionId: null },
}
const alarm = {
  id: 'al-offline', title: 'Robot offline', detail: 'Connection lost', severity: 'ERROR', source: 'ROBOT',
  code: 'ROBOT_OFFLINE', robotId: offline.id, missionId: 'm-earlier', active: false, createdAt: alarmAt,
  clearedAt, acknowledgedAt: null, acknowledgedBy: null,
}
const serviceAlarm = {
  ...alarm, id: 'al-service', title: 'Dispatch offline', severity: 'CRITICAL', code: 'SERVICE_DOWN',
  source: 'SYSTEM', robotId: null, missionId: null, active: true, clearedAt: null,
}
const currentMission = {
  id: 'm-current', name: 'Deliver to packing', mapId: packing.id, state: 'RUNNING', priority: 'NORMAL',
  requestedRobotId: null, robotId: offline.id, steps: [{ nodeId: 'dock-2', actions: [] }], currentStep: 0,
  stepStates: [{ state: 'RUNNING', startedAt: stateAt, finishedAt: null }],
  error: null, createdBy: null, updatedAt: stateAt, createdAt: stateAt, assignedAt: stateAt,
  startedAt: stateAt, finishedAt: null,
}
const earlierMission = {
  ...currentMission, id: alarm.missionId, name: 'Previous pallet delivery', state: 'COMPLETED',
  createdAt: alarmAt, assignedAt: alarmAt, startedAt: alarmAt, finishedAt: clearedAt, updatedAt: clearedAt,
  stepStates: [{ state: 'COMPLETED', startedAt: alarmAt, finishedAt: clearedAt }],
}

async function openEvents(page, target = offline, robotAlarm = alarm) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: "window.__FLEET_CONFIG__ = { apiBaseUrl: '/api', useMocks: false, mqttUrl: '' }",
  }))
  const responses = {
    '/api/health': { status: 'OK' },
    '/api/fms/robots': [idle, target],
    ['/api/fms/robots/' + target.id]: target,
    '/api/fms/maps': [assembly, packing],
    '/api/fms/maps/assembly': assembly,
    '/api/fms/maps/packing': packing,
    '/api/fms/routes': { items: [] },
    '/api/fms/events': { items: [], nextCursor: null },
    '/api/fms/missions/m-current': currentMission,
    '/api/fms/missions/m-current/events': { items: [] },
    '/api/fms/missions/m-earlier': earlierMission,
    '/api/fms/missions/m-earlier/events': { items: [] },
  }
  await page.route('**/api/**', route => {
    const { pathname, searchParams } = new URL(route.request().url())
    if (pathname === '/api/fms/alarms') {
      const items = [robotAlarm, serviceAlarm].filter(a => !searchParams.get('active') || a.active)
      return route.fulfill({ json: { items, nextCursor: null } })
    }
    if (pathname === '/api/fms/missions') {
      const states = searchParams.get('state')?.split(',')
      const items = [currentMission, earlierMission].filter(m => !states || states.includes(m.state))
      return route.fulfill({ json: { items, nextCursor: null } })
    }
    return Object.hasOwn(responses, pathname) ? route.fulfill({ json: responses[pathname] }) : route.fulfill({ status: 404 })
  })
  await page.goto('events')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('an alarm opens the correct robot map and then its reported mission', async ({ page }) => {
  await openEvents(page)
  const row = page.getByRole('listitem').filter({ hasText: alarm.title })
  const systemRow = page.getByRole('listitem').filter({ hasText: serviceAlarm.title })
  await expect(systemRow).toBeVisible()
  await expect(systemRow.getByRole('link')).toHaveCount(0)
  const earlier = row.locator('a[href*="missionId="]')
  await expect(earlier).toHaveAttribute('href', /missionId=m-earlier(?:&|$)/)
  await earlier.click()
  await expect(page.getByRole('dialog')).toContainText(earlierMission.name)
  await page.goBack()

  await row.getByRole('link', { name: 'Show on map' }).click()
  await expect(page).toHaveURL(/\/live\?robotId=AMR-07$/)
  const marker = page.getByRole('button', { name: /^AMR-07 · Offline/ })
  await expect(marker).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'AMR-01 · Idle' })).toHaveCount(0)
  await expect.poll(() => marker.evaluate(node => {
    const map = node.ownerSVGElement.getBoundingClientRect()
    const { e: x, f: y } = node.getScreenCTM()
    return Math.hypot(x - map.left - map.width / 2, y - map.top - map.height / 2)
  })).toBeLessThan(2)
  const details = page.locator('#live-map-robot-details')
  await expect(details).toContainText(/last known position/i)
  await expect(details).toContainText('3.00, 4.00 m')
  await expect(details).toContainText('Last reported mission')
  await expect(details.locator('time')).toHaveAttribute('datetime', stateAt)
  const mission = details.getByRole('link', { name: /open mission/i })
  await expect(mission).toHaveAttribute('href', /missionId=m-current(?:&|$)/)
  await mission.click()
  await expect(page).toHaveURL(/\/missions\?missionId=m-current$/)
  await expect(page.getByRole('dialog')).toContainText(currentMission.name)
})

test('an alarm without a recorded mission or robot position opens details without a marker', async ({ page }) => {
  const unlocated = { ...offline, status: { ...offline.status, pose: null, localized: false, missionId: null } }
  await openEvents(page, unlocated, { ...alarm, missionId: null })
  const row = page.getByRole('listitem').filter({ hasText: alarm.title })
  await expect(row).toBeVisible()
  await expect(row.locator('a[href*="missionId="]')).toHaveCount(0)
  await row.getByRole('link', { name: 'Show on map' }).click()
  await expect(page).toHaveURL(/\/live\?robotId=AMR-07$/)
  await page.reload()
  const details = page.locator('#live-map-robot-details')
  await expect(details).toContainText(offline.id)
  await expect(details).toContainText(/position unavailable/i)
  await expect(details.getByRole('link', { name: /open mission/i })).toHaveCount(0)
  await expect(details).not.toContainText('0.00, 0.00 m')
  await expect(page.getByRole('button', { name: /^AMR-07 ·/ })).toHaveCount(0)
})
