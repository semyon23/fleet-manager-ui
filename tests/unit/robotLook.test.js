import { describe, it, expect } from 'vitest'
import { robotLook, footprintPx, DEFAULT_FOOTPRINT } from '../../src/lib/robotLook'
import { AVAILABILITY } from '../../src/lib/availability'

const robot = (state) => ({ availability: state ? { state, reasons: [] } : null })

describe('robotLook — colour and marks from availability', () => {
  it('colour and label come from the availability table', () => {
    for (const [state, meta] of Object.entries(AVAILABILITY)) {
      expect(robotLook(robot(state))).toMatchObject({ color: meta.color, label: meta.label })
    }
  })

  it('pause bars, error badge, chevron otherwise', () => {
    expect(robotLook(robot('PAUSED')).mark).toBe('pause')
    expect(robotLook(robot('ERROR')).mark).toBe('error')
    expect(robotLook(robot('BUSY')).mark).toBe('chevron')
  })

  it('offline, deleting and not yet computed robots have a dashed outline', () => {
    for (const state of ['OFFLINE', 'DELETING', null]) expect(robotLook(robot(state)).dashed).toBe(true)
    expect(robotLook(robot('IDLE')).dashed).toBe(false)
    expect(robotLook(robot(null)).label).toBe('Unknown')
  })
})

describe('footprintPx — real size on the map image', () => {
  it('metres divided by the map resolution', () => {
    expect(footprintPx(0.05)).toEqual({ length: DEFAULT_FOOTPRINT.length / 0.05, width: DEFAULT_FOOTPRINT.width / 0.05 })
  })

  it('stays visible on coarse maps', () => {
    const { length, width } = footprintPx(1)
    expect(length).toBe(8)
    expect(width).toBeCloseTo(8 * (DEFAULT_FOOTPRINT.width / DEFAULT_FOOTPRINT.length))
  })

  it('no resolution — 5 cm per pixel', () => {
    expect(footprintPx(undefined)).toEqual(footprintPx(0.05))
  })
})
