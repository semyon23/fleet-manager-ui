import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { mergeById, sortAlarms, badgeOf } from '../lib/alarms'

/**
 * Открытые тревоги (контракт 8.3): неподтверждённые и активные — для значка в шапке и вкладки Alarms.
 * Опрос раз в 5 с из App.vue, пока вкладка браузера видна (9.1).
 */
export const useAlarmsStore = defineStore('alarms', () => {
  const POLL_MS = 5000
  const open = ref([])
  const error = ref(null)
  let timer = null

  const sorted = computed(() => sortAlarms(open.value))
  const badge = computed(() => badgeOf(open.value))

  async function refresh() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const api = await import('../api')   // лениво — как в сторе роботов
    try {
      const [unacked, active] = await Promise.all([
        api.alarms.listAlarms({ acknowledged: 'false', limit: 200 }),
        api.alarms.listAlarms({ active: 'true', limit: 200 }),
      ])
      open.value = mergeById(unacked.items, active.items)
      error.value = null
    } catch (e) {
      error.value = e?.message || 'Failed to load alarms'
    }
  }

  function startPolling() {
    if (timer) return
    refresh()
    timer = setInterval(refresh, POLL_MS)
  }
  function stopPolling() {
    if (timer) { clearInterval(timer); timer = null }
  }

  // Подтвердить; ответ — сразу в список, не дожидаясь опроса. Закрытая уходит из открытых
  async function ack(id) {
    const api = await import('../api')
    const alarm = await api.alarms.ackAlarm(id)
    open.value = alarm.active ? open.value.map((a) => (a.id === id ? alarm : a)) : open.value.filter((a) => a.id !== id)
    return alarm
  }

  return { open, sorted, badge, error, refresh, startPolling, stopPolling, ack }
})
