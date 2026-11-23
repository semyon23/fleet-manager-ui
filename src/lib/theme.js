// Цвета объектов карты. Палитра оболочки задаётся в src/assets/main.css.
// Типы станций сохраняют свои цвета в обеих темах.

// === Станции: цвет + иконка по типу ===
// Используется в Map Editor'е (#override-node) и Live Map.
export const STATION_KINDS = [
  { label: 'Charge',  value: 'charge',  color: '#059669', icon: 'bolt' },
  { label: 'Loading', value: 'loading', color: '#ea580c', icon: 'loading' },
  { label: 'Parking', value: 'parking', color: '#dc2626', icon: 'p' },
  { label: 'Custom',  value: 'custom',  color: '#2563eb', icon: 'star' },
]
export function stationKindMeta(kind) {
  return STATION_KINDS.find((k) => k.value === kind) || STATION_KINDS[3]
}
export function stationColorFor(kind) {
  return stationKindMeta(kind).color
}
export function stationIconFor(kind) {
  return stationKindMeta(kind).icon
}

// === Ноды waypoint по умолчанию ===
export const WAYPOINT = {
  color: 'var(--ui-muted)',
  colorHover: 'var(--ui-link)',
  colorSelect: 'var(--ui-primary)',
  radius: 5,
  strokeWidth: 1.5,
  strokeColor: 'var(--ui-canvas)',
}

// === Edges ===
export const EDGE = {
  color: 'var(--ui-muted)',
  colorHover: 'var(--ui-link)',
  colorSelect: 'var(--ui-primary)',
  width:       2,
  widthHover:  3,
  // Сплошная линия: пунктир начинается заново на каждом ребре,
  // и дорога из коротких рёбер выглядит рваной на вершинах.
  dasharray:   0,
  linecap:     'round',
}

// === Grid ===
export const GRID = {
  line:  { color: 'color-mix(in srgb, var(--ui-border) 54%, var(--ui-canvas))', width: 1, dasharray: 1 },
  thick: { color: 'var(--ui-border)', width: 1, dasharray: 0 },
}
