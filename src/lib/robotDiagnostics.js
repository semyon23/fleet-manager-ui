// Only the running step of this robot's current mission can explain its present stop.
function missionStop(robot, mission) {
  if (!robot.mission || mission?.id !== robot.mission || mission.robotId !== robot.id) return null
  if (mission.state === 'PAUSED') return { title: 'Mission paused', detail: `Mission ${mission.id}` }
  if (mission.state !== 'RUNNING' || !Number.isInteger(mission.currentStep)) return null

  const index = mission.currentStep
  const step = mission.steps[index]
  const state = mission.stepStates[index]
  if (!step || state?.state !== 'RUNNING') return null
  const detail = `Mission ${mission.id} · step ${index + 1} · ${step.nodeId}`
  if (state.waitingForTraffic === true) return { title: 'Waiting for traffic clearance', detail }

  // The order can also contain actions attached to map nodes or edges.
  if (!state.actions?.length || state.actions.length !== step.actions?.length) return null
  const action = state.actions.find((reported, i) => {
    const definition = step.actions[i]
    return reported.status === 'RUNNING' && definition?.actionType === reported.actionType
      && ['SOFT', 'HARD'].includes(definition.blockingType ?? 'HARD')
  })
  return action ? { title: 'Executing a blocking action', detail: `${detail} · ${action.actionType}` } : null
}

const nonDispatchModes = ['STARTUP', 'MANUAL', 'SERVICE', 'TEACH_IN', 'INTERVENED']

export function diagnoseRobot(robot, mission = null, { pollError = false } = {}) {
  const at = robot?.lastStateAt ?? null
  let errors = []
  const report = (title, source, detail = '') => ({ kind: 'reported', title, detail, source, at, errors })
  if (pollError) return report('Robot updates unavailable', 'FMS connection', 'The latest robot status request failed.')
  if (!at) return report('No robot telemetry yet', 'Robot telemetry')

  const availability = robot.availability?.state
  const reasons = robot.availability?.reasons || []
  const reasonText = reasons.map(reason => reason.message || reason.code).join(' · ')
  if (robot.connection === 'STALE') return report('Robot telemetry is stale', 'FMS connection')
  if (reasons.some(reason => reason.code === 'DISPATCH_UNAVAILABLE')) {
    return report('Robot updates unavailable', 'FMS connection', reasonText)
  }
  if (robot.connection === 'HIBERNATING') return report('Robot is hibernating', 'FMS connection')
  if (['OFFLINE', 'CONNECTION_BROKEN'].includes(robot.connection) || availability === 'OFFLINE') {
    return report('Robot connection lost', 'FMS connection', reasonText)
  }
  if (robot.connection !== 'ONLINE') return report('Current robot connection unknown', 'FMS connection')

  errors = robot.errors || []
  if (['MANUAL', 'REMOTE'].includes(robot.safety?.emergencyStop)) {
    const detail = robot.driving ? `${robot.safety.emergencyStop} · Robot also reports motion.` : robot.safety.emergencyStop
    return report('Emergency stop active', 'Robot telemetry', detail)
  }
  if (reasons.some(reason => reason.code === 'EMERGENCY_STOP')) {
    return report('Emergency stop active', 'FMS availability', reasonText)
  }
  if (robot.driving) return report('Robot is moving', 'Robot telemetry')
  if (robot.safety?.fieldViolation) return report('Protective field violation reported', 'Robot telemetry')
  if (errors.some(error => ['CRITICAL', 'FATAL'].includes(error.level))) {
    return report('Robot reported an error', 'Robot telemetry')
  }
  if (availability === 'ERROR') return report('Robot reported an error', 'FMS availability', reasonText)
  if (robot.paused) return report('Robot paused', 'Robot telemetry')
  if (availability === 'PAUSED') return report('Robot paused', 'FMS availability', reasonText)
  if (robot.localized === false) return report('Robot is not localized', 'Robot telemetry')
  if (nonDispatchModes.includes(robot.operatingMode)) {
    return report('Automatic operation unavailable', 'Robot telemetry', `Operating mode · ${robot.operatingMode}`)
  }
  if (availability === 'NOT_READY') return report('Robot is not ready for work', 'FMS availability', reasonText)

  const step = missionStop(robot, mission)
  if (step) return { kind: 'reported', ...step, source: 'FMS mission', at: mission.updatedAt, errors }
  if (robot.charging) return report('Robot is charging', 'Robot telemetry')
  if (!robot.mission && availability === 'IDLE') return report('Idle · no mission assigned', 'FMS availability')
  return { ...report('Stop reason not reported', 'Robot telemetry'), kind: 'unexplained' }
}
