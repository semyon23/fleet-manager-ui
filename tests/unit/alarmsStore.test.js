import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { alarms as api } from '../../src/api'
import * as mockAlarms from '../../src/api/mocks/alarms.mock'
import { useAlarmsStore } from '../../src/stores/alarms'

vi.mock('../../src/api', () => ({ alarms: { listAlarms: vi.fn(), ackAlarm: vi.fn() } }))

const page = (items, nextCursor = null) => ({ items, nextCursor })
const alarm = (id, robotId, fields = {}) => ({ id, robotId, active: true, acknowledgedAt: null, ...fields })

describe('active robot alarms', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('counts unique robot IDs across active pages, including acknowledged alarms', async () => {
    const cleared = alarm('a', 'cleared', { active: false })
    const active = [alarm('b', 'r1'), alarm('c', 'r1'), alarm('d', null)]
    const acked = alarm('e', 'r2', { acknowledgedAt: '2026-11-22T20:45:00Z' })
    api.listAlarms.mockImplementation(({ acknowledged, before }) => {
      if (acknowledged) return page([cleared, active[0]])
      if (before === 'page2') return page([acked])
      return page(active, 'page2')
    })
    const store = useAlarmsStore()
    expect(store.hasLoaded).toBe(false)
    await store.refresh()
    expect(store.hasLoaded).toBe(true)
    expect(store.activeRobotIds).toEqual(new Set(['r1', 'r2']))
    expect(store.open).toHaveLength(5)
    expect(store.open).toContainEqual(cleared)
  })

  it('keeps the last complete result when a later page fails or repeats its cursor', async () => {
    const store = useAlarmsStore()
    api.listAlarms.mockRejectedValue(new Error('Unavailable'))
    await store.refresh()
    expect(store.hasLoaded).toBe(false)
    expect(store.error).toBe('Unavailable')

    api.listAlarms.mockImplementation(({ active }) => page(active ? [alarm('a', 'known')] : []))
    await store.refresh()
    expect(store.error).toBeNull()
    const previous = store.activeRobotIds
    api.listAlarms.mockImplementation(({ acknowledged, before }) => {
      if (acknowledged) return page([])
      if (before) throw new Error('Unavailable')
      return page([alarm('b', 'partial')], 'next')
    })
    await store.refresh()
    expect(store.hasLoaded).toBe(true)
    expect(store.activeRobotIds).toBe(previous)
    expect(store.error).toBe('Unavailable')

    api.listAlarms.mockImplementation(({ active }) => active ? page([], 'same') : page([]))
    await store.refresh()
    expect(store.error).toMatch(/cursor/i)
    expect(store.activeRobotIds).toBe(previous)
  })

  it('applies an acknowledgement immediately and ignores older in-flight data', async () => {
    const store = useAlarmsStore()
    const original = alarm('a', 'r1')
    api.listAlarms.mockResolvedValue(page([original]))
    await store.refresh()

    let finishOldPage
    const started = new Promise((start) => {
      api.listAlarms.mockImplementation(({ active }) => {
        if (!active) return page([original])
        return new Promise((resolve) => { finishOldPage = resolve; start() })
      })
    })
    const pending = store.refresh()
    await started
    const acknowledged = { ...original, acknowledgedAt: '2026-11-22T21:00:00Z' }
    api.ackAlarm.mockResolvedValue(acknowledged)
    await store.ack(original.id)
    expect(store.open).toEqual([acknowledged])
    expect(store.activeRobotIds).toEqual(new Set(['r1']))
    finishOldPage(page([original]))
    await pending
    expect(store.open).toEqual([acknowledged])
    expect(store.badge).toBeNull()
  })

  it('continues a mock page after its last alarm has cleared', () => {
    const filter = { robotId: 'mock-pagination', active: 'true', limit: 1 }
    const firstRaised = mockAlarms.raiseAlarm(filter)
    const secondRaised = mockAlarms.raiseAlarm(filter)
    const firstPage = mockAlarms.listAlarms(filter)
    mockAlarms.clearAlarm(firstPage.items[0].id)
    const secondPage = mockAlarms.listAlarms({ ...filter, before: firstPage.nextCursor })
    expect(firstPage.nextCursor).toBeTruthy()
    expect(secondPage.nextCursor).toBeNull()
    expect([firstPage.items[0].id, secondPage.items[0].id].sort()).toEqual([firstRaised.id, secondRaised.id].sort())
  })
})
