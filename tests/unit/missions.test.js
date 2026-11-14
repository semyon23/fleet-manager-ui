import { describe, it, expect } from 'vitest'
import {
  stateOf, canCancel, isFinished, progressOf, toCreateRequest, stepErrors, formErrors, MISSION_STATES,
  formatDuration, timingOf, formatEvent,
} from '../../src/lib/missions'
import * as S from '../../src/api/schemas'

const mission = (fields = {}) => ({
  id: 'm-1', name: 'x', mapId: 'map', priority: 'NORMAL', requestedRobotId: null, robotId: null,
  steps: [{ nodeId: 'a', actions: [] }, { nodeId: 'b', actions: [] }],
  state: 'QUEUED', currentStep: null,
  stepStates: [{ state: 'PENDING', startedAt: null, finishedAt: null, waitingForTraffic: false, actions: [] },
               { state: 'PENDING', startedAt: null, finishedAt: null, waitingForTraffic: false, actions: [] }],
  error: null, createdAt: '2026-11-14T10:00:00.000Z', assignedAt: null, startedAt: null, finishedAt: null,
  updatedAt: '2026-11-14T10:00:00.000Z', createdBy: null, ...fields,
})

describe('missions — states', () => {
  it('every contract state has a label and colour', () => {
    for (const state of S.MISSION_STATE_VALUES) expect(MISSION_STATES[state]?.label).toBeTruthy()
    expect(stateOf({ state: 'NEW_ONE' }).label).toBe('Unknown')
  })

  it('cancel — active missions except CANCELING', () => {
    for (const state of ['QUEUED', 'ASSIGNED', 'RUNNING', 'PAUSED']) expect(canCancel(mission({ state }))).toBe(true)
    for (const state of ['CANCELING', 'COMPLETED', 'FAILED', 'CANCELED']) expect(canCancel(mission({ state }))).toBe(false)
    expect(isFinished(mission({ state: 'FAILED' }))).toBe(true)
  })

  it('progress — completed steps and the node of the current step', () => {
    expect(progressOf(mission())).toEqual({ done: 0, total: 2, nodeId: null })
    const m = mission({ state: 'RUNNING', currentStep: 1 })
    m.stepStates[0].state = 'COMPLETED'
    expect(progressOf(m)).toEqual({ done: 1, total: 2, nodeId: 'b' })
  })
})

describe('missions — create request', () => {
  const form = {
    name: '  Pallet A3  ', mapId: 'map', priority: 'HIGH', requestedRobotId: null,
    steps: [
      { nodeId: 'a', actions: [{ actionType: ' pick ', blockingType: 'HARD', actionParameters: [{ key: 'loadId', value: 'P-1' }, { key: '', value: 'x' }] }] },
      { nodeId: 'b', actions: [] },
    ],
  }

  it('only contract fields, trimmed, empty parameter keys dropped', () => {
    expect(toCreateRequest(form)).toEqual({
      name: 'Pallet A3', mapId: 'map', priority: 'HIGH',
      steps: [
        { nodeId: 'a', actions: [{ actionType: 'pick', blockingType: 'HARD', actionParameters: [{ key: 'loadId', value: 'P-1' }] }] },
        { nodeId: 'b', actions: [] },
      ],
    })
  })

  it('robot only when chosen, a name from the time when empty', () => {
    const now = new Date(2026, 10, 14, 10, 15, 30)   // местное время
    const body = toCreateRequest({ ...form, name: ' ', requestedRobotId: 'amr-02' }, now)
    expect(body.requestedRobotId).toBe('amr-02')
    expect(body.name).toBe('Mission 10:15:30')
  })

  it('the request passes the mission parts of the schema', () => {
    const body = toCreateRequest(form)
    const created = mission({ name: body.name, priority: body.priority, steps: body.steps })
    expect(S.Mission.safeParse(created).success).toBe(true)
  })
})

describe('missions — 400 INVALID_INPUT details by field', () => {
  const details = {
    name: 'required: a non-empty string',
    'steps[0].nodeId': 'no node x on map map',
    'steps[1].actions[0].actionType': 'required: a non-empty string',
    'steps[10]': 'must be an object',
  }

  it('step errors — the step and everything inside it, path inside the step', () => {
    expect(stepErrors(details, 0)).toEqual(['nodeId: no node x on map map'])
    expect(stepErrors(details, 1)).toEqual(['actions[0].actionType: required: a non-empty string'])
    expect(stepErrors(details, 10)).toEqual(['must be an object'])
    expect(stepErrors(details, 2)).toEqual([])
  })

  it('the rest belongs to the form', () => {
    expect(formErrors(details)).toEqual(['name: required: a non-empty string'])
    expect(formErrors(undefined)).toEqual([])
  })
})

describe('missions — card and history', () => {
  it('durations for people', () => {
    expect(formatDuration(42_400)).toBe('42 s')
    expect(formatDuration(185_000)).toBe('3 m 05 s')
    expect(formatDuration(4_320_000)).toBe('1 h 12 m')
    expect(formatDuration(null)).toBe('—')
  })

  it('timing — waited, ran, total; running mission counts up to now', () => {
    const done = mission({ createdAt: '2026-11-14T10:00:00.000Z', startedAt: '2026-11-14T10:00:30.000Z',
                           finishedAt: '2026-11-14T10:02:30.000Z' })
    expect(timingOf(done)).toEqual({ waited: 30_000, ran: 120_000, total: 150_000 })

    const queued = mission({ createdAt: '2026-11-14T10:00:00.000Z' })
    expect(timingOf(queued, Date.parse('2026-11-14T10:00:20.000Z'))).toEqual({ waited: 20_000, ran: null, total: 20_000 })

    const canceledInQueue = mission({ createdAt: '2026-11-14T10:00:00.000Z', finishedAt: '2026-11-14T10:00:05.000Z' })
    expect(timingOf(canceledInQueue)).toEqual({ waited: 5_000, ran: null, total: 5_000 })
  })

  const m = mission()
  const at = '2026-11-14T10:00:00.000Z'

  it('STATE — label, robot of the assignment, reason, error', () => {
    expect(formatEvent({ type: 'STATE', state: 'ASSIGNED', robotId: 'amr-01', reason: '12.3 s to the first step', at }, m))
      .toEqual({ title: 'Assigned', detail: 'amr-01 · 12.3 s to the first step', color: MISSION_STATES.ASSIGNED.color })
    expect(formatEvent({ type: 'STATE', state: 'QUEUED', robotId: 'amr-01', reason: 'robot went offline', at }, m).detail)
      .toBe('robot went offline')
    expect(formatEvent({ type: 'STATE', state: 'FAILED', robotId: 'amr-01', error: { code: 'NO_ROUTE', message: 'map changed' }, at }, m).detail)
      .toBe('NO_ROUTE: map changed')
  })

  it('STEP and ACTION — step number from 1 and its node', () => {
    expect(formatEvent({ type: 'STEP', stepIndex: 1, state: 'COMPLETED', at }, m))
      .toMatchObject({ title: 'Step 2 completed', detail: '→ b' })
    expect(formatEvent({ type: 'ACTION', stepIndex: 0, actionType: 'pick', status: 'FAILED', at }, m))
      .toMatchObject({ title: 'pick failed', detail: 'step 1 at a', color: '#ef4444' })
  })
})
