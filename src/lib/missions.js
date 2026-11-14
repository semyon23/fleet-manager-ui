/**
 * Миссии (контракт v2, раздел 7): подписи и цвета состояний, прогресс, запрос на создание,
 * ошибки создания по полям. Без Vue — проверяется unit-тестами.
 */

export const MISSION_STATES = {
  QUEUED: { label: 'Queued', color: '#94a3b8' },
  ASSIGNED: { label: 'Assigned', color: '#0ea5e9' },
  RUNNING: { label: 'Running', color: '#3b82f6' },
  PAUSED: { label: 'Paused', color: '#a855f7' },
  CANCELING: { label: 'Canceling', color: '#f97316' },
  COMPLETED: { label: 'Completed', color: '#22c55e' },
  FAILED: { label: 'Failed', color: '#ef4444' },
  CANCELED: { label: 'Canceled', color: '#64748b' },
}
export const ACTIVE_STATES = ['QUEUED', 'ASSIGNED', 'RUNNING', 'PAUSED', 'CANCELING']
export const FINISHED_STATES = ['COMPLETED', 'FAILED', 'CANCELED']

export const PRIORITIES = {
  LOW: { label: 'Low', color: '#94a3b8' },
  NORMAL: { label: 'Normal', color: '#64748b' },
  HIGH: { label: 'High', color: '#f97316' },
  CRITICAL: { label: 'Critical', color: '#ef4444' },
}

const UNKNOWN = { label: 'Unknown', color: '#94a3b8' }

export function stateOf(mission) {
  return MISSION_STATES[mission?.state] || UNKNOWN
}

export function isFinished(mission) {
  return FINISHED_STATES.includes(mission?.state)
}

// Отменить можно незавершённую; CANCELING уже отменяется
export function canCancel(mission) {
  return ACTIVE_STATES.includes(mission?.state) && mission.state !== 'CANCELING'
}

// Сколько шагов выполнено и куда робот едет сейчас
export function progressOf(mission) {
  const total = mission?.steps?.length || 0
  const done = (mission?.stepStates || []).filter((s) => s.state === 'COMPLETED').length
  const current = mission?.currentStep ?? null
  return { done, total, nodeId: current !== null ? mission.steps[current]?.nodeId ?? null : null }
}

/**
 * Форма мастера → тело POST /fms/missions (7.2). Пустое имя — время создания, «Any robot» — без
 * requestedRobotId. Действия — только поля контракта; параметры без ключа отбрасываются.
 */
export function toCreateRequest(form, now = new Date()) {
  const body = {
    name: form.name?.trim() || `Mission ${now.toTimeString().slice(0, 8)}`,   // местное время, как в таблице
    mapId: form.mapId,
    priority: form.priority || 'NORMAL',
    steps: (form.steps || []).map((step) => ({
      nodeId: step.nodeId,
      actions: (step.actions || []).map((a) => {
        const action = { actionType: (a.actionType || '').trim() }
        if (a.blockingType) action.blockingType = a.blockingType
        const params = (a.actionParameters || []).filter((p) => p.key?.trim())
        if (params.length) action.actionParameters = params.map((p) => ({ key: p.key.trim(), value: p.value }))
        return action
      }),
    })),
  }
  if (form.requestedRobotId) body.requestedRobotId = form.requestedRobotId
  return body
}

/**
 * Ошибка 400 INVALID_INPUT: details — { "путь до поля": "что не так" }. Ошибки шага i —
 * steps[i] и всё внутри него (steps[i].actions[0].actionType); остальное — форма целиком.
 */
export function stepErrors(details, index) {
  const prefix = `steps[${index}]`
  return Object.entries(details || {})
    .filter(([path]) => path === prefix || path.startsWith(`${prefix}.`))
    .map(([path, message]) => (path === prefix ? message : `${path.slice(prefix.length + 1)}: ${message}`))
}

export function formErrors(details) {
  return Object.entries(details || {})
    .filter(([path]) => !path.startsWith('steps['))
    .map(([path, message]) => `${path}: ${message}`)
}

// === Карточка и история (контракт 7.3) ===

// Длительность для людей: 42 s, 3 m 05 s, 1 h 12 m
export function formatDuration(ms) {
  if (ms === null || ms === undefined || ms < 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} m ${String(s % 60).padStart(2, '0')} s`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`
}

const between = (from, to) => (from && to ? Date.parse(to) - Date.parse(from) : null)

// Ждала (создана → начата), выполнялась (начата → конец), всего. Не закончена — до now
export function timingOf(mission, now = Date.now()) {
  const end = mission?.finishedAt || new Date(now).toISOString()
  return {
    waited: between(mission?.createdAt, mission?.startedAt || end),
    ran: mission?.startedAt ? between(mission.startedAt, end) : null,
    total: between(mission?.createdAt, end),
  }
}

/**
 * Событие истории → строка ленты: заголовок, подробность и цвет точки.
 * mission нужна, чтобы назвать узел шага.
 */
export function formatEvent(event, mission) {
  const step = event.stepIndex
  const node = step !== undefined ? mission?.steps?.[step]?.nodeId : null
  if (event.type === 'STATE') {
    const meta = MISSION_STATES[event.state] || UNKNOWN
    const parts = []
    if (event.state === 'ASSIGNED' && event.robotId) parts.push(event.robotId)
    if (event.reason) parts.push(event.reason)
    if (event.error) parts.push(`${event.error.code}: ${event.error.message}`)
    return { title: meta.label, detail: parts.join(' · '), color: meta.color }
  }
  if (event.type === 'STEP') {
    const meta = { RUNNING: '#3b82f6', COMPLETED: '#22c55e', FAILED: '#ef4444' }
    return {
      title: `Step ${step + 1} ${String(event.state).toLowerCase()}`,
      detail: node ? `→ ${node}` : '',
      color: meta[event.state] || '#94a3b8',
    }
  }
  const meta = { FINISHED: '#22c55e', FAILED: '#ef4444', RUNNING: '#3b82f6' }
  return {
    title: `${event.actionType} ${String(event.status).toLowerCase()}`,
    detail: `step ${step + 1}${node ? ` at ${node}` : ''}`,
    color: meta[event.status] || '#94a3b8',
  }
}
