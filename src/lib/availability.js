/**
 * Готовность робота к работе — availability.state из контракта v2 (раздел 5.1). Считает fms,
 * UI только показывает: подпись, цвет, причины (availability.reasons — английский текст от сервера).
 */
export const AVAILABILITY = {
  IDLE: { label: 'Idle', color: '#22c55e' },
  BUSY: { label: 'Busy', color: '#3b82f6' },
  CHARGING: { label: 'Charging', color: '#eab308' },
  PAUSED: { label: 'Paused', color: '#a855f7' },
  NOT_READY: { label: 'Not ready', color: '#f97316' },
  ERROR: { label: 'Error', color: '#ef4444' },
  OFFLINE: { label: 'Offline', color: '#94a3b8' },
  DELETING: { label: 'Deleting', color: '#64748b' },
}

// availability ещё не посчитана (робот только что зарегистрирован)
const UNKNOWN = { label: 'Unknown', color: '#94a3b8' }

export function availabilityOf(robot) {
  return AVAILABILITY[robot?.availability?.state] || UNKNOWN
}

export const AVAILABILITY_OPTIONS = Object.entries(AVAILABILITY).map(([value, { label }]) => ({ label, value }))
