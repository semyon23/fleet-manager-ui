import { describe, it, expect } from 'vitest'
import { mergeById, sortAlarms, badgeOf, statusOf, SEVERITY } from '../../src/lib/alarms'
import { formatJournalEvent } from '../../src/lib/journal'
import { AVAILABILITY } from '../../src/lib/availability'

const alarm = (id, fields = {}) => ({
  id, severity: 'ERROR', source: 'ROBOT', code: 'ROBOT_OFFLINE', title: 'Robot offline', detail: '',
  robotId: 'amr-01', missionId: null, active: true, createdAt: '2026-11-15T10:00:00.000Z',
  clearedAt: null, acknowledgedAt: null, acknowledgedBy: null, ...fields,
})

describe('alarms — open list, order, badge', () => {
  it('not acknowledged ∪ active, by id', () => {
    const a = alarm('a')
    const b = alarm('b', { active: false })
    const c = alarm('c', { acknowledgedAt: '2026-11-15T10:01:00.000Z' })
    expect(mergeById([a, b], [a, c]).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('burning and not acknowledged first, then severity, then newest', () => {
    const list = [
      alarm('cleared', { active: false }),
      alarm('acked', { acknowledgedAt: 'x' }),
      alarm('warning', { severity: 'WARNING' }),
      alarm('critical', { severity: 'CRITICAL' }),
      alarm('newer', { createdAt: '2026-11-15T11:00:00.000Z' }),
    ]
    expect(sortAlarms(list).map((x) => x.id)).toEqual(['critical', 'newer', 'warning', 'acked', 'cleared'])
  })

  it('badge — not acknowledged, colour of the worst; none — null', () => {
    expect(badgeOf([alarm('a', { severity: 'WARNING' }), alarm('b', { severity: 'CRITICAL', active: false }),
                    alarm('c', { severity: 'CRITICAL', acknowledgedAt: 'x' })]))
      .toEqual({ count: 2, color: SEVERITY.CRITICAL.color, severity: 'CRITICAL' })
    expect(badgeOf([alarm('a', { acknowledgedAt: 'x' })])).toBeNull()
  })

  it('status words', () => {
    expect(statusOf(alarm('a'))).toBe('Active')
    expect(statusOf(alarm('a', { acknowledgedAt: 'x' }))).toBe('Active · acknowledged')
    expect(statusOf(alarm('a', { active: false }))).toBe('Cleared · not acknowledged')
    expect(statusOf(alarm('a', { active: false, acknowledgedAt: 'x' }))).toBe('Closed')
  })
})

describe('journal — event lines', () => {
  const e = (source, type, fields = {}) => ({ id: 1, at: '2026-11-15T10:00:00.000Z', source, type, robotId: 'amr-01', missionId: null, alarmId: null, ...fields })

  it('robot: connection, availability with reasons, VDA error and its clearing', () => {
    expect(formatJournalEvent(e('ROBOT', 'CONNECTION', { state: 'CONNECTION_BROKEN' })))
      .toMatchObject({ title: 'Connection connection broken', color: '#ef4444' })
    expect(formatJournalEvent(e('ROBOT', 'CONNECTION', { state: 'ONLINE' })).color).toBe('#22c55e')
    expect(formatJournalEvent(e('ROBOT', 'AVAILABILITY', { state: 'NOT_READY', reasons: [{ code: 'X', message: 'between nodes' }] })))
      .toEqual({ title: 'Not ready', detail: 'between nodes', color: AVAILABILITY.NOT_READY.color })
    expect(formatJournalEvent(e('ROBOT', 'ERROR', { errorType: 'noRoute', level: 'FATAL', description: 'lost', cleared: false })))
      .toEqual({ title: 'Error: noRoute', detail: 'FATAL · lost', color: SEVERITY.CRITICAL.color })
    expect(formatJournalEvent(e('ROBOT', 'ERROR', { errorType: 'noRoute', level: 'WARNING', cleared: true })).title)
      .toBe('Error cleared: noRoute')
  })

  it('robot: operator actions', () => {
    expect(formatJournalEvent(e('ROBOT', 'POSITION', { nodeId: 'a', mapId: 'map_1' })).detail).toBe('a · map_1')
    expect(formatJournalEvent(e('ROBOT', 'DELETED', { force: true, canceledMission: 'm-1' })).detail).toBe('mission m-1 canceled')
    expect(formatJournalEvent(e('ROBOT', 'REGISTERED', { manufacturer: 'ktc', serialNumber: 'amr1' })).detail).toBe('ktc · amr1')
  })

  it('alarm and system', () => {
    expect(formatJournalEvent(e('ALARM', 'RAISED', { code: 'ROBOT_OFFLINE', severity: 'ERROR', title: 'Robot offline' })))
      .toEqual({ title: 'Alarm: Robot offline', detail: 'ROBOT_OFFLINE', color: SEVERITY.ERROR.color })
    expect(formatJournalEvent(e('ALARM', 'CLEARED', { title: 'Robot offline', reason: 'robot removed from fms' })).detail)
      .toBe('robot removed from fms')
    expect(formatJournalEvent(e('ALARM', 'ACKED', { title: 'Robot offline', by: 'fms' })).detail).toBe('by fms')
    expect(formatJournalEvent(e('SYSTEM', 'MAP_SAVED', { mapId: 'map_1', version: 3, forced: true })).detail)
      .toBe('map_1 v3 · consequences accepted')
  })

  it('mission events reuse the mission card wording', () => {
    expect(formatJournalEvent(e('MISSION', 'STATE', { state: 'FAILED', error: { code: 'NO_ROUTE', message: 'x' } })))
      .toMatchObject({ title: 'Mission failed', detail: 'NO_ROUTE: x' })
  })

  it('unknown types do not break the journal', () => {
    expect(formatJournalEvent(e('ROBOT', 'SOMETHING_NEW')).title).toBe('SOMETHING_NEW')
    expect(formatJournalEvent(e('SYSTEM', 'SERVICE_UP')).title).toBe('SERVICE_UP')
  })
})
