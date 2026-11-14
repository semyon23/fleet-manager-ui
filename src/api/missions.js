import { request, getMockMode, withMockDelay } from './client'
import { Mission, MissionPage, MissionEventList } from './schemas'
import * as mocks from './mocks/missions.mock'

/**
 * Миссии — контракт v2, раздел 7. GET — база fms, POST — control.
 * - GET  /fms/missions?state=&robotId=&mapId=&from=&to=&limit=&before= → { items, nextCursor }
 * - GET  /fms/missions/:id                → Mission
 * - GET  /fms/missions/:id/events         → { items: MissionEvent[] }
 * - POST /fms/missions                    → 201 Mission (QUEUED); ошибки 400 с details по полям
 * - POST /fms/missions/:id/cancel         → 202 Mission (CANCELED или CANCELING)
 */

const path = (id) => `/fms/missions/${encodeURIComponent(id)}`

// filter: { state: 'A,B', robotId, mapId, from, to, limit, before }; пустые — не передаём
export async function listMissions(filter = {}) {
  const query = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  if (getMockMode()) return withMockDelay(mocks.listMissions(query))
  return request('GET', '/fms/missions', { query, schema: MissionPage })
}

export async function getMission(id) {
  if (getMockMode()) return withMockDelay(mocks.getMission(id))
  return request('GET', path(id), { schema: Mission })
}

export async function listMissionEvents(id) {
  if (getMockMode()) return withMockDelay(mocks.listMissionEvents(id))
  const { items } = await request('GET', `${path(id)}/events`, { schema: MissionEventList })
  return items
}

export async function createMission(body) {
  if (getMockMode()) return withMockDelay(mocks.createMission(body))
  return request('POST', '/fms/missions', { body, schema: Mission })
}

export async function cancelMission(id) {
  if (getMockMode()) return withMockDelay(mocks.cancelMission(id))
  return request('POST', `${path(id)}/cancel`, { schema: Mission })
}
