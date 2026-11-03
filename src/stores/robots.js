import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const BASE = import.meta.env.BASE_URL

const AMR_SPRITES = {
  n: `${BASE}robots/amr-01/n.png`,
  ne: `${BASE}robots/amr-01/ne.png`,
  e: `${BASE}robots/amr-01/e.png`,
  se: `${BASE}robots/amr-01/se.png`,
  s: `${BASE}robots/amr-01/s.png`,
  sw: `${BASE}robots/amr-01/sw.png`,
  w: `${BASE}robots/amr-01/w.png`,
  nw: `${BASE}robots/amr-01/nw.png`,
  top: `${BASE}robots/amr-01/top.png`,
}

export const useRobotsStore = defineStore('robots', () => {
  // Стартуем ВСЕГДА с пустого списка — и в mock, и в real.
  // Демо-роботы удалены по фидбеку Семёна 2026-08-31: пользователь должен
  // видеть только реальных зарегистрированных роботов.
  const robots = ref([])

  const counts = computed(() => ({
    moving: robots.value.filter((r) => r.status === 'moving').length,
    charging: robots.value.filter((r) => r.status === 'charging').length,
    idle: robots.value.filter((r) => r.status === 'idle').length,
    error: robots.value.filter((r) => r.status === 'error').length,
    offline: robots.value.filter((r) => r.status === 'offline').length,
    deploying: robots.value.filter((r) => r.status === 'deploying').length,
    total: robots.value.length,
  }))

  // Сколько роботов в каждом состоянии готовности (availability.state, контракт v2).
  // counts выше — по старому фронтовому status, им пока пользуются Dashboard и Live Map (переедут в U-5).
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
      // После F5 MQTT-подписки пустые — восстанавливаем по списку с бэка.
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
    robots.value.push({ ...robot, sprites: AMR_SPRITES })
  }

  // Локально убрать робота по id (после успешного api.robots.deleteRobot).
  // Polling всё равно догонит через 1 сек, но UX отзывчивее сразу.
  function removeRobot(id) {
    robots.value = robots.value.filter((r) => r.id !== id)
  }

  // Патч от WS-стрима телеметрии (useTelemetryWs). Только для уже известных
  // роботов — если робота нет в списке, ждём HTTP-poll его подтянет.
  // Не меняем sprites/model/mission/uptime — это метаданные, не телеметрия.
  function applyTelemetry(robotId, patch) {
    const idx = robots.value.findIndex((r) => r.id === robotId)
    if (idx === -1) return
    const cur = robots.value[idx]
    robots.value[idx] = {
      ...cur,
      x: patch.x ?? cur.x,
      y: patch.y ?? cur.y,
      theta: patch.theta ?? cur.theta,
      battery: patch.battery ?? cur.battery,
      status: patch.status ?? cur.status,
    }
  }

  // Замерджить свежий список с бэка (GET /fms/robots). Известным роботам
  // сохраняем sprites — их бэк не отдаёт, это фронтовое поле.
  function mergeRobots(freshList) {
    const spritesById = new Map(robots.value.map((r) => [r.id, r.sprites]))
    robots.value = freshList.map((r) => ({
      ...r,
      sprites: spritesById.get(r.id) || AMR_SPRITES,
    }))
  }

  return {
    robots, counts, byState, totalBattery,
    addRobot, mergeRobots, removeRobot, applyTelemetry,
    pollingActive, lastPollAt, lastPollError,
    startPolling, stopPolling,
  }
})
