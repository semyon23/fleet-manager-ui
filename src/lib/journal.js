/**
 * Журнал (контракт 8.4): событие → строка ленты: заголовок, подробность, цвет точки.
 * События миссий — как в карточке миссии (formatEvent), только без её шагов: здесь миссии под рукой нет.
 */
import { formatEvent } from './missions'
import { AVAILABILITY } from './availability'
import { SEVERITY } from './alarms'

export const SOURCES = ['MISSION', 'ROBOT', 'ALARM', 'SYSTEM']

const dateTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23',
})

export function formatEventTime(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date)
}

const GRAY = '#94a3b8'
const CONNECTION = { ONLINE: '#22c55e', HIBERNATING: '#94a3b8' }   // остальное — потеря связи

function robotLine(e) {
  switch (e.type) {
    case 'CONNECTION':
      return { title: `Connection ${String(e.state).toLowerCase().replaceAll('_', ' ')}`, detail: '', color: CONNECTION[e.state] || '#ef4444' }
    case 'AVAILABILITY': {
      const meta = AVAILABILITY[e.state]
      return {
        title: meta ? meta.label : e.state,
        detail: (e.reasons || []).map((r) => r.message).join('; '),
        color: meta?.color || GRAY,
      }
    }
    case 'ERROR':
      return {
        title: `${e.cleared ? 'Error cleared' : 'Error'}: ${e.errorType}`,
        detail: [e.level, e.description].filter(Boolean).join(' · '),
        color: e.cleared ? '#22c55e' : (SEVERITY[{ URGENT: 'ERROR', FATAL: 'CRITICAL' }[e.level] || e.level]?.color || '#ef4444'),
      }
    case 'POSITION':
      return { title: 'Placed on node', detail: `${e.nodeId} · ${e.mapId}`, color: '#3b82f6' }
    case 'PAUSED':
      return { title: 'Paused by operator', detail: '', color: AVAILABILITY.PAUSED.color }
    case 'RESUMED':
      return { title: 'Resumed by operator', detail: '', color: '#3b82f6' }
    case 'REGISTERED':
      return { title: 'Registered', detail: `${e.manufacturer} · ${e.serialNumber}`, color: '#3b82f6' }
    case 'DELETED':
      return { title: 'Deleted', detail: e.canceledMission ? `mission ${e.canceledMission} canceled` : '', color: GRAY }
    default:
      return { title: e.type, detail: '', color: GRAY }
  }
}

function alarmLine(e) {
  const color = SEVERITY[e.severity]?.color || GRAY
  if (e.type === 'RAISED') return { title: `Alarm: ${e.title}`, detail: e.code, color }
  if (e.type === 'CLEARED') return { title: `Alarm cleared: ${e.title}`, detail: e.reason || '', color: '#22c55e' }
  if (e.type === 'ACKED') return { title: `Alarm acknowledged: ${e.title}`, detail: e.by ? `by ${e.by}` : '', color: GRAY }
  return { title: `Alarm ${e.type}`, detail: e.title || '', color }
}

function systemLine(e) {
  if (e.type === 'MAP_SAVED') {
    return { title: 'Map saved', detail: `${e.mapId} v${e.version}${e.forced ? ' · consequences accepted' : ''}`, color: '#3b82f6' }
  }
  if (e.type === 'MAP_DELETED') return { title: 'Map deleted', detail: e.mapId, color: GRAY }
  return { title: e.type, detail: '', color: GRAY }
}

// → { title, detail, color }; кто (робот, миссия) — в отдельных полях события, их показывает лента
export function formatJournalEvent(e) {
  if (e.source === 'MISSION') {
    const line = formatEvent(e, null)
    return { ...line, title: `Mission ${line.title.toLowerCase()}` }
  }
  if (e.source === 'ROBOT') return robotLine(e)
  if (e.source === 'ALARM') return alarmLine(e)
  return systemLine(e)
}
