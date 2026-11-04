import { ApiError } from '../client'

/**
 * Мок карт: «сервер» в localStorage (ключ fm.maps.v1) с правилами fms (контракт, раздел 6):
 * версия растёт при каждом сохранении, PATCH по чужой версии — 409 VERSION_CONFLICT,
 * список — без графа и картинки. Граф mock не проверяет. Карты, сохранённые раньше без версии, — версия 1.
 */

const LS_KEY = 'fm.maps.v1'
// Поля записи: их ставит сервер, в документ карты из запроса они не попадают
const RECORD_FIELDS = ['id', 'name', 'version', 'pgmDataUrl', 'createdAt', 'updatedAt', 'zoneSet']
const LISTS = ['waypoints', 'edges', 'stations', 'zones', 'assignedRobots']

function readAll() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw).map((m) => ({ version: 1, ...m })) : []
  } catch { return [] }
}
function writeAll(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}
function nowIso() { return new Date().toISOString() }
function newId() { return 'map-' + Math.random().toString(36).slice(2, 8) }

function find(list, id) {
  const map = list.find((m) => m.id === id)
  if (!map) throw new ApiError(404, 'NOT_FOUND', `map ${id} not found`)
  return map
}

function documentFields(body) {
  return Object.fromEntries(Object.entries(body).filter(([key]) => !RECORD_FIELDS.includes(key)))
}

export function listMaps() {
  return readAll().map(({ waypoints, edges, zones, pgmDataUrl, ...summary }) => summary)
}

export function getMap(id) {
  return find(readAll(), id)
}

export function createMap(payload) {
  const list = readAll()
  const id = payload.id || newId()
  if (list.some((m) => m.id === id)) throw new ApiError(409, 'ALREADY_EXISTS', `map ${id} already exists`)
  const now = nowIso()
  const map = {
    ...documentFields(payload),
    id,
    name: payload.name,
    version: 1,
    pgmDataUrl: payload.pgmDataUrl ?? null,
    createdAt: now,
    updatedAt: now,
  }
  for (const key of LISTS) map[key] = map[key] || []
  list.push(map)
  writeAll(list)
  return map
}

export function updateMap(id, patch) {
  if (!Number.isInteger(patch.version)) {
    throw new ApiError(400, 'INVALID_INPUT', 'some fields are invalid', { version: 'required: the version of the map you loaded' })
  }
  const list = readAll()
  const current = find(list, id)
  if (patch.version !== current.version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'the map was saved by someone else, reload it',
      { currentVersion: current.version })
  }
  const updated = {
    ...current,
    ...documentFields(patch),
    name: patch.name ?? current.name,
    version: current.version + 1,
    updatedAt: nowIso(),
  }
  if ('pgmDataUrl' in patch) updated.pgmDataUrl = patch.pgmDataUrl
  list[list.indexOf(current)] = updated
  writeAll(list)
  return updated
}

export function deleteMap(id) {
  const list = readAll()
  find(list, id)
  writeAll(list.filter((m) => m.id !== id))
  return null
}
