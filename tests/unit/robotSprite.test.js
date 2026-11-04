import { describe, it, expect } from 'vitest'
import { spriteFor, tintStyle, tintFilterId } from '../../src/lib/robotSprite'

const sprites = { n: 'n.png', e: 'e.png', top: 'top.png' }
const robot = (state, extra = {}) => ({ sprites, theta: 0, availability: state ? { state, reasons: [] } : null, ...extra })

describe('robotSprite — sprite and tint from availability', () => {
  it('top view while the robot is not driving, heading sprite while driving', () => {
    expect(spriteFor(robot('BUSY'))).toBe('top.png')
    expect(spriteFor(robot('BUSY', { driving: true }))).toBe('e.png')
  })

  it('BUSY keeps the blue sprite, other states rotate the hue', () => {
    expect(tintStyle(robot('BUSY'))).toBe('')
    expect(tintStyle(robot('ERROR'))).toMatch(/hue-rotate/)
    expect(tintFilterId(robot('ERROR'))).toBe('tint-ERROR')
  })

  it('offline, deleting and not yet computed robots are gray', () => {
    for (const state of ['OFFLINE', 'DELETING', null]) {
      expect(tintStyle(robot(state))).toMatch(/grayscale/)
      expect(tintFilterId(robot(state))).toBe('tint-gray')
    }
  })
})
