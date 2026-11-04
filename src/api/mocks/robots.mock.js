import { ApiError } from '../client'
import { pixelToWorld } from '../../lib/nav2meta'
import * as maps from './maps.mock'

/**
 * Мок роботов в формате контракта v2 (Robot, раздел 5.1). Стартуем с пустого fleet
 * (без демо-роботов, фидбек Семёна 2026-08-31) — роботов регистрируют через UI, как в real.
 * Зарегистрированный робот на связи, но, как настоящий после включения, не на графе:
 * его ставят на узел (setPosition), тогда он Idle. Готовность — по правилам fms (availabilityOf).
 */
const MOCK_ROBOTS = []

function find(id) {
  const robot = MOCK_ROBOTS.find((r) => r.id === id)
  if (!robot) throw new ApiError(404, 'NOT_FOUND', `robot ${id} not found`)
  return robot
}

const copy = (robot) => structuredClone(robot)

// Узлы графа — waypoints и станции, как в control (maps/Graph.cpp)
function findNode(map, nodeId) {
  return [...(map.waypoints || []), ...(map.stations || [])].find((n) => n.id === nodeId) || null
}

// Как control (fleet/Availability.cpp), только то, что бывает в mock
function availabilityOf(robot) {
  const { status } = robot
  if (status.paused) return { state: 'PAUSED', reasons: [] }
  if (status.missionId) return { state: 'BUSY', reasons: [] }
  const mapId = status.pose.mapId
  const map = mapId ? maps.listMaps().find((m) => m.id === mapId) : null
  if (!map) {
    const message = mapId ? `robot map ${mapId} is not in fms: create the map with this id` : 'robot reports no mapId'
    return { state: 'NOT_READY', reasons: [{ code: 'UNKNOWN_MAP', message }] }
  }
  if (!findNode(maps.getMap(mapId), status.lastNodeId)) {
    return { state: 'NOT_READY', reasons: [{ code: 'NOT_ON_GRAPH', message: `robot is not on a node of map ${mapId}, set its position first` }] }
  }
  return { state: 'IDLE', reasons: [] }
}

function withAvailability(robot) {
  return { ...copy(robot), availability: availabilityOf(robot) }
}

export function listRobots() {
  return MOCK_ROBOTS.map(withAvailability)
}

export function getRobot(id) {
  return withAvailability(find(id))
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
      pose: { x: 0, y: 0, theta: 0, mapId: maps.listMaps()[0]?.id || '' }, localized: true, lastNodeId: '',
      driving: false, paused: false,
      power: { stateOfCharge: 80, charging: false, voltage: 48, range: null },
      safety: { emergencyStop: 'NONE', fieldViolation: false },
      errors: [], loads: [], missionId: null,
      factsheetReceivedAt: now, lastStateAt: now,
    },
    graphPosition: null,
    info: null,
  }
  MOCK_ROBOTS.push(robot)
  return withAvailability(robot)
}

export function updateRobot(id, { name, labels }) {
  const robot = find(id)
  if (name !== undefined) robot.name = name || robot.id
  if (labels !== undefined) robot.labels = labels
  robot.updatedAt = new Date().toISOString()
  return withAvailability(robot)
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
  find(id).status.paused = paused
  return {}
}

// Порядок проверок — как в control (api/RobotApi.cpp, set_position)
export function setPosition(id, { mapId, nodeId, theta }) {
  const errors = {}
  if (!mapId) errors.mapId = 'required'
  if (!nodeId) errors.nodeId = 'required'
  if (theta !== undefined && typeof theta !== 'number') errors.theta = 'must be a number, radians'
  if (Object.keys(errors).length) throw new ApiError(400, 'INVALID_INPUT', 'some fields are invalid', errors)

  const map = maps.getMap(mapId)   // нет — 404 NOT_FOUND
  const node = findNode(map, nodeId)
  if (!node) throw new ApiError(400, 'INVALID_INPUT', 'some fields are invalid', { nodeId: `no node ${nodeId} on map ${mapId}` })

  const robot = find(id)
  if (robot.status.missionId) {
    throw new ApiError(409, 'ROBOT_BUSY', `robot ${id} is executing mission ${robot.status.missionId}; cancel it first`)
  }
  if (robot.status.connection !== 'ONLINE') throw new ApiError(409, 'INVALID_STATE', `robot ${id} is not online`)

  const { x, y } = pixelToWorld(map.meta, node.u, node.v, map.height)
  robot.status.pose = { x, y, theta: theta ?? node.theta ?? robot.status.pose.theta, mapId }
  robot.status.lastNodeId = nodeId
  return {}
}
