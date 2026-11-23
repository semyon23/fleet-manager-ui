import { describe, it, expect } from 'vitest'
import { releasedPoints, plannedPoints, goalPoints, toPolyline, routePolylines } from '../../src/lib/robotRoutes'

// a ─ b ─ c ─ d по оси x, шаг 10
const nodes = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, c: { x: 20, y: 0 }, d: { x: 30, y: 0 } }
const position = (id) => nodes[id] || null
const route = (released, extra = {}) => ({
  robotId: 'amr-01', mapId: 'm', missionId: 'm-1', stepIndex: 0,
  released: { nodes: released, edges: [] }, planned: { nodes: [], edges: [] },
  goals: ['d'], nextMissionId: null, ...extra,
})

describe('robotRoutes — route nodes to points on the map', () => {
  it('released line starts at the robot, not at the node it already passed', () => {
    const robotAt = { x: 14, y: 0 }
    expect(releasedPoints(route(['b', 'c', 'd']), position, robotAt)).toEqual([robotAt, nodes.c, nodes.d])
  })

  it('without the robot position — from the last passed node', () => {
    expect(releasedPoints(route(['b', 'c']), position)).toEqual([nodes.b, nodes.c])
  })

  it('robot on the step node — no line', () => {
    expect(releasedPoints(route(['d']), position, { x: 30, y: 0 })).toEqual([])
  })

  it('nodes missing on the open map are skipped', () => {
    expect(releasedPoints(route(['b', 'gone', 'd']), position, { x: 10, y: 0 })).toEqual([{ x: 10, y: 0 }, nodes.d])
  })

  it('planned continues from the end of released', () => {
    const r = route(['a', 'b'], { planned: { nodes: ['c', 'd'], edges: [] } })
    expect(plannedPoints(r, position)).toEqual([nodes.b, nodes.c, nodes.d])
    expect(plannedPoints(route(['a', 'b']), position)).toEqual([])
  })

  it('draws the boundary node returned by FMS only once when a plan starts at the last released node', () => {
    const r = route(['a', 'b'], { planned: { nodes: ['b', 'c', 'd'], edges: ['bc', 'cd'] } })
    expect(plannedPoints(r, position)).toEqual([nodes.b, nodes.c, nodes.d])
    const boundaryOnly = route(['a', 'b'], { planned: { nodes: ['b'], edges: [] } })
    expect(routePolylines(plannedPoints(boundaryOnly, position))).toEqual([])
  })

  it('draws only contiguous route segments with coordinates on the open map', () => {
    const r = route(['a', 'b', 'missing', 'c', 'd'], {
      planned: { nodes: ['missing', 'a', 'b'], edges: [] },
    })
    const robotAt = { x: 4, y: 2 }
    expect(routePolylines(releasedPoints(r, position, robotAt, { keepGaps: true })))
      .toEqual(['4,2 10,0', '20,0 30,0'])
    expect(routePolylines(plannedPoints(r, position, { keepGaps: true }))).toEqual(['0,0 10,0'])
    expect(routePolylines(releasedPoints(route(['a', 'missing']), position, robotAt, { keepGaps: true })))
      .toEqual([])
  })

  it('goals with positions, unknown goals skipped', () => {
    expect(goalPoints(route(['a'], { goals: ['b', 'nope', 'd'] }), position))
      .toEqual([{ id: 'b', x: 10, y: 0 }, { id: 'd', x: 30, y: 0 }])
  })

  it('polyline points attribute', () => {
    expect(toPolyline([nodes.a, nodes.b])).toBe('0,0 10,0')
    expect(toPolyline([])).toBe('')
  })
})
