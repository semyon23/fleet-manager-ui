// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import * as robots from '../../src/api/mocks/robots.mock'
import * as maps from '../../src/api/mocks/maps.mock'
import { worldToPixel } from '../../src/lib/nav2meta'

// M-2: робот на узле карты — mock по правилам fms (control, POST /robots/:id/position и availability)
const MAP = {
  id: 'map_1', name: 'Floor 1', width: 200, height: 100,
  meta: { resolution: 0.05, origin: [-1, -2, 0] },
  waypoints: [{ id: 'n1', u: 10, v: 20 }, { id: 'n2', u: 50, v: 20, theta: 1.57 }],
  edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
  stations: [{ id: 'st1', u: 60, v: 30, kind: 'charge', interactionNodeIds: ['n2'] }],
}

let seq = 0
function register() {
  seq += 1
  return robots.registerRobot({ id: `r${seq}`, manufacturer: 'test', serialNumber: `sn${seq}` })
}
const reasonCodes = (robot) => robot.availability.reasons.map((r) => r.code)

beforeEach(() => {
  localStorage.clear()   // карты mock — в localStorage
})

describe('robot position on graph (mock)', () => {
  it('без карты в fms — UNKNOWN_MAP, карта есть — NOT_ON_GRAPH, на узле — IDLE', () => {
    const robot = register()
    expect(robot.availability.state).toBe('NOT_READY')
    expect(reasonCodes(robot)).toEqual(['UNKNOWN_MAP'])

    maps.createMap(MAP)
    const onMap = register()   // новый робот — на первой карте fms
    expect(reasonCodes(onMap)).toEqual(['NOT_ON_GRAPH'])

    robots.setPosition(onMap.id, { mapId: 'map_1', nodeId: 'n1' })
    expect(robots.getRobot(onMap.id).availability).toEqual({ state: 'IDLE', reasons: [] })
  })

  it('поза — координаты узла в метрах карты; theta: запрос → узел → прежняя', () => {
    maps.createMap(MAP)
    const { id } = register()

    robots.setPosition(id, { mapId: 'map_1', nodeId: 'n1', theta: 0.5 })
    let { status } = robots.getRobot(id)
    expect(status.lastNodeId).toBe('n1')
    expect(status.pose.x).toBeCloseTo(-0.5)          // -1 + 10·0.05
    expect(status.pose.y).toBeCloseTo(2)             // -2 + (100 − 20)·0.05
    expect(status.pose.theta).toBe(0.5)

    robots.setPosition(id, { mapId: 'map_1', nodeId: 'n2' })
    expect(robots.getRobot(id).status.pose.theta).toBe(1.57)

    robots.setPosition(id, { mapId: 'map_1', nodeId: 'st1' })   // станция — тоже узел; у неё theta нет
    status = robots.getRobot(id).status
    expect(status.lastNodeId).toBe('st1')
    expect(status.pose.theta).toBe(1.57)
  })

  it('ошибки — как у fms', () => {
    maps.createMap(MAP)
    const { id } = register()
    expect(() => robots.setPosition(id, {})).toThrow(expect.objectContaining({
      code: 'INVALID_INPUT', details: { mapId: 'required', nodeId: 'required' } }))
    expect(() => robots.setPosition(id, { mapId: 'none', nodeId: 'n1' })).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
    expect(() => robots.setPosition(id, { mapId: 'map_1', nodeId: 'n9' })).toThrow(expect.objectContaining({
      code: 'INVALID_INPUT', details: { nodeId: 'no node n9 on map map_1' } }))
    expect(() => robots.setPosition('nobody', { mapId: 'map_1', nodeId: 'n1' })).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
  })

  it('узел убрали из карты — снова NOT_ON_GRAPH', () => {
    maps.createMap(MAP)
    const { id } = register()
    robots.setPosition(id, { mapId: 'map_1', nodeId: 'n1' })
    maps.updateMap('map_1', { version: 1, waypoints: [MAP.waypoints[1]], edges: [] })
    expect(reasonCodes(robots.getRobot(id))).toEqual(['NOT_ON_GRAPH'])
  })

  it('пауза и снятие паузы не теряют причину', () => {
    const { id } = register()
    robots.setPaused(id, true)
    expect(robots.getRobot(id).availability.state).toBe('PAUSED')
    robots.setPaused(id, false)
    expect(reasonCodes(robots.getRobot(id))).toEqual(['UNKNOWN_MAP'])
  })
})

describe('Live Map: поза робота → пиксели карты', () => {
  it('робот на узле рисуется ровно в узле', () => {
    maps.createMap(MAP)
    const { id } = register()
    robots.setPosition(id, { mapId: 'map_1', nodeId: 'n2' })
    const { pose } = robots.getRobot(id).status
    const { u, v } = worldToPixel(MAP.meta, pose.x, pose.y, MAP.height)
    expect(u).toBeCloseTo(50)
    expect(v).toBeCloseTo(20)
  })
})
