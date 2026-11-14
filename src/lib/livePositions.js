/**
 * Индикатор «живые позы» в шапке: идут ли позы роботов из MQTT (контракт 10). Без них Live Map живёт
 * только опросом REST раз в 5 с — роботы прыгают. Подсказка говорит, что проверить в config.js.
 */
export const NO_DATA_MS = 10_000

/**
 * mqtt — { state, lastError, lastPoseAt } из useRobotMqtt; onlineRobots — сколько роботов на связи;
 * hasPassword — вписан ли mqttPassword. → { level: 'ok'|'warn'|'error'|'off', label, hint }
 */
export function livePositionsStatus({ state, lastError, lastPoseAt, onlineRobots, hasPassword, prefix, now }) {
  if (state === 'disabled' || state === 'idle') {
    return { level: 'off', label: 'Live off', hint: 'Live positions are off: mock mode or no mqttUrl in config.js' }
  }
  const brokerHint = hasPassword
    ? 'Check mqttUrl, mqttUser and mqttPassword in config.js'
    : 'mqttPassword is empty in config.js — the broker lets nobody in without it'
  if (state === 'error' || state === 'closed' || (state === 'connecting' && lastError)) {
    return {
      level: 'error',
      label: 'No live',
      hint: `No connection to the MQTT broker${lastError ? ` (${lastError})` : ''}. ${brokerHint}. Robots move only every 5 s.`,
    }
  }
  if (state === 'connecting') return { level: 'warn', label: 'Live…', hint: 'Connecting to the MQTT broker' }
  if (onlineRobots > 0 && (!lastPoseAt || now - lastPoseAt > NO_DATA_MS)) {
    return {
      level: 'warn',
      label: 'No poses',
      hint: `Connected to the broker, but no positions on ${prefix}/+/+/visualization for ${NO_DATA_MS / 1000} s. ` +
        'Check mqttInterface / mqttVersion in config.js against the robot topics.',
    }
  }
  return { level: 'ok', label: 'Live', hint: 'Live robot positions from the MQTT broker' }
}

export const LEVEL_COLORS = { ok: '#22c55e', warn: '#eab308', error: '#ef4444', off: '#94a3b8' }
