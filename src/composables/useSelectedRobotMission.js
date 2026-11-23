import { shallowRef, watch } from 'vue'
import { useDocumentVisibility } from '@vueuse/core'
import { getMission } from '../api/missions'
import { isFinished } from '../lib/missions'

const POLL_MS = 3000

// getRobot возвращает null, когда карточка закрыта или телеметрия больше не актуальна.
export function useSelectedRobotMission(getRobot) {
  const snapshot = shallowRef({ status: 'idle', mission: null })
  const visibility = useDocumentVisibility()
  watch([() => getRobot()?.id, () => getRobot()?.mission, visibility], ([robotId, missionId, visible], _, onCleanup) => {
    if (!robotId || !missionId || visible === 'hidden') {
      snapshot.value = { status: 'idle', mission: null }
      return
    }
    snapshot.value = { status: 'loading', mission: null }
    let active = true
    let timer
    onCleanup(() => {
      active = false
      clearTimeout(timer)
    })

    async function refresh() {
      try {
        const mission = await getMission(missionId)
        if (!active) return
        const matches = mission.id === missionId && mission.robotId === robotId
        const finished = matches && isFinished(mission)
        snapshot.value = matches && !finished
          ? { status: 'ready', mission }
          : { status: 'unavailable', mission: null }
        if (finished) return
      } catch {
        if (!active) return
        snapshot.value = { status: 'unavailable', mission: null }
      }
      timer = setTimeout(refresh, POLL_MS)
    }
    refresh()
  }, { immediate: true })
  return snapshot
}
