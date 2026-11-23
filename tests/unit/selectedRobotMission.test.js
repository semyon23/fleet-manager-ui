import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useDocumentVisibility } from '@vueuse/core'
import { getMission } from '../../src/api/missions'
import { useSelectedRobotMission } from '../../src/composables/useSelectedRobotMission'

vi.mock('../../src/api/missions', () => ({ getMission: vi.fn() }))
vi.mock('@vueuse/core', () => ({ useDocumentVisibility: vi.fn() }))

const robot = { id: 'AMR-07', mission: 'M-12' }
const mission = { id: 'M-12', robotId: 'AMR-07', state: 'RUNNING' }
let scope
let visibility

beforeEach(() => {
  vi.useFakeTimers()
  getMission.mockReset()
  scope = effectScope()
  visibility = ref('visible')
  useDocumentVisibility.mockReturnValue(visibility)
})
afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

describe('selected Live Map mission', () => {
  it('ignores the previous robot reply, even when both robots report the same mission ID', async () => {
    let reply
    getMission.mockReturnValueOnce(new Promise(resolve => { reply = resolve }))
      .mockResolvedValueOnce({ ...mission, robotId: 'AMR-12' })
    const selected = ref(robot)
    const snapshot = scope.run(() => useSelectedRobotMission(() => selected.value))

    selected.value = { ...robot, id: 'AMR-12' }
    await nextTick()
    reply(mission)
    await Promise.resolve()
    expect(snapshot.value.mission?.robotId).toBe('AMR-12')
    expect(getMission.mock.calls).toEqual([['M-12'], ['M-12']])
  })

  it('clears failures and mismatched assignments, then accepts a current reply', async () => {
    getMission.mockResolvedValueOnce(mission).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...mission, robotId: 'AMR-12' }).mockResolvedValueOnce(mission)
      .mockResolvedValueOnce({ ...mission, state: 'COMPLETED' })
    const snapshot = scope.run(() => useSelectedRobotMission(() => robot))
    await Promise.resolve()
    expect(snapshot.value).toEqual({ status: 'ready', mission })
    for (let i = 0; i < 2; i++) {
      await vi.advanceTimersByTimeAsync(3000)
      expect(snapshot.value).toEqual({ status: 'unavailable', mission: null })
    }
    await vi.advanceTimersByTimeAsync(3000)
    expect(snapshot.value).toEqual({ status: 'ready', mission })
    await vi.advanceTimersByTimeAsync(6000)
    expect(snapshot.value).toEqual({ status: 'unavailable', mission: null })
    expect(getMission).toHaveBeenCalledTimes(5)
  })

  it('polls only an open, visible selection and drops a reply after closing', async () => {
    let reply
    const selected = ref(null)
    getMission.mockResolvedValueOnce(mission)
      .mockReturnValueOnce(new Promise(resolve => { reply = resolve }))
    const snapshot = scope.run(() => useSelectedRobotMission(() => selected.value))
    await nextTick()
    expect(getMission).not.toHaveBeenCalled()

    selected.value = robot
    await nextTick()
    visibility.value = 'hidden'
    await nextTick()
    expect(snapshot.value).toEqual({ status: 'idle', mission: null })
    await vi.advanceTimersByTimeAsync(6000)
    expect(getMission).toHaveBeenCalledTimes(1)

    visibility.value = 'visible'
    await nextTick()
    expect(getMission).toHaveBeenCalledTimes(2)
    selected.value = null
    await nextTick()
    reply(mission)
    await vi.advanceTimersByTimeAsync(6000)
    expect(snapshot.value).toEqual({ status: 'idle', mission: null })
    expect(getMission).toHaveBeenCalledTimes(2)
  })
})
