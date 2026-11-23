import { AVAILABILITY } from './availability'

// Размер робота, пока его нет в factsheet: типовой AMR, метры
export const DEFAULT_FOOTPRINT = { length: 0.9, width: 0.6 }

export function robotLook(robot) {
  const meta = AVAILABILITY[robot?.availability?.state]
  return {
    color: meta?.color || '#94a3b8',
    label: meta?.label || 'Unknown',
  }
}

/**
 * Размер на карте, пиксели картинки: метры / (метров в пикселе), но не меньше minLength — чтобы при
 * отдалении робот не превращался в точку (minLength считает Live Map из масштаба экрана).
 */
export function footprintPx(resolution, minLength = 0, footprint = DEFAULT_FOOTPRINT) {
  const r = resolution > 0 ? resolution : 0.05
  const length = footprint.length / r
  const k = Math.max(1, minLength / length)
  return { length: length * k, width: (footprint.width / r) * k }
}
