/**
 * Маршруты роботов на Live Map (контракт 7.4): узлы маршрута → точки на картинке карты.
 * position(nodeId) → { x, y } или null (узла нет на открытой карте — карту поменяли).
 */

// Один и тот же ID сохраняет цвет при смене состояния, карты и порядка обновления флота.
const routeColors = [
  'light-dark(#376f43, #81c894)', 'light-dark(#3858ac, #93adff)',
  'light-dark(#a5484c, #f39b96)', 'light-dark(#7851a6, #c6a2ef)',
  'light-dark(#187b78, #78d0c3)', 'light-dark(#a15e1d, #f1b36d)',
  'light-dark(#9c437e, #e79bc9)', 'light-dark(#1d7198, #78c6ea)',
]
export function routeColorFor(robotId) {
  let hash = 0
  for (const char of robotId) hash = (Math.imul(hash, 31) + char.codePointAt(0)) >>> 0
  return routeColors[hash % routeColors.length]
}

// Сплошная часть — от робота: released.nodes[0] — узел, который он уже проехал, линия от него
// тянулась бы назад. Робот стоит на узле шага (один узел) — линии нет.
export function releasedPoints(route, position, robotAt, { keepGaps = false } = {}) {
  const nodes = route?.released?.nodes || []
  if (nodes.length < 2) return []
  const ahead = nodes.slice(1).map(position)
  const start = robotAt || position(nodes[0])
  if (keepGaps) return [start, ...ahead]
  const known = ahead.filter(Boolean)
  return start && known.length ? [start, ...known] : []
}

// Пунктир — продолжение от конца сплошной части.
export function plannedPoints(route, position, { keepGaps = false } = {}) {
  const planned = route?.planned?.nodes || []
  if (!planned.length) return []
  const from = (route.released?.nodes || []).at(-1)
  // FMS повторяет граничный узел; старые снимки начинались со следующего узла.
  const nodes = from && planned[0] !== from ? [from, ...planned] : planned
  const points = nodes.map(position)
  return keepGaps ? points : points.filter(Boolean)
}

export function goalPoints(route, position) {
  return (route?.goals || []).map((id) => ({ id, ...position(id) })).filter((p) => p.x !== undefined)
}

export function toPolyline(points) {
  return points.map((p) => `${p.x},${p.y}`).join(' ')
}

// Нет координат узла — обрываем линию: участок за разрывом можно показать отдельно.
export function routePolylines(points) {
  const lines = []
  let run = []
  for (const point of points) {
    if (point) {
      run.push(point)
    } else {
      if (run.length > 1) lines.push(toPolyline(run))
      run = []
    }
  }
  if (run.length > 1) lines.push(toPolyline(run))
  return lines
}
