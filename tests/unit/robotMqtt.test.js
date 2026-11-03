// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Брокер подменён: клиент запоминает подписки и отдаёт сообщения, которые «пришли» из теста
const fake = vi.hoisted(() => ({ client: null }))
vi.mock('mqtt', () => ({
  default: {
    connect: () => {
      const handlers = {}
      fake.client = {
        connected: true,
        subscribed: new Set(),
        on: (event, cb) => { handlers[event] = cb },
        subscribe(topics) { topics.forEach((t) => this.subscribed.add(t)) },
        unsubscribe(topics) { topics.forEach((t) => this.subscribed.delete(t)) },
        end() {},
        emit: (event, ...args) => handlers[event]?.(...args),
      }
      return fake.client
    },
  },
}))

const mqttModule = await import('../../src/composables/useRobotMqtt')
const { useRobotsStore } = await import('../../src/stores/robots')

const robot = { id: 'amr-01', manufacturer: 'ktc', serialNumber: 'amr1', x: 0, y: 0, theta: 0, mapId: null,
  connection: 'ONLINE', status: 'idle', availability: { state: 'IDLE', reasons: [] } }

function publish(topic, message) {
  fake.client.emit('message', topic, Buffer.from(JSON.stringify(message)))
}

describe('useRobotMqtt — VDA 5050 v3 topics by serialNumber', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.setItem('fm.api.useMocks', '0')
    window.__FLEET_CONFIG__ = { mqttUrl: 'ws://broker:9001' }
    globalThis.requestAnimationFrame = (cb) => { cb(); return 1 }
    mqttModule.disconnect()
    mqttModule.unsubscribeRobot('amr-01')
    mqttModule.connect()
    fake.client.emit('connect')
    useRobotsStore().robots.push({ ...robot })
  })

  it('subscribes to amr/v3/<manufacturer>/<serialNumber> topics', () => {
    mqttModule.subscribeRobot(robot)
    expect([...fake.client.subscribed].sort()).toEqual([
      'amr/v3/ktc/amr1/connection',
      'amr/v3/ktc/amr1/visualization',
    ])
  })

  it('applies mobileRobotPosition to the robot with that id', () => {
    mqttModule.subscribeRobot(robot)
    publish('amr/v3/ktc/amr1/visualization', { mobileRobotPosition: { x: 1.5, y: -2, theta: 0.3, mapId: 'map_1' } })
    const stored = useRobotsStore().robots[0]
    expect([stored.x, stored.y, stored.theta, stored.mapId]).toEqual([1.5, -2, 0.3, 'map_1'])
  })

  it('connection not ONLINE makes the robot offline at once', () => {
    mqttModule.subscribeRobot(robot)
    publish('amr/v3/ktc/amr1/connection', { connectionState: 'CONNECTION_BROKEN' })
    const stored = useRobotsStore().robots[0]
    expect(stored.connection).toBe('CONNECTION_BROKEN')
    expect(stored.availability.state).toBe('OFFLINE')
  })

  it('ignores robots it is not subscribed to', () => {
    publish('amr/v3/ktc/amr1/visualization', { mobileRobotPosition: { x: 9, y: 9, theta: 0, mapId: 'm' } })
    expect(useRobotsStore().robots[0].x).toBe(0)
  })

  it('syncRobots unsubscribes robots that left the list', () => {
    mqttModule.syncRobots([robot])
    expect(fake.client.subscribed.size).toBe(2)
    mqttModule.syncRobots([])
    expect(fake.client.subscribed.size).toBe(0)
  })

  it('topic prefix comes from config', () => {
    window.__FLEET_CONFIG__.mqttInterface = 'uagv'
    window.__FLEET_CONFIG__.mqttVersion = 'v2'
    mqttModule.subscribeRobot(robot)
    expect(fake.client.subscribed.has('uagv/v2/ktc/amr1/visualization')).toBe(true)
  })
})
