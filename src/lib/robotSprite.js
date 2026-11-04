/**
 * Выбор нужной картинки робота по heading.
 * У робота может быть либо статичный `sprite: string`,
 * либо направленный набор `sprites: { n, ne, e, se, s, sw, w, nw, top }`.
 */

const DIRS = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se']

/**
 * Ближайшее из 8 направлений для угла theta (радианы, math-convention: 0=E, π/2=N).
 */
export function pickDir(theta) {
  const step = Math.PI / 4
  let idx = Math.round(theta / step)
  idx = ((idx % 8) + 8) % 8
  return DIRS[idx]
}

/**
 * URL картинки для робота под данный heading.
 * Робот не едет (status.driving = false) — top view, если он есть.
 */
export function spriteFor(robot) {
  if (!robot) return null
  if (!robot.sprites) return robot.sprite || null
  const s = robot.sprites
  if (!robot.driving && s.top) return s.top
  const dir = pickDir(robot.theta || 0)
  return s[dir] || s.top || null
}

/**
 * URL для превью-иконок (таблицы, дашборд). Всегда top если есть — плоско читается.
 */
export function previewSpriteFor(robot) {
  if (!robot) return null
  if (robot.sprites) return robot.sprites.top || robot.sprites.n || robot.sprite
  return robot.sprite || null
}

/**
 * Тон спрайта по availability.state. Спрайт синий — это BUSY; остальные состояния — поворот
 * оттенка к их цвету из lib/availability.js. Состояния без поворота (OFFLINE, DELETING,
 * ещё не посчитано) — серые. Live Map строит из той же таблицы SVG-фильтры tint-<state>.
 */
export const TINT_HUES = { IDLE: -100, BUSY: 0, CHARGING: -160, PAUSED: 45, NOT_READY: 165, ERROR: 140 }

// CSS-filter для <img> вне SVG
export function tintStyle(robot) {
  const hue = TINT_HUES[robot?.availability?.state]
  if (hue === undefined) return 'filter: grayscale(1) opacity(0.5)'
  return hue ? `filter: hue-rotate(${hue}deg)` : ''
}

// id SVG-фильтра для <image> на карте
export function tintFilterId(robot) {
  const state = robot?.availability?.state
  return state in TINT_HUES ? `tint-${state}` : 'tint-gray'
}
