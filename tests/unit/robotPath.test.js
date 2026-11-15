import { describe, it, expect } from 'vitest'
import { sampleNurbs, robotPathOf } from '../../src/lib/robotPath'

const cp = (x, y, weight) => ({ x, y, ...(weight ? { weight } : {}) })

describe('robotPath — robot planned path from VDA visualization', () => {
  it('degree 1 (default) — the polyline of control points itself', () => {
    const t = { controlPoints: [cp(0, 0), cp(1, 0), cp(1, 2)] }
    expect(sampleNurbs(t)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }])
  })

  it('clamped curve starts and ends at the first and last control point', () => {
    const t = { degree: 2, controlPoints: [cp(0, 0), cp(5, 10), cp(10, 0)] }
    const points = sampleNurbs(t)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points.at(-1).x).toBeCloseTo(10)
    expect(points.at(-1).y).toBeCloseTo(0)
  })

  it('quadratic Bezier: the middle of the curve is the textbook point', () => {
    // B(0.5) = 0.25 P0 + 0.5 P1 + 0.25 P2 = (5, 5)
    const points = sampleNurbs({ degree: 2, knotVector: [0, 0, 0, 1, 1, 1], controlPoints: [cp(0, 0), cp(5, 10), cp(10, 0)] }, 8)
    const mid = points[Math.floor(points.length / 2)]
    expect(mid.x).toBeCloseTo(5)
    expect(mid.y).toBeCloseTo(5)
  })

  it('a heavier middle point pulls the curve towards it', () => {
    const light = sampleNurbs({ degree: 2, controlPoints: [cp(0, 0), cp(5, 10), cp(10, 0)] }, 8)
    const heavy = sampleNurbs({ degree: 2, controlPoints: [cp(0, 0), cp(5, 10, 4), cp(10, 0)] }, 8)
    const i = Math.floor(light.length / 2)
    expect(heavy[i].y).toBeGreaterThan(light[i].y)
  })

  it('a wrong knot vector falls back to uniform knots', () => {
    const points = sampleNurbs({ degree: 2, knotVector: [0, 1], controlPoints: [cp(0, 0), cp(5, 10), cp(10, 0)] })
    expect(points[0]).toEqual({ x: 0, y: 0 })
  })

  it('visualization message → planned and intermediate', () => {
    const message = {
      plannedPath: { trajectory: { controlPoints: [cp(0, 0), cp(3, 0)] }, traversedNodes: ['a'] },
      intermediatePath: { polyline: [{ x: 0, y: 0, eta: 'x' }, { x: 1, y: 0, theta: 0, eta: 'y' }] },
    }
    expect(robotPathOf(message)).toEqual({
      planned: [{ x: 0, y: 0 }, { x: 3, y: 0 }],
      intermediate: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    })
    expect(robotPathOf({ mobileRobotPosition: {} })).toEqual({ planned: [], intermediate: [] })
  })
})
