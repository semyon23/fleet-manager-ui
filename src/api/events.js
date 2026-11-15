import { request, getMockMode, withMockDelay } from './client'
import { EventPage } from './schemas'
import * as mocks from './mocks/events.mock'

/**
 * Журнал — контракт v2, раздел 8.4. База fms.
 * - GET /fms/events?source=&type=&robotId=&missionId=&alarmId=&from=&to=&limit=&before= → { items, nextCursor }
 */
export async function listEvents(filter = {}) {
  const query = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  if (getMockMode()) return withMockDelay(mocks.listEvents(query))
  return request('GET', '/fms/events', { query, schema: EventPage })
}
