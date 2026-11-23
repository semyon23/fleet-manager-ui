import { describe, expect, it } from 'vitest'
import { diagnoseRobot } from '../../src/lib/robotDiagnostics'

const robot = {
  id: 'AMR-07', connection: 'ONLINE', availability: { state: 'BUSY', reasons: [] },
  lastStateAt: '2026-11-23T09:00:01Z', driving: false, localized: true,
  operatingMode: 'AUTOMATIC', safety: { emergencyStop: 'NONE', fieldViolation: false },
  mission: 'M-184', errors: [],
}
const mission = {
  id: 'M-184', robotId: 'AMR-07', state: 'RUNNING', currentStep: 1, updatedAt: '2026-11-23T09:00:04Z',
  steps: [{ nodeId: 'N-11', actions: [] }, { nodeId: 'N-23', actions: [] }],
  stepStates: [{ state: 'COMPLETED' }, { state: 'RUNNING', waitingForTraffic: true, actions: [] }],
}
const warning = { errorType: 'FORK_SENSOR', level: 'WARNING', description: 'Sensor warning', hint: 'Check the sensor.' }

describe('robot stop diagnostics', () => {
  it('identifies a confirmed traffic wait with the current step, node and mission timestamp', () => {
    expect(diagnoseRobot(robot, mission)).toMatchObject({
      title: 'Waiting for traffic clearance', source: 'FMS mission',
      detail: 'Mission M-184 · step 2 · N-23', at: mission.updatedAt,
    })
  })

  it.each([
    { id: 'old-mission' }, { robotId: 'another-robot' }, { state: 'COMPLETED' }, { currentStep: null },
    { currentStep: 8 }, { currentStep: 0 }, { stepStates: [null, { state: 'COMPLETED', waitingForTraffic: true }] },
  ])('does not ascribe a wait from another robot, mission or inactive step (%o)', patch => {
    expect(diagnoseRobot(robot, { ...mission, ...patch }).kind).toBe('unexplained')
  })

  it('never diagnoses a traffic wait from planned routes, zero velocity, warnings or missing mission data', () => {
    const view = { ...robot, route: { planned: { nodes: ['n1', 'n2'] } }, errors: [warning] }
    expect(diagnoseRobot(view)).toMatchObject({ kind: 'unexplained', at: robot.lastStateAt, errors: [warning] })
  })

  it.each([
    [{ lastStateAt: null }, {}, 'No robot telemetry yet'],
    [{ connection: 'OFFLINE' }, {}, 'Robot connection lost'],
    [{ availability: { state: 'OFFLINE' } }, {}, 'Robot connection lost'],
    [{ connection: 'STALE' }, {}, 'Robot telemetry is stale'],
    [{}, { pollError: true }, 'Robot updates unavailable'],
    [{ availability: { state: 'OFFLINE', reasons: [{ code: 'DISPATCH_UNAVAILABLE', message: 'Dispatch unavailable' }] } },
      {}, 'Robot updates unavailable'],
  ])('withholds stale motion, mission facts and robot hints (%o)', (patch, context, title) => {
    const view = { ...robot, driving: true, paused: true, errors: [warning], ...patch }
    expect(diagnoseRobot(view, mission, context)).toMatchObject({ title, errors: [] })
  })

  it('uses the robot motion report before interpreting a mission from a different polling instant', () => {
    const view = { ...robot, driving: true, availability: { state: 'NOT_READY' } }
    expect(diagnoseRobot(view, mission)).toMatchObject({ title: 'Robot is moving', at: robot.lastStateAt })
  })

  it('keeps an explicit emergency stop visible alongside a simultaneous motion report', () => {
    const view = { ...robot, driving: true, safety: { emergencyStop: 'MANUAL', fieldViolation: false } }
    expect(diagnoseRobot(view, mission)).toMatchObject({
      title: 'Emergency stop active', detail: 'MANUAL · Robot also reports motion.',
    })
  })

  it.each([
    [{ safety: { emergencyStop: 'REMOTE' } }, 'Emergency stop active'],
    [{ safety: { emergencyStop: 'UNSPECIFIED', fieldViolation: true } }, 'Protective field violation reported'],
    [{ paused: true }, 'Robot paused'],
    [{ localized: false }, 'Robot is not localized'],
    [{ operatingMode: 'MANUAL' }, 'Automatic operation unavailable'],
  ])('shows explicit safety or operating conditions before traffic (%o)', (patch, title) => {
    expect(diagnoseRobot({ ...robot, ...patch }, mission)).toMatchObject({ title, source: 'Robot telemetry' })
  })

  it('preserves FMS reasons and robot error details with their actual sources', () => {
    const reason = { code: 'NOT_ON_GRAPH', message: 'Robot is not on a graph node' }
    const view = { ...robot, availability: { state: 'NOT_READY', reasons: [reason] } }
    expect(diagnoseRobot(view)).toMatchObject({ detail: reason.message, source: 'FMS availability' })
    const fault = { ...warning, level: 'CRITICAL', references: { nodeId: 'N-11' } }
    expect(diagnoseRobot({ ...robot, errors: [fault] }, mission)).toMatchObject({
      title: 'Robot reported an error', source: 'Robot telemetry', errors: [fault],
    })
  })

  it('reports a running action as the stop reason only when it prevents driving', () => {
    const current = {
      ...mission, currentStep: 0, steps: [{ nodeId: 'N-11', actions: [{ actionType: 'pick', blockingType: 'NONE' }] }],
      stepStates: [{ state: 'RUNNING', waitingForTraffic: false, actions: [{ actionType: 'pick', status: 'RUNNING' }] }],
    }
    expect(diagnoseRobot(robot, current).kind).toBe('unexplained')
    current.steps[0].actions[0].blockingType = 'HARD'
    expect(diagnoseRobot(robot, current)).toMatchObject({
      title: 'Executing a blocking action', detail: 'Mission M-184 · step 1 · N-11 · pick',
    })
    current.stepStates[0].actions.push({ actionType: 'pick', status: 'WAITING' })
    expect(diagnoseRobot(robot, current).kind).toBe('unexplained')
  })

  it('shows normal idle and charging states without treating semiautomatic mode as a fault', () => {
    const idle = { ...robot, mission: null, operatingMode: 'SEMIAUTOMATIC', availability: { state: 'IDLE' } }
    expect(diagnoseRobot(idle).title).toBe('Idle · no mission assigned')
    expect(diagnoseRobot({ ...idle, charging: true }).title).toBe('Robot is charging')
    expect(diagnoseRobot({ ...idle, availability: null }).kind).toBe('unexplained')
  })
})
