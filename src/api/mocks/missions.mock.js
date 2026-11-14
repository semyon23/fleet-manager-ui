import { ApiError } from '../client'
import * as maps from './maps.mock'

/**
 * Мок миссий в формате контракта v2 (раздел 7). Стартуем с пустого списка. Миссии в моке не едут:
 * роботов им не назначают, они остаются QUEUED, пока их не отменят. Проверки при создании —
 * как в control, только основные: поля, карта, узлы шагов.
 */
const MOCK_MISSIONS = []
const MOCK_EVENTS = []
let eventId = 0

const copy = (x) => structuredClone(x)
const nowIso = () => new Date().toISOString()

function find(id) {
  const mission = MOCK_MISSIONS.find((m) => m.id === id)
  if (!mission) throw new ApiError(404, 'NOT_FOUND', `mission ${id} not found`)
  return mission
}

function addEvent(mission, fields) {
  MOCK_EVENTS.push({ id: ++eventId, missionId: mission.id, at: mission.updatedAt, robotId: mission.robotId, ...fields })
}

export function listMissions({ state, robotId, mapId, from, to, limit = 50, before } = {}) {
  const states = state ? String(state).split(',') : null
  let items = MOCK_MISSIONS
    .filter((m) => !states || states.includes(m.state))
    .filter((m) => !robotId || m.robotId === robotId)
    .filter((m) => !mapId || m.mapId === mapId)
    .filter((m) => !from || m.createdAt >= new Date(from).toISOString())
    .filter((m) => !to || m.createdAt < new Date(to).toISOString())
    .sort((a, b) => (a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt)))
  if (before) {
    const at = items.findIndex((m) => `${Date.parse(m.createdAt)}:${m.id}` === before)
    items = at >= 0 ? items.slice(at + 1) : items
  }
  const page = items.slice(0, Number(limit))
  const nextCursor = items.length > page.length ? `${Date.parse(page.at(-1).createdAt)}:${page.at(-1).id}` : null
  return { items: copy(page), nextCursor }
}

export function getMission(id) {
  return copy(find(id))
}

export function listMissionEvents(id) {
  find(id)
  return copy(MOCK_EVENTS.filter((e) => e.missionId === id))
}

export function createMission(body) {
  const details = {}
  if (!body.name?.trim()) details.name = 'required: a non-empty string'
  if (!body.mapId) details.mapId = 'required'
  if (!Array.isArray(body.steps) || !body.steps.length) details.steps = 'required: at least one step {nodeId, actions?}'
  ;(body.steps || []).forEach((step, i) => {
    if (!step.nodeId) details[`steps[${i}].nodeId`] = 'required: a node id of the map'
    ;(step.actions || []).forEach((a, j) => {
      if (!a.actionType) details[`steps[${i}].actions[${j}].actionType`] = 'required: a non-empty string'
    })
  })
  if (Object.keys(details).length) throw new ApiError(400, 'INVALID_INPUT', 'some fields are invalid', details)

  const map = maps.listMaps().some((m) => m.id === body.mapId) ? maps.getMap(body.mapId) : null
  if (!map) throw new ApiError(400, 'INVALID_INPUT', 'some fields are invalid', { mapId: `map ${body.mapId} not found` })
  const nodes = new Set([...(map.waypoints || []), ...(map.stations || [])].map((n) => n.id))
  body.steps.forEach((step, i) => {
    if (!nodes.has(step.nodeId)) details[`steps[${i}].nodeId`] = `no node ${step.nodeId} on map ${body.mapId}`
  })
  if (Object.keys(details).length) throw new ApiError(400, 'INVALID_INPUT', 'some fields are invalid', details)

  const now = nowIso()
  const mission = {
    id: 'm-' + Math.random().toString(36).slice(2, 10).padEnd(8, '0'),
    name: body.name,
    mapId: body.mapId,
    priority: body.priority || 'NORMAL',
    requestedRobotId: body.requestedRobotId || null,
    robotId: null,
    steps: body.steps.map((s) => ({ nodeId: s.nodeId, actions: s.actions || [] })),
    state: 'QUEUED',
    currentStep: null,
    stepStates: body.steps.map(() => ({ state: 'PENDING', startedAt: null, finishedAt: null, waitingForTraffic: false, actions: [] })),
    error: null,
    createdAt: now, assignedAt: null, startedAt: null, finishedAt: null, updatedAt: now,
    createdBy: null,
  }
  MOCK_MISSIONS.push(mission)
  addEvent(mission, { type: 'STATE', state: 'QUEUED' })
  return copy(mission)
}

export function cancelMission(id) {
  const mission = find(id)
  if (['COMPLETED', 'FAILED', 'CANCELED'].includes(mission.state)) {
    throw new ApiError(409, 'INVALID_STATE', `mission ${id} is already ${mission.state}`)
  }
  const now = nowIso()
  mission.state = 'CANCELED'
  mission.finishedAt = now
  mission.updatedAt = now
  mission.stepStates.forEach((s) => { s.state = 'CANCELED' })
  addEvent(mission, { type: 'STATE', state: 'CANCELED', reason: 'canceled by operator' })
  return copy(mission)
}
