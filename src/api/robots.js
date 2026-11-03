import { request, getMockMode, withMockDelay } from './client'
import { RobotV2, RobotV2List, toViewRobot } from './schemas'
import * as mocks from './mocks/robots.mock'

/**
 * Robots API — контракт v2, раздел 5.2. Шлюз разводит запросы: GET — в базу fms, остальное — в control.
 * - GET    /fms/robots                  → Robot[]
 * - GET    /fms/robots/:id              → Robot
 * - POST   /fms/robots                  { id, name?, manufacturer, serialNumber, labels? } → 201 Robot
 * - PATCH  /fms/robots/:id              { name?, labels? } → Robot
 * - DELETE /fms/robots/:id[?force=true] → 202 Robot (lifecycle PENDING_DELETE); 409 ROBOT_BUSY без force
 * - POST   /fms/robots/:id/pause|resume → 202
 *
 * Наружу отдаём внутреннего робота (toViewRobot), а не ответ как есть.
 */

const path = (id) => `/fms/robots/${encodeURIComponent(id)}`

export async function listRobots() {
  if (getMockMode()) return withMockDelay(mocks.listRobots().map(toViewRobot))
  const robots = await request('GET', '/fms/robots', { schema: RobotV2List })
  return robots.map(toViewRobot)
}

export async function getRobot(id) {
  if (getMockMode()) return withMockDelay(toViewRobot(mocks.getRobot(id)))
  return toViewRobot(await request('GET', path(id), { schema: RobotV2 }))
}

export async function registerRobot({ id, name, manufacturer, serialNumber, labels }) {
  const body = { id, manufacturer, serialNumber }
  if (name) body.name = name
  if (labels) body.labels = labels
  if (getMockMode()) return withMockDelay(toViewRobot(mocks.registerRobot(body)))
  return toViewRobot(await request('POST', '/fms/robots', { body, schema: RobotV2 }))
}

export async function updateRobot(id, { name, labels }) {
  const body = {}
  if (name !== undefined) body.name = name
  if (labels !== undefined) body.labels = labels
  if (getMockMode()) return withMockDelay(toViewRobot(mocks.updateRobot(id, body)))
  return toViewRobot(await request('PATCH', path(id), { body, schema: RobotV2 }))
}

// force: удалить, даже если у робота миссия (миссия отменяется)
export async function deleteRobot(id, { force = false } = {}) {
  if (getMockMode()) return withMockDelay(toViewRobot(mocks.deleteRobot(id, force)))
  const query = force ? { force: 'true' } : undefined
  return toViewRobot(await request('DELETE', path(id), { query, schema: RobotV2 }))
}

// 202 — команда отправлена; результат виден в status.paused при следующем опросе
export async function pauseRobot(id) {
  if (getMockMode()) return withMockDelay(mocks.setPaused(id, true))
  return request('POST', `${path(id)}/pause`)
}

export async function resumeRobot(id) {
  if (getMockMode()) return withMockDelay(mocks.setPaused(id, false))
  return request('POST', `${path(id)}/resume`)
}
