import { request, getMockMode, withMockDelay } from './client'
import { Alarm, AlarmPage } from './schemas'
import * as mocks from './mocks/alarms.mock'

/**
 * Тревоги — контракт v2, раздел 8.3. GET — база fms, ack — control.
 * - GET  /fms/alarms?active=&acknowledged=&robotId=&severity=&limit=&before= → { items, nextCursor }
 * - GET  /fms/alarms/:id      → Alarm
 * - POST /fms/alarms/:id/ack  → Alarm; закрытая или неизвестная — 404
 */

const clean = (filter) => Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined && v !== null && v !== ''))

export async function listAlarms(filter = {}) {
  const query = clean(filter)
  if (getMockMode()) return withMockDelay(mocks.listAlarms(query))
  return request('GET', '/fms/alarms', { query, schema: AlarmPage })
}

export async function getAlarm(id) {
  if (getMockMode()) return withMockDelay(mocks.getAlarm(id))
  return request('GET', `/fms/alarms/${encodeURIComponent(id)}`, { schema: Alarm })
}

export async function ackAlarm(id) {
  if (getMockMode()) return withMockDelay(mocks.ackAlarm(id))
  return request('POST', `/fms/alarms/${encodeURIComponent(id)}/ack`, { schema: Alarm })
}
