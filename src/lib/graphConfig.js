import { WAYPOINT, EDGE, GRID } from './theme'

/**
 * Конфиг рендера графа — под vda5050-lif-editor стилистику.
 *
 * КРИТИЧНО: v-network-graph state-конфиги (normal/hover/selected) НЕ наследуют
 * `type` и `radius` друг от друга. Если в `selected` не указать type='circle',
 * то при потере hover'а (курсор ушёл) v-network-graph fallback'ится на дефолт
 * `type: 'rect'` — а без width/height/radius атрибуты получают NaN → SVG-ошибки
 * и нода пропадает. Поэтому явно дублируем type/radius во всех состояниях.
 */
const shape = {
  type: 'circle',
  radius: WAYPOINT.radius,
  strokeWidth: WAYPOINT.strokeWidth,
  strokeColor: WAYPOINT.strokeColor,
}

export const initialConfigs = {
  view: {
    minZoomLevel: 0.1,
    maxZoomLevel: 200,
    scalingObjects: false,
    // Двойной клик в редакторе завершает рисование зоны — зумить по нему нельзя
    doubleClickZoomEnabled: false,
    grid: {
      visible: true,
      interval: 1,
      thickIncrements: 5,
      line: GRID.line,
      thick: GRID.thick,
    },
  },
  node: {
    draggable: true,
    selectable: true,
    normal: {
      ...shape,
      color: (n) => n.color || WAYPOINT.color,
    },
    hover: {
      ...shape,
      color: (n) => n.color || WAYPOINT.colorHover,
    },
    selected: {
      ...shape,
      color: WAYPOINT.colorSelect,
    },
    focusring: { color: WAYPOINT.colorSelect },
    label: {
      visible: true,
      fontSize: 10,
      color: 'var(--ui-text)',
      direction: 'north',
      margin: 6,
      background: { visible: false },
    },
  },
  edge: {
    selectable: true,
    gap: 8,
    normal: {
      width: EDGE.width,
      color: EDGE.color,
      dasharray: EDGE.dasharray,
      linecap: EDGE.linecap,
    },
    hover: {
      color: EDGE.colorHover,
      width: EDGE.widthHover,
    },
    selected: {
      color: EDGE.colorSelect,
      width: EDGE.widthHover,
    },
    summarized: {
      label: { color: 'var(--ui-text)' },
      shape: { color: 'var(--ui-surface)', strokeColor: EDGE.color },
      stroke: { color: EDGE.color },
    },
    label: {
      color: 'var(--ui-text)',
      fontSize: 10,
      visible: false,
    },
    marker: {
      target: {
        type: 'arrow',
        width: 4,
        height: 4,
        margin: -1,
        offset: 0,
        units: 'strokeWidth',
        color: null,
      },
    },
  },
}

export const graphConfigs = initialConfigs
