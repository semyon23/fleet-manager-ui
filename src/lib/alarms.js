/**
 * Тревоги (контракт 8): цвета и порядок важности, порядок списка, значок в шапке. Без Vue — для unit-тестов.
 */
export const SEVERITY = {
  CRITICAL: { label: 'Critical', color: '#dc2626', rank: 3 },
  ERROR: { label: 'Error', color: '#ef4444', rank: 2 },
  WARNING: { label: 'Warning', color: '#eab308', rank: 1 },
  INFO: { label: 'Info', color: '#3b82f6', rank: 0 },
}
const UNKNOWN = { label: 'Unknown', color: '#94a3b8', rank: -1 }

export const severityOf = (alarm) => SEVERITY[alarm?.severity] || UNKNOWN

// Вкладка Alarms = неподтверждённые ∪ активные (8.3) — два запроса, объединить по id
export function mergeById(...lists) {
  return [...new Map(lists.flat().map((a) => [a.id, a])).values()]
}

// Сверху — горящие и неподтверждённые, потом по важности, потом новые
export function sortAlarms(alarms) {
  const attention = (a) => (a.active ? 2 : 0) + (a.acknowledgedAt ? 0 : 1)
  return [...alarms].sort((a, b) =>
    attention(b) - attention(a) ||
    severityOf(b).rank - severityOf(a).rank ||
    b.createdAt.localeCompare(a.createdAt))
}

// Значок в шапке: сколько неподтверждённых и самая серьёзная из них; нет — null
export function badgeOf(alarms) {
  const unacked = alarms.filter((a) => !a.acknowledgedAt)
  if (!unacked.length) return null
  const worst = unacked.reduce((w, a) => (severityOf(a).rank > severityOf(w).rank ? a : w))
  return { count: unacked.length, color: severityOf(worst).color, severity: worst.severity }
}

// Короткое состояние для карточки тревоги
export function statusOf(alarm) {
  if (alarm.active) return alarm.acknowledgedAt ? 'Active · acknowledged' : 'Active'
  return alarm.acknowledgedAt ? 'Closed' : 'Cleared · not acknowledged'
}
