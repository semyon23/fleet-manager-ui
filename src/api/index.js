/**
 * Единая точка входа API-слоя Fleet Manager.
 *
 * Использование:
 *   import { maps, robots } from '@/api'
 *   const list = await maps.listMaps()
 *
 * Мок-режим включается в Settings экране или через
 * localStorage.setItem('fm.api.useMocks', '0')
 */

export * as auth from './auth'
export * as maps from './maps'
export * as robots from './robots'
export * as missions from './missions'
export * as routes from './routes'
export * as alarms from './alarms'
export * as events from './events'

export {
  ApiError,
  getBaseUrl,
  getMockMode,
  setMockMode,
  getToken,
  setToken,
} from './client'
