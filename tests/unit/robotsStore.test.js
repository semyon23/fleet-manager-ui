import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRobotsStore } from '../../src/stores/robots'

const fromRest = (x) => ({ id: 'amr-01', x, y: 0, theta: 0, mapId: 'map_1', availability: { state: 'BUSY', reasons: [] } })

describe('robots store — pose from MQTT is not overwritten by the older REST pose', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('fresh MQTT pose stays, the rest of the robot comes from REST', () => {
    const store = useRobotsStore()
    store.mergeRobots([fromRest(1)])
    store.applyTelemetry('amr-01', { x: 5, y: 2, theta: 1, mapId: 'map_1', positionInitialized: false })
    store.mergeRobots([{ ...fromRest(4), positionInitialized: true, availability: { state: 'IDLE', reasons: [] } }])
    expect(store.robots[0]).toMatchObject({ x: 5, y: 2, theta: 1, positionInitialized: false })
    expect(store.robots[0].availability.state).toBe('IDLE')
  })

  it('no MQTT for 3 s — the REST pose wins (broker down)', () => {
    const store = useRobotsStore()
    store.mergeRobots([fromRest(1)])
    store.applyTelemetry('amr-01', { x: 5, y: 2, theta: 1, mapId: 'map_1' })
    vi.advanceTimersByTime(3500)
    store.mergeRobots([fromRest(7)])
    expect(store.robots[0].x).toBe(7)
  })

  it('connection-only patches do not freeze the pose', () => {
    const store = useRobotsStore()
    store.mergeRobots([fromRest(1)])
    store.applyTelemetry('amr-01', { connection: 'OFFLINE' })
    store.mergeRobots([fromRest(2)])
    expect(store.robots[0].x).toBe(2)
  })
})
