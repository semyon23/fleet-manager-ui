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
