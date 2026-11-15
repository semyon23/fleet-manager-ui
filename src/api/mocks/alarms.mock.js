import { ApiError } from '../client'
import { addEvent } from './events.mock'

/**
 * Мок тревог (контракт 8). Стартуем с пустого списка: тревоги поднимает fms, в моке их создаёт только
 * raiseAlarm (для проверки экрана из консоли). Ack — как в control: активная остаётся активной.
 */
const MOCK_ALARMS = []
const copy = (x) => structuredClone(x)

export function raiseAlarm({ code = 'ROBOT_OFFLINE', severity = 'ERROR', robotId = null, title = 'Robot offline', detail = '' } = {}) {
  const alarm = {
    id: 'al-' + Math.random().toString(36).slice(2, 10).padEnd(8, '0'),
    severity, source: robotId ? 'ROBOT' : 'SYSTEM', code, title, detail: detail || `${robotId || 'fms'}: ${title}`,
    robotId, missionId: null, active: true, createdAt: new Date().toISOString(),
    clearedAt: null, acknowledgedAt: null, acknowledgedBy: null,
  }
  MOCK_ALARMS.push(alarm)
  addEvent({ source: 'ALARM', type: 'RAISED', robotId, alarmId: alarm.id, code, severity, title })
  return copy(alarm)
}

export function clearAlarm(id) {
  const alarm = MOCK_ALARMS.find((a) => a.id === id)
  if (!alarm) return null
  alarm.active = false
  alarm.clearedAt = new Date().toISOString()
  addEvent({ source: 'ALARM', type: 'CLEARED', robotId: alarm.robotId, alarmId: id, code: alarm.code, severity: alarm.severity, title: alarm.title })
  return copy(alarm)
}

export function listAlarms({ active, acknowledged, robotId, severity, limit = 50 } = {}) {
  const severities = severity ? String(severity).split(',') : null
  const items = MOCK_ALARMS
    .filter((a) => active === undefined || String(a.active) === String(active))
    .filter((a) => acknowledged === undefined || String(!!a.acknowledgedAt) === String(acknowledged))
    .filter((a) => !robotId || a.robotId === robotId)
    .filter((a) => !severities || severities.includes(a.severity))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { items: copy(items.slice(0, Number(limit))), nextCursor: null }
}

export function getAlarm(id) {
  const alarm = MOCK_ALARMS.find((a) => a.id === id)
  if (!alarm) throw new ApiError(404, 'NOT_FOUND', `alarm ${id} not found`)
  return copy(alarm)
}

export function ackAlarm(id) {
  const alarm = MOCK_ALARMS.find((a) => a.id === id)
  if (!alarm || (alarm.acknowledgedAt && !alarm.active)) {
    throw new ApiError(404, 'NOT_FOUND', `no open alarm ${id}: unknown or already closed`)
  }
  if (!alarm.acknowledgedAt) {
    alarm.acknowledgedAt = new Date().toISOString()
    addEvent({ source: 'ALARM', type: 'ACKED', robotId: alarm.robotId, alarmId: id, code: alarm.code, severity: alarm.severity, title: alarm.title })
  }
  return copy(alarm)
}
