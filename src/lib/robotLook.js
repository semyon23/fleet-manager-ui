/**
 * Вид робота (M-4): вид сверху в реальном масштабе, нос — бампер и шеврон, состояние — цвет.
 * Цвет и подпись — из той же таблицы готовности, что везде в UI (lib/availability.js).
 */
import { AVAILABILITY } from './availability'

// Размер робота, пока его нет в factsheet: типовой AMR, метры
export const DEFAULT_FOOTPRINT = { length: 0.9, width: 0.6 }

// Меньше — не разглядеть нос даже при сильном приближении
const MIN_PX = 8

export function robotLook(robot) {
  const state = robot?.availability?.state
  const meta = AVAILABILITY[state]
  return {
    color: meta?.color || '#94a3b8',
    label: meta?.label || 'Unknown',
    mark: state === 'PAUSED' ? 'pause' : state === 'ERROR' ? 'error' : 'chevron',
    // Связи нет, удаляется или готовность ещё не посчитана — пунктирный контур
    dashed: !meta || state === 'OFFLINE' || state === 'DELETING',
  }
}

// Размер на карте, пиксели картинки: метры / (метров в пикселе)
export function footprintPx(resolution, footprint = DEFAULT_FOOTPRINT) {
  const r = resolution > 0 ? resolution : 0.05
  return {
    length: Math.max(MIN_PX, footprint.length / r),
    width: Math.max(MIN_PX * (footprint.width / footprint.length), footprint.width / r),
  }
}
