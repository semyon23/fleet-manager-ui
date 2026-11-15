/**
 * Мок журнала (контракт 8.4): события тревог мока и события миссий мока (их пишет missions.mock).
 * Роботы в моке событий не пишут.
 */
const MOCK_EVENTS = []
let lastId = 0

// fields: { source, type, robotId?, missionId?, alarmId?, ...поля type }
export function addEvent(fields) {
  MOCK_EVENTS.push({ id: ++lastId, at: new Date().toISOString(), robotId: null, missionId: null, alarmId: null, ...fields })
}

export function listEvents({ source, type, robotId, missionId, alarmId, from, to, limit = 50, before } = {}) {
  const sources = source ? String(source).split(',') : null
  const types = type ? String(type).split(',') : null
  const items = MOCK_EVENTS
    .filter((e) => !sources || sources.includes(e.source))
    .filter((e) => !types || types.includes(e.type))
    .filter((e) => !robotId || e.robotId === robotId)
    .filter((e) => !missionId || e.missionId === missionId)
    .filter((e) => !alarmId || e.alarmId === alarmId)
    .filter((e) => !from || e.at >= new Date(from).toISOString())
    .filter((e) => !to || e.at < new Date(to).toISOString())
    .filter((e) => !before || e.id < Number(before))
    .sort((a, b) => b.id - a.id)
  const page = items.slice(0, Number(limit))
  return { items: structuredClone(page), nextCursor: items.length > page.length ? String(page.at(-1).id) : null }
}
