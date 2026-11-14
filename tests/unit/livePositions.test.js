import { describe, it, expect } from 'vitest'
import { livePositionsStatus, NO_DATA_MS } from '../../src/lib/livePositions'

const base = { state: 'open', lastError: null, lastPoseAt: 1000, onlineRobots: 1, hasPassword: true, prefix: 'amr/v3', now: 2000 }
const status = (fields) => livePositionsStatus({ ...base, ...fields })

describe('livePositionsStatus — are robot positions really arriving', () => {
  it('poses are arriving — ok', () => {
    expect(status({}).level).toBe('ok')
  })

  it('mock mode or no mqttUrl — off, hidden', () => {
    expect(status({ state: 'disabled' }).level).toBe('off')
  })

  it('broker refused — error, the hint names the empty password', () => {
    const s = status({ state: 'error', lastError: 'Connection refused: Not authorized', hasPassword: false })
    expect(s.level).toBe('error')
    expect(s.hint).toMatch(/Not authorized/)
    expect(s.hint).toMatch(/mqttPassword is empty/)
  })

  it('reconnecting after an error stays an error, not a blinking "connecting"', () => {
    expect(status({ state: 'connecting', lastError: 'x' }).level).toBe('error')
    expect(status({ state: 'connecting', lastError: null }).level).toBe('warn')
  })

  it('connected but robots publish nothing on our topics — warn about interface / version', () => {
    const s = status({ lastPoseAt: null })
    expect(s.level).toBe('warn')
    expect(s.hint).toMatch(/amr\/v3\/\+\/\+\/visualization/)
    expect(status({ now: 1000 + NO_DATA_MS + 1 }).level).toBe('warn')
  })

  it('no robot online — silence is fine', () => {
    expect(status({ lastPoseAt: null, onlineRobots: 0 }).level).toBe('ok')
  })
})
