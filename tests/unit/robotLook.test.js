import { describe, it, expect } from 'vitest'
import { robotLook, footprintPx, DEFAULT_FOOTPRINT } from '../../src/lib/robotLook'
import { AVAILABILITY } from '../../src/lib/availability'

const robot = (state) => ({ availability: state ? { state, reasons: [] } : null })

describe('robotLook — one body for all, status stripe colour', () => {
  it('stripe colour and label come from the availability table', () => {
    for (const [state, meta] of Object.entries(AVAILABILITY)) {
      expect(robotLook(robot(state))).toEqual({ color: meta.color, label: meta.label })
    }
  })

  it('availability not computed yet — gray, Unknown', () => {
    expect(robotLook(robot(null))).toEqual({ color: '#94a3b8', label: 'Unknown' })
  })
})

describe('footprintPx — real size, but never smaller than the screen minimum', () => {
  it('metres divided by the map resolution', () => {
    expect(footprintPx(0.05)).toEqual({ length: DEFAULT_FOOTPRINT.length / 0.05, width: DEFAULT_FOOTPRINT.width / 0.05 })
  })

  it('zoomed out — grows to the minimum length, keeps proportions', () => {
    const { length, width } = footprintPx(0.05, 60)
    expect(length).toBeCloseTo(60)
    expect(width / length).toBeCloseTo(DEFAULT_FOOTPRINT.width / DEFAULT_FOOTPRINT.length)
  })

  it('no resolution — 5 cm per pixel', () => {
    expect(footprintPx(undefined)).toEqual(footprintPx(0.05))
  })
})
