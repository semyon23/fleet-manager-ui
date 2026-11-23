import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import { mergeById, sortAlarms, badgeOf } from '../lib/alarms'

/**
 * Открытые тревоги (контракт 8.3): неподтверждённые и активные — для значка в шапке и вкладки Alarms.
 * Опрос раз в 5 с из App.vue, пока вкладка браузера видна (9.1).
 */
export const useAlarmsStore = defineStore('alarms', () => {
  const POLL_MS = 5000
  const snapshot = shallowRef(null)
  const error = ref(null)
  let timer = null
  let pending = null

  const hasLoaded = computed(() => snapshot.value !== null)
  const open = computed(() => snapshot.value ? mergeById(snapshot.value.unacknowledged, snapshot.value.active) : [])
  const activeRobotIds = computed(() => new Set((snapshot.value?.active || []).map(a => a.robotId).filter(Boolean)))
  const sorted = computed(() => sortAlarms(open.value))
  const badge = computed(() => badgeOf(open.value))

  async function loadActive(listAlarms, request) {
    const items = []
    const cursors = new Set()
    let before
    while (request === pending) {
      const page = await listAlarms({ active: 'true', limit: 200, before })
      items.push(...page.items.filter(a => a.active))
      if (page.nextCursor === null) break
      if (cursors.has(page.nextCursor)) throw new Error('Repeated cursor while loading active alarms')
      cursors.add(page.nextCursor)
      before = page.nextCursor
    }
    return items
  }

  async function refresh() {
    if (pending || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
    const request = Symbol()
    pending = request
    try {
      const api = await import('../api')   // лениво — как в сторе роботов
      if (request !== pending) return
      const [unacked, active] = await Promise.all([
        api.alarms.listAlarms({ acknowledged: 'false', limit: 200 }),
        loadActive(api.alarms.listAlarms, request),
      ])
      if (request !== pending) return
      snapshot.value = { unacknowledged: unacked.items, active }
      error.value = null
    } catch (e) {
      if (request === pending) error.value = e?.message || 'Failed to load alarms'
    } finally {
      if (request === pending) pending = null
    }
  }

  function startPolling() {
    if (timer) return
    refresh()
    timer = setInterval(refresh, POLL_MS)
  }
  function stopPolling() {
    if (timer) { clearInterval(timer); timer = null }
    pending = null
  }

  // Подтвердить; ответ — сразу в список, не дожидаясь опроса. Закрытая уходит из открытых
  async function ack(id) {
    const api = await import('../api')
    const alarm = await api.alarms.ackAlarm(id)
    pending = null   // старый снимок может ещё содержать неподтверждённую тревогу
    if (snapshot.value) {
      const active = snapshot.value.active.filter(a => a.id !== id)
      if (alarm.active) active.push(alarm)
      snapshot.value = { active, unacknowledged: snapshot.value.unacknowledged.filter(a => a.id !== id) }
    }
    return alarm
  }

  return { snapshot, hasLoaded, open, activeRobotIds, sorted, badge, error, refresh, startPolling, stopPolling, ack }
})
