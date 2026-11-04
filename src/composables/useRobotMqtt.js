import { ref, readonly } from 'vue'
import mqtt from 'mqtt'
import { getMockMode } from '../api/client'
import { useRobotsStore } from '../stores/robots'

/**
 * MQTT over WebSocket: живая поза и связь роботов напрямую от брокера (контракт v2, раздел 10).
 * Только чтение: пользователь брокера fleet-ui (ACL — deploy/mosquitto в репозитории fms).
 *
 * Топики робота (VDA 5050 v3):
 *   {interface}/{version}/{manufacturer}/{serialNumber}/visualization → mobileRobotPosition {x, y, theta, mapId}
 *   {interface}/{version}/{manufacturer}/{serialNumber}/connection    → connectionState
 * interface / version — mqttInterface / mqttVersion в config.js (по умолчанию amr / v3).
 *
 * В топике робот — manufacturer + serialNumber, в сторе — его id; связь между ними — карта subscriptions.
 * Подписки следуют за списком роботов из опроса (syncRobots): новых подписываем, удалённых отписываем.
 *
 * Конфиг: window.__FLEET_CONFIG__.mqttUrl / mqttUser / mqttPassword. Пустой mqttUrl или mock-режим → выключено.
 */

function cfg() {
  return (typeof window !== 'undefined' && window.__FLEET_CONFIG__) || {}
}

function topicPrefix() {
  const { mqttInterface, mqttVersion } = cfg()
  return `${mqttInterface || 'amr'}/${mqttVersion || 'v3'}`
}

// manufacturer/serialNumber — так робот назван в своих топиках
const robotKey = (robot) => `${robot.manufacturer}/${robot.serialNumber}`

function topicsFor(key) {
  const base = `${topicPrefix()}/${key}`
  return [`${base}/visualization`, `${base}/connection`]
}

const state = ref('idle')  // 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'disabled'
const lastError = ref(null)
let client = null
// manufacturer/serialNumber → id робота. Источник правды для подписок: при реконнекте переподписываемся по ней.
const subscriptions = new Map()

// visualization может идти с высокой частотой — копим последнее значение
// и применяем к стору раз в кадр.
const pendingPose = new Map()
let rafId = null

function flushPoses() {
  rafId = null
  const store = useRobotsStore()
  for (const [robotId, pose] of pendingPose) store.applyTelemetry(robotId, pose)
  pendingPose.clear()
}

function schedulePose(robotId, pose) {
  pendingPose.set(robotId, pose)
  if (rafId == null) rafId = requestAnimationFrame(flushPoses)
}

function handleMessage(topic, payload) {
  // {interface}/{version}/{manufacturer}/{serialNumber}/{subtopic}
  const parts = topic.split('/')
  if (parts.length !== 5) return
  const robotId = subscriptions.get(`${parts[2]}/${parts[3]}`)
  if (!robotId) return

  let msg
  try { msg = JSON.parse(payload.toString()) } catch { return }

  if (parts[4] === 'visualization') {
    const p = msg?.mobileRobotPosition
    if (!p) return
    schedulePose(robotId, {
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      theta: Number(p.theta) || 0,
      mapId: p.mapId,
    })
  } else if (parts[4] === 'connection') {
    // Не ONLINE → сразу offline, не дожидаясь опроса. Обратно в online — только по данным fms (опрос).
    const connection = msg?.connectionState
    if (connection && connection !== 'ONLINE') {
      useRobotsStore().applyTelemetry(robotId, {
        connection,
        availability: { state: 'OFFLINE', reasons: [{ code: 'NO_CONNECTION', message: `connection: ${connection}` }] },
      })
    }
  }
}

function doSubscribe(key) {
  if (!client?.connected) return  // подпишемся в on('connect')
  client.subscribe(topicsFor(key), { qos: 0 }, (err) => {
    if (err) lastError.value = `subscribe ${key}: ${err.message}`
  })
}

function doUnsubscribe(key) {
  if (!client?.connected) return
  client.unsubscribe(topicsFor(key))
}

export function connect() {
  const { mqttUrl, mqttUser, mqttPassword } = cfg()
  if (getMockMode() || !mqttUrl || !String(mqttUrl).trim()) { state.value = 'disabled'; return }
  if (client) return

  state.value = 'connecting'
  client = mqtt.connect(String(mqttUrl).trim(), {
    username: mqttUser || undefined,
    password: mqttPassword || undefined,
    clientId: `fleet-ui-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
  })

  client.on('connect', () => {
    state.value = 'open'
    lastError.value = null
    // clean session: после каждого (пере)подключения подписки надо восстановить
    for (const key of subscriptions.keys()) doSubscribe(key)
  })
  client.on('message', handleMessage)
  client.on('error', (e) => { state.value = 'error'; lastError.value = e.message })
  client.on('close', () => { if (state.value !== 'idle') state.value = 'closed' })
}

export function disconnect() {
  state.value = 'idle'
  if (rafId != null) { cancelAnimationFrame(rafId); rafId = null }
  pendingPose.clear()
  if (client) { client.end(true); client = null }
}

// Подписаться на робота ({ id, manufacturer, serialNumber }) — после регистрации и по списку из опроса
export function subscribeRobot(robot) {
  if (!robot?.manufacturer || !robot?.serialNumber) return
  const key = robotKey(robot)
  if (subscriptions.get(key) === robot.id) return
  subscriptions.set(key, robot.id)
  doSubscribe(key)
}

// Отписаться от робота по id — после удаления
export function unsubscribeRobot(robotId) {
  for (const [key, id] of subscriptions) {
    if (id !== robotId) continue
    doUnsubscribe(key)
    subscriptions.delete(key)
  }
  pendingPose.delete(robotId)
}

// Подписки = список роботов из опроса: новых подписать, тех, кого в списке нет, отписать
export function syncRobots(robots) {
  const ids = new Set(robots.map((r) => r.id))
  for (const id of new Set(subscriptions.values())) {
    if (!ids.has(id)) unsubscribeRobot(id)
  }
  for (const r of robots) subscribeRobot(r)
}

export function useRobotMqtt() {
  return {
    state: readonly(state),
    lastError: readonly(lastError),
    connect,
    disconnect,
    subscribeRobot,
    unsubscribeRobot,
    syncRobots,
  }
}
