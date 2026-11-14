import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useRobotsStore = defineStore('robots', () => {
  // Стартуем ВСЕГДА с пустого списка — и в mock, и в real.
  // Демо-роботы удалены по фидбеку Семёна 2026-08-31: пользователь должен
  // видеть только реальных зарегистрированных роботов.
  const robots = ref([])

  // Сколько роботов в каждом состоянии готовности (availability.state, контракт v2).
  const byState = computed(() => {
    const result = { total: robots.value.length }
    for (const r of robots.value) {
      const state = r.availability?.state || 'UNKNOWN'
      result[state] = (result[state] || 0) + 1
    }
    return result
  })

  const totalBattery = computed(() => {
    if (!robots.value.length) return 0
    return Math.round(robots.value.reduce((s, r) => s + r.battery, 0) / robots.value.length)
  })

  // === Глобальный polling: GET /fms/robots ===
  // Запускается один раз из App.vue.onMounted, доступен во всех views.
  // Частота 5 сек: этот эндпоинт нужен только для страницы Robots (таблица).
  // Live Map перейдёт на WebSocket-стрим позиций как только Семён поднимет /ws.
  // (Согласовано с ним 2026-09-08: сначала 10с, потом попросил 5с.)
  const POLL_MS = 5000
  const pollingActive = ref(false)
  const lastPollAt = ref(null)
  const lastPollError = ref(null)
  let pollTimer = null

  async function pollOnce() {
    // Ленивый импорт — иначе циклическая зависимость stores/api.
    const api = await import('../api')
    try {
      const fresh = await api.robots.listRobots()
      mergeRobots(fresh)
      // Подписки MQTT следуют за списком роботов: новые — подписать, удалённые — отписать.
      const { syncRobots } = await import('../composables/useRobotMqtt')
      syncRobots(fresh)
      lastPollAt.value = new Date()
      lastPollError.value = null
    } catch (e) {
      lastPollError.value = e.code ? `${e.code} — ${e.message}` : (e.message || 'poll failed')
    }
  }

  function startTimer() {
    if (pollTimer) return
    pollOnce()
    pollTimer = setInterval(pollOnce, POLL_MS)
  }
  function stopTimer() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  function startPolling() {
    pollingActive.value = true
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') startTimer()
  }
  function stopPolling() {
    stopTimer()
    pollingActive.value = false
  }

  // Вкладка скрыта — не опрашиваем (контракт v2, раздел 9.1); вернулись — сразу опрос и дальше по таймеру
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!pollingActive.value) return
      if (document.visibilityState === 'hidden') stopTimer()
      else startTimer()
    })
  }

  // Только что зарегистрированный робот (ответ api.robots.registerRobot) — сразу в список,
  // не дожидаясь опроса. Статус и готовность догонит следующий опрос.
  function addRobot(robot) {
    robots.value.push({ ...robot })
  }

  // Локально убрать робота по id (после успешного api.robots.deleteRobot).
  // Polling всё равно догонит через 1 сек, но UX отзывчивее сразу.
  function removeRobot(id) {
    robots.value = robots.value.filter((r) => r.id !== id)
  }

  // Когда поза робота пришла из MQTT. Пока она свежая, опрос REST позу не трогает: в базе поза старше
  // (dispatch пишет её не чаще раза в секунду), и робот на карте прыгал бы назад раз в 5 с
  const POSE_FRESH_MS = 3000
  const poseAt = new Map()

  // Патч от MQTT (useRobotMqtt): поза из visualization, потеря связи из connection.
  // Только для уже известных роботов — нового подтянет опрос. Остальное не трогаем: это данные fms.
  function applyTelemetry(robotId, patch) {
    const idx = robots.value.findIndex((r) => r.id === robotId)
    if (idx === -1) return
    const cur = robots.value[idx]
    if (patch.x !== undefined) poseAt.set(robotId, Date.now())
    robots.value[idx] = {
      ...cur,
      x: patch.x ?? cur.x,
      y: patch.y ?? cur.y,
      theta: patch.theta ?? cur.theta,
      mapId: patch.mapId ?? cur.mapId,
      connection: patch.connection ?? cur.connection,
      availability: patch.availability ?? cur.availability,
    }
  }

  // Заменить список свежим с бэка (GET /fms/robots). Поза — из MQTT, если она свежая (см. poseAt)
  function mergeRobots(freshList) {
    const now = Date.now()
    const previous = new Map(robots.value.map((r) => [r.id, r]))
    robots.value = freshList.map((r) => {
      const cur = previous.get(r.id)
      if (!cur || !(now - (poseAt.get(r.id) || 0) < POSE_FRESH_MS)) return { ...r }
      return { ...r, x: cur.x, y: cur.y, theta: cur.theta, mapId: cur.mapId }
    })
  }

  return {
    robots, byState, totalBattery,
    addRobot, mergeRobots, removeRobot, applyTelemetry,
    pollingActive, lastPollAt, lastPollError,
    startPolling, stopPolling, pollOnce,
  }
})
