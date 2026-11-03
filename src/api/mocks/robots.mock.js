import { ApiError } from '../client'

/**
 * Мок роботов в формате контракта v2 (Robot, раздел 5.1). Стартуем с пустого fleet
 * (без демо-роботов, фидбек Семёна 2026-08-31) — роботов регистрируют через UI, как в real.
 * Зарегистрированный робот «на связи и готов», чтобы в mock-режиме было что показать.
 */
const MOCK_ROBOTS = []

function find(id) {
  const robot = MOCK_ROBOTS.find((r) => r.id === id)
  if (!robot) throw new ApiError(404, 'NOT_FOUND', `robot ${id} not found`)
  return robot
}

const copy = (robot) => structuredClone(robot)

export function listRobots() {
  return MOCK_ROBOTS.map(copy)
}

export function getRobot(id) {
  return copy(find(id))
}

export function registerRobot({ id, name, manufacturer, serialNumber, labels }) {
  if (MOCK_ROBOTS.some((r) => r.id === id || (r.manufacturer === manufacturer && r.serialNumber === serialNumber))) {
    throw new ApiError(409, 'ALREADY_EXISTS', 'robot_id or manufacturer + serial_number already registered')
  }
  const now = new Date().toISOString()
  const robot = {
    id,
    name: name || id,
    manufacturer,
    serialNumber,
    labels: labels || {},
    lifecycle: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    status: {
      connection: 'ONLINE', operatingMode: 'AUTOMATIC',
      pose: { x: 0, y: 0, theta: 0, mapId: '' }, localized: true, lastNodeId: '',
      driving: false, paused: false,
      power: { stateOfCharge: 80, charging: false, voltage: 48, range: null },
      safety: { emergencyStop: 'NONE', fieldViolation: false },
      errors: [], loads: [], missionId: null,
      factsheetReceivedAt: now, lastStateAt: now,
    },
    availability: { state: 'IDLE', reasons: [] },
    graphPosition: null,
    info: null,
  }
  MOCK_ROBOTS.push(robot)
  return copy(robot)
}

export function updateRobot(id, { name, labels }) {
  const robot = find(id)
  if (name !== undefined) robot.name = name || robot.id
  if (labels !== undefined) robot.labels = labels
  robot.updatedAt = new Date().toISOString()
  return copy(robot)
}

export function deleteRobot(id, force) {
  const robot = find(id)
  if (robot.status.missionId && !force) {
    throw new ApiError(409, 'ROBOT_BUSY', `robot ${id} is executing mission ${robot.status.missionId}`)
  }
  MOCK_ROBOTS.splice(MOCK_ROBOTS.indexOf(robot), 1)
  return { ...copy(robot), lifecycle: 'PENDING_DELETE', availability: { state: 'DELETING', reasons: [] } }
}

export function setPaused(id, paused) {
  const robot = find(id)
  robot.status.paused = paused
  robot.availability = { state: paused ? 'PAUSED' : 'IDLE', reasons: [] }
  return {}
}
