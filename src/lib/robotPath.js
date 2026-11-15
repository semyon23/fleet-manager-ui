/**
 * Путь, который робот рассчитал сам (VDA 5050, 6.7 и 7.9: visualization.plannedPath / intermediatePath).
 * fms его не использует — только чтобы показать на Live Map. Координаты — метры карты робота.
 */

// Равномерный зажатый вектор узлов (по умолчанию в VDA): степень+1 нулей, внутренние равномерно, степень+1 единиц
function uniformClampedKnots(count, degree) {
  const inner = count - degree - 1
  return [
    ...Array(degree + 1).fill(0),
    ...Array.from({ length: inner }, (_, i) => (i + 1) / (inner + 1)),
    ...Array(degree + 1).fill(1),
  ]
}

/**
 * NURBS (trajectory: degree, knotVector, controlPoints[{x, y, weight}]) → точки для рисования.
 * Степень 1 — сама ломаная по контрольным точкам. Иначе — алгоритм де Бура в однородных координатах.
 */
export function sampleNurbs(trajectory, perControlPoint = 8) {
  const points = (trajectory?.controlPoints || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  const degree = Math.max(1, trajectory?.degree ?? 1)
  if (degree === 1 || points.length <= degree) return points.map(({ x, y }) => ({ x, y }))

  const n = points.length
  const given = trajectory.knotVector
  const knots = Array.isArray(given) && given.length === n + degree + 1 ? given : uniformClampedKnots(n, degree)
  const start = knots[degree]
  const end = knots[n]
  const samples = Math.max(16, n * perControlPoint)

  const out = []
  for (let s = 0; s <= samples; s++) {
    const u = start + ((end - start) * s) / samples
    // Промежуток: последний k с knots[k] <= u (на самом конце — последний непустой)
    let k = degree
    while (k < n - 1 && knots[k + 1] <= u) k++
    const d = []
    for (let j = 0; j <= degree; j++) {
      const p = points[k - degree + j]
      const w = p.weight > 0 ? p.weight : 1
      d.push([p.x * w, p.y * w, w])
    }
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const i = k - degree + j
        const denom = knots[i + degree - r + 1] - knots[i]
        const a = denom > 0 ? (u - knots[i]) / denom : 0
        d[j] = d[j].map((v, c) => (1 - a) * d[j - 1][c] + a * v)
      }
    }
    const [x, y, w] = d[degree]
    out.push({ x: x / w, y: y / w })
  }
  return out
}

// visualization → { planned: [{x, y}], intermediate: [{x, y}] }; нет полей — пустые
export function robotPathOf(message) {
  const planned = message?.plannedPath?.trajectory ? sampleNurbs(message.plannedPath.trajectory) : []
  const intermediate = (message?.intermediatePath?.polyline || [])
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map(({ x, y }) => ({ x, y }))
  return { planned, intermediate }
}
