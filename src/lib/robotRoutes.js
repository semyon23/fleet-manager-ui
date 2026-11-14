/**
 * Маршруты роботов на Live Map (контракт 7.4): узлы маршрута → точки на картинке карты.
 * position(nodeId) → { x, y } или null (узла нет на открытой карте — карту поменяли).
 */

// Сплошная часть — от робота: released.nodes[0] — узел, который он уже проехал, линия от него
// тянулась бы назад. Робот стоит на узле шага (один узел) — линии нет.
export function releasedPoints(route, position, robotAt) {
  const nodes = route?.released?.nodes || []
  if (nodes.length < 2) return []
  const ahead = nodes.slice(1).map(position).filter(Boolean)
  const start = robotAt || position(nodes[0])
  return start && ahead.length ? [start, ...ahead] : []
}

// Пунктир — продолжение от конца сплошной части. Пока трафика нет, planned всегда пуст
export function plannedPoints(route, position) {
  const planned = route?.planned?.nodes || []
  if (!planned.length) return []
  const from = (route.released?.nodes || []).at(-1)
  return [from, ...planned].map(position).filter(Boolean)
}

export function goalPoints(route, position) {
  return (route?.goals || []).map((id) => ({ id, ...position(id) })).filter((p) => p.x !== undefined)
}

export function toPolyline(points) {
  return points.map((p) => `${p.x},${p.y}`).join(' ')
}
