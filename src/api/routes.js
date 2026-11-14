import { request, getMockMode, withMockDelay } from './client'
import { RobotRouteList } from './schemas'

/**
 * Маршруты роботов — контракт v2, раздел 7.4. Отвечает fleet_control (маршруты в памяти, не в базе).
 * - GET /fms/routes?mapId= → { items: RobotRoute[] }; без mapId — все карты
 *
 * Мок: миссии в моках не едут — маршрутов нет.
 */
export async function listRoutes(mapId) {
  if (getMockMode()) return withMockDelay([])
  const query = mapId ? { mapId } : undefined
  const { items } = await request('GET', '/fms/routes', { query, schema: RobotRouteList })
  return items
}
