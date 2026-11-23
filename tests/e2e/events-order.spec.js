import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Europe/Moscow' })

const alarm = {
  id: 'al-offline', title: 'Robot offline', detail: 'No connection to the robot',
  severity: 'CRITICAL', source: 'ROBOT', code: 'ROBOT_OFFLINE', robotId: 'AMR-07',
  missionId: null, active: true, createdAt: '2026-11-22T21:42:05.000Z',
  clearedAt: null, acknowledgedAt: null, acknowledgedBy: null,
}
const raised = {
  id: 2, at: alarm.createdAt, source: 'ALARM', type: 'RAISED', alarmId: alarm.id,
  robotId: alarm.robotId, missionId: null, severity: alarm.severity, code: alarm.code, title: alarm.title,
}
const saved = {
  id: 1, at: '2026-11-22T19:12:08.000Z', source: 'SYSTEM', type: 'MAP_SAVED',
  alarmId: null, robotId: null, missionId: null, mapId: 'workshop', version: 2,
}

async function expectTimestampFirst(page, title, iso, localTime) {
  const label = page.getByText(title, { exact: true })
  const row = label.locator('xpath=ancestor::li[1]')
  const time = row.locator('time').first()
  await expect(time).toBeVisible()
  await expect(time).toHaveAttribute('datetime', iso)
  const compact = text => text.replace(/[\s,]+/g, '')
  expect(compact(await time.innerText())).toBe(compact(localTime))
  const prefix = compact(localTime + title)
  expect(compact(await row.innerText()).slice(0, prefix.length)).toBe(prefix)
  const [stamp, event] = await Promise.all([time.boundingBox(), label.boundingBox()])
  expect(event.x >= stamp.x + stamp.width - 1 || event.y >= stamp.y + stamp.height - 1).toBe(true)
}

test('Events shows the local date and time before each alarm and journal entry', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-22T22:00:00.000Z'))
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: "window.__FLEET_CONFIG__ = { apiBaseUrl: '/api', useMocks: false, mqttUrl: '' }",
  }))
  await page.route('**/api/**', route => {
    const { pathname, searchParams } = new URL(route.request().url())
    const alarmId = searchParams.get('alarmId')
    const events = [raised, saved].filter(e => !alarmId || e.alarmId === alarmId)
    const responses = {
      '/api/health': { status: 'OK' },
      '/api/fms/robots': [],
      '/api/fms/maps': [],
      '/api/fms/alarms': { items: [alarm], nextCursor: null },
      '/api/fms/events': { items: events, nextCursor: null },
    }
    return Object.hasOwn(responses, pathname)
      ? route.fulfill({ json: responses[pathname] })
      : route.fulfill({ status: 404 })
  })

  await page.goto('events')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const today = '23/11/2026 00:42:05'
  await expectTimestampFirst(page, alarm.title, alarm.createdAt, today)
  await expect(page.getByText('Critical', { exact: true })).toBeVisible()
  const history = page.getByRole('button', { name: 'History', exact: true })
  await history.click()
  const raisedTitle = 'Alarm: Robot offline'
  await expectTimestampFirst(page, raisedTitle, raised.at, today)
  await expect(page.getByText('Map saved', { exact: true })).toHaveCount(0)
  await history.click()

  await page.locator('.n-tabs-tab').filter({ hasText: 'Journal' }).click()
  await expectTimestampFirst(page, raisedTitle, raised.at, today)
  await expectTimestampFirst(page, 'Map saved', saved.at, '22/11/2026 22:12:08')
})
