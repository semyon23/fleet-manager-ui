import { request, getMockMode, withMockDelay } from './client'
import { MapEntity, MapSummaryList } from './schemas'
import * as mocks from './mocks/maps.mock'

/**
 * Карты (контракт, раздел 6). GET отвечает база fms, изменения — control; в mock-режиме — maps.mock.js
 * с теми же правилами (версия, 409 VERSION_CONFLICT).
 * - GET    /fms/maps        → MapSummary[] (без waypoints, edges, zones, pgmDataUrl)
 * - GET    /fms/maps/:id    → Map целиком
 * - POST   /fms/maps        → 201 Map; id необязателен (= mapId роботов), иначе сгенерирует сервер
 * - PATCH  /fms/maps/:id    → Map; обязательно { version } — та, что загрузили; иначе 409 VERSION_CONFLICT
 * - DELETE /fms/maps/:id    → 204; 409 INVALID_STATE, если на карте стоят роботы
 */

export async function listMaps() {
  if (getMockMode()) return withMockDelay(mocks.listMaps())
  return request('GET', '/fms/maps', { schema: MapSummaryList })
}

export async function getMap(id) {
  if (getMockMode()) return withMockDelay(mocks.getMap(id))
  return request('GET', `/fms/maps/${encodeURIComponent(id)}`, { schema: MapEntity })
}

export async function createMap(payload) {
  if (getMockMode()) return withMockDelay(mocks.createMap(payload))
  return request('POST', '/fms/maps', { body: payload, schema: MapEntity })
}

export async function updateMap(id, patch) {
  if (getMockMode()) return withMockDelay(mocks.updateMap(id, patch))
  return request('PATCH', `/fms/maps/${encodeURIComponent(id)}`, { body: patch, schema: MapEntity })
}

export async function deleteMap(id) {
  if (getMockMode()) return withMockDelay(mocks.deleteMap(id))
  return request('DELETE', `/fms/maps/${encodeURIComponent(id)}`)
}
