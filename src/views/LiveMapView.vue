<script setup>
import { useRobotsStore } from '../stores/robots'
import { useMapsStore } from '../stores/maps'
import { NCard, NSelect, NButton, NPopover, NCheckbox } from 'naive-ui'
import { ref, shallowRef, computed, watch, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { robotLook, footprintPx } from '../lib/robotLook'
import { createLiveRoutePoller } from '../lib/liveRoutePolling'
import { releasedPoints, plannedPoints, goalPoints, toPolyline, routePolylines, routeColorFor } from '../lib/robotRoutes'
import * as api from '../api'
import { stationKindMeta } from '../lib/theme'
import { zoneTypeMeta } from '../lib/vda5050'
import { worldToPixel } from '../lib/nav2meta'
import { worldAngleToSvgDeg } from '../lib/geometry'
import { useSelectedRobotMission } from '../composables/useSelectedRobotMission'
import PlaceRobotDialog from '../components/PlaceRobotDialog.vue'
import MapRobotShape from '../components/MapRobotShape.vue'
import LiveRobotList from '../components/LiveRobotList.vue'
import RobotDiagnostics from '../components/RobotDiagnostics.vue'
import FleetStatusTag from '../components/FleetStatusTag.vue'

const robots = useRobotsStore()
const maps = useMapsStore()
const route = useRoute()
const router = useRouter()

const selectedId = ref(null)
const selected = computed(() => robots.robots.find(r => r.id === selectedId.value))
const selectedLook = computed(() => robotLook(selected.value))
const hoveredId = ref(null)
const following = ref(false)
const detailsOpen = ref(false)
const detailsToggle = ref(null)

function hasPosition(r) {
  return !!r?.mapId && r.positionInitialized && Number.isFinite(r.x) && Number.isFinite(r.y)
}
function isLastReported(robot) {
  return robot.connection !== 'ONLINE' || robot.availability?.state === 'OFFLINE' || !!robots.lastPollError
}
const lastReported = computed(() => selected.value && isLastReported(selected.value))
const diagnosticMission = useSelectedRobotMission(() => {
  const robot = selected.value
  return detailsOpen.value && robot?.lastStateAt && !lastReported.value && !robot.driving ? robot : null
})

function focusRobot(id) {
  selectedId.value = id
  following.value = !!id
  hoveredId.value = null
  if (id) {
    mapPicked.value = true
    detailsOpen.value = true
  }
}

function selectRobot(id) {
  if (route.query.robotId === id) focusRobot(id)
  else router.replace({ query: { ...route.query, robotId: id } })
}

// Карт может быть несколько сразу: робот на той, что в его pose.mapId. Пока оператор карту не выбрал сам —
// показываем ту, на которой есть роботы (роботы приходят опросом позже карт), иначе первую.
const selectedMapId = ref(null)
const mapPicked = ref(false)
watch(() => route.query.robotId, (id) => {
  focusRobot(typeof id === 'string' && id ? id : null)
}, { immediate: true })
watchEffect(() => {
  if (following.value && selectedId.value) {
    selectedMapId.value = selected.value?.mapId || null
    return
  }
  if (mapPicked.value && maps.get(selectedMapId.value)) return
  const withRobots = maps.maps.find((m) => robots.robots.some((r) => r.mapId === m.id))
  selectedMapId.value = (withRobots || maps.maps[0])?.id || null
})
function pickMap(id) {
  focusRobot(null)
  if (route.query.robotId) router.replace({ query: { ...route.query, robotId: undefined } })
  selectedMapId.value = id
  mapPicked.value = true
}

// Граф и картинка — только у открытой карты (store.open); пока грузится — пустое поле
const activeMap = computed(() => {
  const m = selectedMapId.value ? maps.get(selectedMapId.value) : null
  return m?.full ? m : null
})
const mapUnavailable = ref(false)
async function loadMap(id) {
  mapUnavailable.value = false
  if (!id) return
  try {
    await maps.open(id)
  } catch {
    if (selectedMapId.value === id) mapUnavailable.value = true
  }
}
watch([selectedMapId, () => !!activeMap.value], ([id, loaded]) => {
  if (!loaded) loadMap(id)
}, { immediate: true })
const mapOptions = computed(() =>
  maps.maps.length ? maps.maps.map((m) => ({ label: m.name, value: m.id })) : [],
)

function closeDetails() {
  detailsOpen.value = false
  detailsToggle.value.$el.focus()
}

// Размер окна карты на экране — следим, чтобы знать, сколько экранных пикселей в пикселе карты
const svgBox = ref({ w: 0, h: 0 })
let resizeObserver = null
onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    svgBox.value = { w: entry.contentRect.width, h: entry.contentRect.height }
  })
  if (!svgRef.value) return
  const rect = svgRef.value.getBoundingClientRect()   // сразу, не дожидаясь первого события
  svgBox.value = { w: rect.width, h: rect.height }
  resizeObserver.observe(svgRef.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
// Пикселей карты в одном экранном пикселе (SVG вписан в окно, preserveAspectRatio meet, и ещё zoom) —
// для того, что на экране должно быть одного размера при любом zoom: робот, подписи
const perScreenPx = computed(() => {
  const fit = Math.min(svgBox.value.w / viewSize.value.w, svgBox.value.h / viewSize.value.h) || 1
  return 1 / (zoom.value * fit)
})

// Нижний предел сохраняет различимыми указатель направления и груз на общем плане.
const ROBOT_MIN_SCREEN_PX = 38
const robotSize = computed(() =>
  footprintPx(activeMap.value?.meta?.resolution, ROBOT_MIN_SCREEN_PX * perScreenPx.value))
const detailedRobots = computed(() => robotSize.value.length / perScreenPx.value >= 44)

const filteredRobots = computed(() =>
  activeMap.value ? robots.robots.filter((r) => r.mapId === activeMap.value.id && hasPosition(r)) : [],
)
const elsewhereCount = computed(() => robots.robots.filter((r) => r.mapId !== selectedMapId.value).length)
const showPlace = ref(false)

// === Слои карты: что показывать — выбирает оператор, запоминаем в этом браузере ===
const LAYERS = [
  { key: 'zones', label: 'Zones' },
  { key: 'roads', label: 'Roads' },
  { key: 'nodeLabels', label: 'Node names' },
  { key: 'stations', label: 'Stations' },
  { key: 'routes', label: 'Routes from fms (released)', hint: 'Solid line in the robot’s color' },
  { key: 'planned', label: 'Planned by traffic (waiting for release)', hint: 'Dashed line in the robot’s color' },
  { key: 'goals', label: 'Mission goals' },
  { key: 'robotLabels', label: 'Robot names' },
  { key: 'robotPath', label: 'Path planned by the robot', hint: 'Dotted plan and dash-dot intermediate path from VDA visualization' },
]
const LAYERS_KEY = 'fm.liveMap.layers'
function loadLayers() {
  const all = Object.fromEntries(LAYERS.map((l) => [l.key, !l.disabled]))
  try { return { ...all, ...JSON.parse(localStorage.getItem(LAYERS_KEY) || '{}') } } catch { return all }
}
const layers = ref(loadLayers())
watch(layers, (v) => { try { localStorage.setItem(LAYERS_KEY, JSON.stringify(v)) } catch { /* приватный режим */ } }, { deep: true })
const showRoutes = computed(() => layers.value.roads)
const showZones = computed(() => layers.value.zones)
const showRobotRoutes = computed(() => layers.value.routes || layers.value.planned || layers.value.goals)

// === Маршруты роботов (контракт 7.4): опрос, пока страница открыта и вкладка видна (9.1) ===
const ROUTES_POLL_MS = 1500
const routeData = shallowRef()
const staleStarts = new Map()
const routePoller = createLiveRoutePoller({
  listRoutes: api.routes.listRoutes,
  isVisible: () => !document.hidden,
  onChange(snapshot) {
    staleStarts.clear()
    if (snapshot.status === 'stale') {
      // Зафиксировать начало видимой линии до того, как придёт следующая MQTT-поза.
      for (const m of markers.value) {
        if (m.route) staleStarts.set(m.id, { x: m.px, y: m.py })
      }
    }
    routeData.value = snapshot
  },
})
watch(selectedMapId, (id) => routePoller.selectMap(id), { immediate: true })
let routesTimer = null
onMounted(() => {
  routesTimer = setInterval(routePoller.refresh, ROUTES_POLL_MS)
  document.addEventListener('visibilitychange', routePoller.refresh)
})
onBeforeUnmount(() => {
  clearInterval(routesTimer)
  document.removeEventListener('visibilitychange', routePoller.refresh)
  routePoller.dispose()
})
const routeByRobot = computed(() => new Map(routeData.value.routes.map((r) => [r.robotId, r])))
const routesStale = computed(() => routeData.value.status === 'stale')
const routeNotice = computed(() => {
  if (routeData.value.status === 'unavailable') return 'Routes unavailable'
  if (!routesStale.value) return ''
  return 'Route data is out of date · Last updated ' + new Date(routeData.value.updatedAt).toLocaleString('en-GB')
})

// Зоны карты из редактора: полупрозрачные полигоны под маршрутами, только для просмотра
const zones = computed(() => {
  if (!showZones.value || !activeMap.value?.zones?.length) return []
  return activeMap.value.zones
    .filter((z) => (z.vertices || []).length >= 3)
    .map((z) => {
      const meta = zoneTypeMeta(z.type)
      return {
        id: z.id,
        color: meta.color,
        label: z.name || meta.label,
        points: z.vertices.map((p) => `${PADDING + p.u},${PADDING + p.v}`).join(' '),
        cx: PADDING + z.vertices.reduce((a, p) => a + p.u, 0) / z.vertices.length,
        cy: PADDING + z.vertices.reduce((a, p) => a + p.v, 0) / z.vertices.length,
      }
    })
})

const ZOOM_MIN = 0.25
const ZOOM_MAX = 5
const ZOOM_STEP = 1.25
const zoom = ref(1)
const cameraCenter = ref(null)

function zoomIn() { zoom.value = Math.min(ZOOM_MAX, zoom.value * ZOOM_STEP) }
function zoomOut() { zoom.value = Math.max(ZOOM_MIN, zoom.value / ZOOM_STEP) }
function zoomReset() {
  following.value = false
  cameraCenter.value = null
  zoom.value = 1
}

watch(selectedMapId, () => {
  cameraCenter.value = null
  zoom.value = 1
  hoveredId.value = null
}, { flush: 'sync' })

const PADDING = 60

const viewSize = computed(() =>
  activeMap.value ? { w: activeMap.value.width + PADDING * 2, h: activeMap.value.height + PADDING * 2 } : { w: 700, h: 600 },
)
// SVG, подложка, сетка и роботы используют одну систему координат карты.
const center = computed(() => cameraCenter.value ?? { x: viewSize.value.w / 2, y: viewSize.value.h / 2 })
const viewport = computed(() => {
  const width = svgBox.value.w > 0 ? svgBox.value.w * perScreenPx.value : viewSize.value.w
  const height = svgBox.value.h > 0 ? svgBox.value.h * perScreenPx.value : viewSize.value.h
  return { x: center.value.x - width / 2, y: center.value.y - height / 2, width, height }
})
const viewBox = computed(() => {
  const { x, y, width, height } = viewport.value
  return `${x} ${y} ${width} ${height}`
})
// При отдалении прореживаем линии по степеням двойки, сохраняя привязку к карте.
const gridStep = computed(() => {
  const baseStep = 25
  const minSpacing = 12 * perScreenPx.value
  const levels = Math.max(0, Math.ceil(Math.log2(minSpacing / baseStep)))
  return baseStep * 2 ** levels
})

const svgRef = ref(null)
const isDragging = ref(false)
let dragStart = null

function startPan(e) {
  if (e.button === 0 && e.isPrimary) dragStart = { id: e.pointerId, x: e.clientX, y: e.clientY }
}
function pan(e) {
  if (e.pointerId !== dragStart?.id) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  if (!isDragging.value) {
    if (Math.hypot(dx, dy) < 4) return
    dragStart.center = center.value
    isDragging.value = true
    following.value = false
    hoveredId.value = null
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  cameraCenter.value = {
    x: dragStart.center.x - dx * perScreenPx.value,
    y: dragStart.center.y - dy * perScreenPx.value,
  }
}
function endPan(e) {
  if (e.pointerId !== dragStart?.id) return
  isDragging.value = false
  dragStart = null
}

const stations = computed(() => {
  if (!layers.value.stations || !activeMap.value?.stations?.length) return []
  return activeMap.value.stations.map((st) => {
    const meta = stationKindMeta(st.kind)
    return {
      id: st.id,
      name: st.name || st.id,
      kind: st.kind,
      x: PADDING + st.u,
      y: PADDING + st.v,
      color: meta.color,
      icon: meta.icon,
    }
  })
})

const waypoints = computed(() => {
  if (!showRoutes.value || !activeMap.value?.waypoints?.length) return []
  return activeMap.value.waypoints.map((wp) => ({
    id: wp.id,
    name: wp.name || wp.id,
    x: PADDING + wp.u,
    y: PADDING + wp.v,
  }))
})

// Обратные рёбра образуют одну дорогу с парными стрелками.
const roads = computed(() => {
  if (!showRoutes.value || !activeMap.value?.edges?.length) return []
  const m = activeMap.value
  // Рёбра могут идти и к станциям, не только к waypoints
  const byId = new Map([...(m.waypoints || []), ...(m.stations || [])].map((n) => [n.id, n]))
  const pairs = new Map()
  for (const e of m.edges) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b || a === b) continue
    const key = JSON.stringify(e.from < e.to ? [e.from, e.to] : [e.to, e.from])
    const cur = pairs.get(key)
    if (cur) { cur.twoWay = cur.twoWay || cur.from !== e.from; continue }
    pairs.set(key, { key, from: e.from, a, b, twoWay: false })
  }
  return [...pairs.values()].map(({ key, a, b, twoWay }) => {
    const x1 = PADDING + a.u
    const y1 = PADDING + a.v
    const x2 = PADDING + b.u
    const y2 = PADDING + b.v
    const screenLength = Math.hypot(x2 - x1, y2 - y1) / perScreenPx.value
    const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
    const count = screenLength < (twoWay ? 30 : 22) ? 0 : Math.min(12, Math.max(1, Math.floor(screenLength / 100)))
    const arrows = []
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1)
      arrows.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t })
    }
    return { id: key, d: `M ${x1} ${y1} L ${x2} ${y2}`, twoWay, deg, arrows }
  })
})

// Поза робота — метры карты; на экране — пиксели картинки карты (как узлы), ось Y вниз
const markers = computed(() =>
  filteredRobots.value.map((r) => {
    const { u, v } = worldToPixel(activeMap.value.meta, r.x, r.y, activeMap.value.height)
    const look = robotLook(r)
    const missionLabel = r.mission?.length > 15
      ? `${r.mission.slice(0, 6)}…${r.mission.slice(-7)}`
      : r.mission || (r.lastStateAt ? 'No mission' : '—')
    return {
      ...r,
      px: PADDING + u,
      py: PADDING + v,
      stroke: look.color,
      stateLabel: look.label,
      labelWidth: 18 + r.id.length * 7.3,
      missionLabel,
      missionWidth: 12 + missionLabel.length * 6.7,
      moving: r.driving && !isLastReported(r),
      rotateDeg: worldAngleToSvgDeg(r.theta),
      route: routeByRobot.value.get(r.id) || null,
      routeColor: routeColorFor(r.id),
    }
  }),
)
const selectedMarker = computed(() => markers.value.find(m => m.id === selectedId.value))
const selectedRoute = computed(() => selectedMarker.value?.route)
const markersInDrawOrder = computed(() => selectedMarker.value
  ? [...markers.value.filter((m) => m.id !== selectedId.value), selectedMarker.value]
  : markers.value)

watchEffect(() => {
  if (!following.value) return
  const target = selectedMarker.value
  if (!Number.isFinite(target?.px) || !Number.isFinite(target?.py)) return
  cameraCenter.value = { x: target.px, y: target.py }
})

// Узел карты → точка на картинке (как у дорог); узла нет — null
const nodePositions = computed(() => {
  const m = activeMap.value
  if (!m) return new Map()
  return new Map([...(m.waypoints || []), ...(m.stations || [])].map((n) => [n.id, { x: PADDING + n.u, y: PADDING + n.v }]))
})
const position = (id) => nodePositions.value.get(id) || null

// Путь, который робот рассчитал сам (VDA visualization): метры карты → пиксели картинки
const robotPaths = computed(() => {
  if (!layers.value.robotPath || !activeMap.value) return []
  const toPx = ({ x, y }) => {
    const { u, v } = worldToPixel(activeMap.value.meta, x, y, activeMap.value.height)
    return { x: PADDING + u, y: PADDING + v }
  }
  return markersInDrawOrder.value
    .filter((m) => m.path && (m.path.planned.length > 1 || m.path.intermediate.length > 1))
    .map((m) => ({
      id: m.id,
      color: m.routeColor,
      planned: m.path.planned.length > 1 ? toPolyline(m.path.planned.map(toPx)) : '',
      intermediate: m.path.intermediate.length > 1 ? toPolyline(m.path.intermediate.map(toPx)) : '',
    }))
})

// Выбранный маршрут рисуется последним; неизвестные узлы образуют разрыв.
const routeLines = computed(() => {
  if (!showRobotRoutes.value) return []
  const geometry = { keepGaps: true }
  return markersInDrawOrder.value
    .filter((m) => m.route)
    .map((m) => ({
      id: m.id,
      color: m.routeColor,
      selected: m.id === selectedId.value,
      released: routePolylines(releasedPoints(m.route, position,
        routesStale.value ? staleStarts.get(m.id) : { x: m.px, y: m.py }, geometry)),
      planned: routePolylines(plannedPoints(m.route, position, geometry)),
      goals: goalPoints(m.route, position),
    }))
})
const hovered = computed(() => markers.value.find(m => m.id === hoveredId.value))
const tooltipTransform = computed(() => {
  const { x, y, width, height } = viewport.value
  const unit = perScreenPx.value
  const left = Math.max(x, Math.min(hovered.value.px + 24 * unit, x + width - 160 * unit))
  const top = Math.max(y, Math.min(hovered.value.py - 36 * unit, y + height - 72 * unit))
  return `translate(${left} ${top}) scale(${unit})`
})
</script>

<template>
  <div class="grid grid-cols-1 gap-6" :class="{ 'lg:grid-cols-4': detailsOpen }">
    <NCard size="small" :class="{ 'lg:col-span-3': detailsOpen }" header-style="flex-wrap: wrap; gap: 8px 12px">
      <template #header>
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-base font-semibold">Live Map</span>
          <NSelect
            v-if="mapOptions.length"
            :value="selectedMapId"
            :options="mapOptions"
            size="small"
            style="width: 240px; max-width: 100%"
            @update:value="pickMap"
          />
          <router-link v-else-if="!selectedId" to="/maps" class="text-xs text-(color:--ui-link) hover:underline">
            No maps uploaded yet -> upload one
          </router-link>
          <span v-if="mapOptions.length && elsewhereCount" class="text-xs text-slate-500 dark:text-slate-400">
            {{ elsewhereCount }} {{ elsewhereCount === 1 ? 'robot' : 'robots' }} on other maps or without a map
          </span>
        </div>
      </template>
      <template #header-extra>
        <NButton ref="detailsToggle" size="small" tertiary class="mr-2" :type="detailsOpen ? 'primary' : 'default'"
                 :aria-expanded="detailsOpen" aria-controls="live-map-robot-details" @click="detailsOpen = !detailsOpen">
          Robot details
          <span aria-hidden="true" class="ml-1">{{ detailsOpen ? '▴' : '▾' }}</span>
        </NButton>
        <NPopover trigger="click" placement="bottom-end">
          <template #trigger>
            <NButton size="small" tertiary>Layers ▾</NButton>
          </template>
          <div class="flex flex-col gap-1.5 py-1">
            <NCheckbox v-for="l in LAYERS" :key="l.key" v-model:checked="layers[l.key]" :disabled="l.disabled"
                       :title="l.hint">
                <span v-if="l.key === 'routes' || l.key === 'planned'" aria-hidden="true" class="route-sample"
                      :class="{ 'awaiting-release': l.key === 'planned' }"></span>
              <span class="text-sm">{{ l.label }}</span>
              <span v-if="l.hint" class="block text-[11px] text-(color:--ui-muted)">{{ l.hint }}</span>
            </NCheckbox>
          </div>
        </NPopover>
      </template>

      <div
        class="relative overflow-hidden rounded border border-(--ui-border) bg-(--ui-canvas)"
        style="height: calc(100vh - 11rem); min-height: 480px"
      >
        <svg
          ref="svgRef"
          class="h-full w-full touch-none select-none"
          :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
          :viewBox="viewBox"
          preserveAspectRatio="xMidYMid meet"
          @pointerdown="startPan"
          @pointermove="pan"
          @pointerup="endPan"
          @pointercancel="endPan"
          @lostpointercapture.self="endPan"
          @pointerleave="!isDragging && endPan($event)"
        >
          <defs>
            <pattern id="live-map-grid" patternUnits="userSpaceOnUse"
                     :x="PADDING" :y="PADDING" :width="gridStep" :height="gridStep" :viewBox="`0 0 ${gridStep} ${gridStep}`">
              <path :d="`M ${gridStep} 0 H 0 V ${gridStep}`" fill="none" stroke="var(--ui-border)" :stroke-width="1.4 * perScreenPx" />
            </pattern>
          </defs>

          <image
            v-if="activeMap?.pgmDataUrl"
            :href="activeMap.pgmDataUrl"
            :x="PADDING" :y="PADDING"
            :width="activeMap.width"
            :height="activeMap.height"
            preserveAspectRatio="none"
            class="opacity-80 dark:opacity-60 dark:invert"
          />
          <rect v-bind="viewport" fill="url(#live-map-grid)" />

          <g v-if="zones.length">
            <g v-for="z in zones" :key="z.id">
              <polygon :points="z.points" :fill="z.color" fill-opacity="0.15" :stroke="z.color" stroke-opacity="0.8" stroke-width="1" />
              <text :x="z.cx" :y="z.cy" text-anchor="middle" dominant-baseline="middle" font-size="7"
                    font-family="system-ui, sans-serif" font-weight="600" class="map-label">{{ z.label }}</text>
            </g>
          </g>

          <g v-if="roads.length" fill="none" pointer-events="none">
            <g v-for="r in roads" :key="r.id">
              <path class="map-road" :d="r.d" :data-two-way="r.twoWay" stroke="var(--ui-muted)"
                    stroke-opacity=".65" stroke-width="1.25" vector-effect="non-scaling-stroke" />
              <path v-for="(arrow, i) in r.arrows" :key="i" class="road-direction"
                    :transform="`translate(${arrow.x} ${arrow.y}) rotate(${r.deg}) scale(${perScreenPx})`"
                    :d="r.twoWay ? 'M-9 0l5-2.6v5.2zM9 0l-5-2.6v5.2z' : 'M3.5 0l-6-3v6z'"
                    fill="var(--ui-muted)" />
            </g>
          </g>

          <!-- Собственная траектория робота находится под маршрутом FMS. -->
          <g v-for="p in robotPaths" :key="'path-' + p.id" class="robot-trajectory" :data-robot-id="p.id"
             :stroke="p.color" fill="none" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"
             :opacity="selectedId && p.id !== selectedId ? 0.45 : 0.8">
            <polyline v-if="p.planned" :points="p.planned" stroke-width="1.6" stroke-dasharray="0.5 4"
                      vector-effect="non-scaling-stroke" />
            <polyline v-if="p.intermediate" :points="p.intermediate" stroke-width="1.8" stroke-dasharray="7 3 0.5 3"
                      vector-effect="non-scaling-stroke" />
          </g>

          <g :opacity="routesStale ? 0.5 : 1" fill="none" stroke-linecap="round" stroke-linejoin="round" pointer-events="none">
            <g v-for="r in routeLines" :key="r.id" class="fleet-route" :data-robot-id="r.id" :stroke="r.color"
               :opacity="r.selected || !selectedId ? 1 : 0.55">
              <template v-if="layers.routes">
                <polyline v-for="(points, i) in r.released" :key="i" class="route-released" :points="points"
                          :stroke-width="r.selected ? 3.3 : 2.4" vector-effect="non-scaling-stroke" />
              </template>
              <template v-if="layers.planned">
                <polyline v-for="(points, i) in r.planned" :key="i" class="route-planned" :points="points"
                          :stroke-width="r.selected ? 2.6 : 2" stroke-dasharray="7 5" vector-effect="non-scaling-stroke" />
              </template>
            </g>
          </g>

          <!-- Узлы остаются видны в местах, где сходятся несколько маршрутов. -->
          <g v-if="showRoutes">
            <g v-for="wp in waypoints" :key="wp.id" :transform="`translate(${wp.x} ${wp.y}) scale(${perScreenPx})`">
              <circle class="map-waypoint" r="3.4" fill="#7599c4" stroke="var(--ui-surface)" stroke-width="1.35" />
              <text v-if="layers.nodeLabels" y="-7" text-anchor="middle" font-size="10" font-family="ui-monospace, monospace"
                    class="map-label">{{ wp.name }}</text>
            </g>
          </g>

          <g v-for="st in stations" :key="st.id" :transform="`translate(${st.x} ${st.y})`">
            <rect x="-10" y="-10" width="20" height="20" rx="4"
                  :fill="st.color" stroke="#ffffff" stroke-width="1.2"
                  filter="drop-shadow(0 1px 2px rgba(0,0,0,0.25))" />
            <g fill="#ffffff" stroke="none" pointer-events="none">
              <path v-if="st.icon === 'bolt'" d="M-2.2 -6 L 3 -0.7 L 0 -0.7 L 2.2 6 L -3 0.7 L 0 0.7 Z" />
              <text v-else-if="st.icon === 'p'" x="0" y="3" text-anchor="middle"
                    font-size="10" font-weight="700" font-family="system-ui, sans-serif">P</text>
              <path v-else-if="st.icon === 'loading'" d="M0 -6 L 2.5 -1.8 L 0.7 -1.8 L 0.7 1.8 L 2.5 1.8 L 0 6 L -2.5 1.8 L -0.7 1.8 L -0.7 -1.8 L -2.5 -1.8 Z" />
              <polygon v-else-if="st.icon === 'star'" points="0,-6 1.7,-1.8 6,-1.8 2.5,0.7 3.9,4.9 0,2.4 -3.9,4.9 -2.5,0.7 -6,-1.8 -1.7,-1.8" />
            </g>
            <text y="18" text-anchor="middle" font-size="7" font-family="JetBrains Mono, monospace" class="map-label">
              {{ st.name }}
            </text>
          </g>

          <g v-if="layers.goals" :opacity="routesStale ? 0.5 : 1" pointer-events="none">
            <g v-for="r in routeLines" :key="r.id" :stroke="r.color" :opacity="r.selected || !selectedId ? 1 : 0.55">
              <rect v-for="(goal, index) in r.goals" :key="index" x="-4.5" y="-4.5" width="9" height="9" rx="1"
                    :transform="`translate(${goal.x} ${goal.y}) scale(${perScreenPx}) rotate(45)`"
                    fill="none" :stroke-width="r.selected ? 2 : 1.4" />
            </g>
          </g>

          <g
            v-for="m in markersInDrawOrder"
            :key="m.id"
            class="robot-marker"
            :class="{ 'is-followed': following && m.id === selectedId }"
            :style="{ transform: `translate(${m.px}px, ${m.py}px)`, '--robot-route-color': m.routeColor }"
            role="button"
            tabindex="0"
            :aria-label="`${m.id} · ${m.stateLabel}`"
            :aria-pressed="m.id === selectedId"
            @click.stop="selectRobot(m.id)"
            @keydown.enter.prevent="selectRobot(m.id)"
            @keydown.space.prevent="selectRobot(m.id)"
            @mouseenter="!isDragging && (hoveredId = m.id)"
            @mouseleave="hoveredId = null"
          >
            <!-- Невидимая подложка: попасть мышью по маленькому роботу -->
            <circle :r="Math.max(robotSize.length * 0.75, 22 * perScreenPx)" fill="transparent" />
            <MapRobotShape
              :length="robotSize.length"
              :color="m.stroke"
              :rotate="m.rotateDeg"
              :selected="m.id === selectedId"
              :detailed="detailedRobots"
              :loaded="m.loads.length > 0"
              :driving="m.moving"
            />
            <g v-if="layers.robotLabels">
              <g class="robot-mission" :class="{ 'has-mission': m.mission }"
                 :transform="`translate(${robotSize.length * 0.35 + 10 * perScreenPx} ${-robotSize.length * 0.54}) scale(${perScreenPx})`">
                <title>{{ m.mission || m.missionLabel }}</title>
                <path d="M-15 5L-8 -2" fill="none" stroke="currentColor" stroke-dasharray="1 2" />
                <rect :x="-m.missionWidth / 2" y="-19" :width="m.missionWidth" height="17" rx="2"
                      fill="var(--ui-surface)" stroke="var(--ui-border)" />
                <line :x1="2 - m.missionWidth / 2" :x2="m.missionWidth / 2 - 2" y1="-2" y2="-2" stroke="currentColor" stroke-width="2" />
                <text text-anchor="middle" y="-7" fill="currentColor" font-size="11" font-family="ui-monospace, monospace">{{ m.missionLabel }}</text>
              </g>
              <g class="robot-name" :transform="`translate(0 ${robotSize.length * 0.6 + 11 * perScreenPx}) scale(${perScreenPx})`">
                <rect :x="-m.labelWidth / 2" y="-8" :width="m.labelWidth" height="16" rx="3" fill="var(--ui-surface)" fill-opacity=".94" />
                <circle :cx="6 - m.labelWidth / 2" r="2.5" :fill="m.stroke" />
                <text :x="12 - m.labelWidth / 2" y="0" dominant-baseline="central" font-size="12" font-weight="600"
                      fill="currentColor" font-family="ui-monospace, monospace">{{ m.id }}</text>
              </g>
            </g>
          </g>

          <g v-if="hovered && !(detailsOpen && hovered.id === selectedId)" :transform="tooltipTransform" pointer-events="none">
            <rect
              width="160"
              height="72"
              rx="4"
              fill="var(--ui-surface)"
              stroke="var(--ui-border)"
              stroke-width="0.7"
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.15))"
            />
            <text
              x="6" y="14"
              font-size="9"
              font-family="JetBrains Mono, monospace"
              fill="var(--ui-text)"
              font-weight="bold"
            >
              {{ hovered.id }} · {{ hovered.model }}
            </text>
            <text
              x="6" y="28"
              font-size="8"
              font-family="JetBrains Mono, monospace"
              fill="var(--ui-text)"
            >
              <tspan :fill="hovered.stroke">●</tspan> {{ hovered.stateLabel }}
            </text>
            <text
              x="6" y="42"
              font-size="8"
              font-family="JetBrains Mono, monospace"
              fill="var(--ui-muted)"
            >
              battery {{ hovered.battery }}%
            </text>
            <text
              x="6" y="56"
              font-size="8"
              font-family="JetBrains Mono, monospace"
              fill="var(--ui-muted)"
            >
              {{ hovered.mission ? 'mission ' + hovered.mission : 'no mission' }}
            </text>
          </g>
        </svg>

        <div v-if="!activeMap" role="status"
             class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-(color:--ui-muted)">
          <template v-if="mapUnavailable && selectedMapId">
            <span>Map {{ selectedMapId }} is unavailable.</span>
            <NButton size="small" class="pointer-events-auto" @click="loadMap(selectedMapId)">Retry</NButton>
          </template>
          <span v-else-if="selectedMapId">Loading the map…</span>
          <span v-else-if="!selectedId">No maps in fms</span>
        </div>
        <div class="pointer-events-none absolute left-3 right-14 top-3 flex flex-col items-start gap-2">
          <div v-if="routeNotice" role="status" class="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            {{ routeNotice }}
          </div>
          <LiveRobotList :robots="robots.robots" :selected-id="selectedId" @select="selectRobot" />
        </div>
        <div class="absolute right-3 top-3 flex flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <button
            class="grid h-8 w-8 place-items-center border-b border-slate-100 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Zoom in"
            @click="zoomIn"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button
            class="grid h-8 w-8 place-items-center border-b border-slate-100 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Zoom out"
            @click="zoomOut"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
          <button
            class="grid h-8 w-8 place-items-center border-b border-slate-100 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Reset zoom and pan (1:1)"
            @click="zoomReset"
          >
            <span class="text-[9px] font-semibold">1:1</span>
          </button>
          <button
            class="grid h-8 w-8 place-items-center text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Fit to map"
            @click="zoomReset"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/></svg>
          </button>
        </div>

        <div class="pointer-events-none absolute bottom-2 right-3 rounded bg-white/85 px-2 py-0.5 text-[10px] font-mono text-slate-500 shadow dark:bg-slate-900/85 dark:text-slate-400">
          <span v-if="following && selectedMarker">{{ lastReported ? 'Focused on' : 'Following' }} {{ selectedId }} · </span>
          zoom {{ Math.round(zoom * 100) }}% · drag to pan
        </div>
      </div>
    </NCard>

    <NCard v-show="detailsOpen" id="live-map-robot-details" :title="selectedId || 'Robot details'" size="small">
      <template #header-extra>
        <NButton size="small" quaternary aria-label="Hide robot details" @click="closeDetails">Hide</NButton>
      </template>
      <div v-if="!selected" role="status" class="text-sm text-(color:--ui-muted)">
        <span v-if="!selectedId">Click a robot to see full details.</span>
        <span v-else-if="robots.lastPollError">Robot data is unavailable. Reconnecting…</span>
        <span v-else-if="!robots.lastPollAt">Loading robot…</span>
        <span v-else>Robot {{ selectedId }} is no longer in the fleet.</span>
      </div>
      <div v-else class="flex flex-col gap-3 text-sm">
        <div v-if="hasPosition(selected)" class="grid place-items-center rounded bg-slate-100 py-3 dark:bg-slate-800">
          <svg width="96" height="96" viewBox="-42 -42 84 84" role="img" :aria-label="`${selected.id} · ${selectedLook.label}`">
            <MapRobotShape :length="62" :color="selectedLook.color" :rotate="worldAngleToSvgDeg(selected.theta)"
                           :loaded="selected.loads.length > 0" :driving="selected.driving && !lastReported" detailed />
          </svg>
        </div>
        <RobotDiagnostics v-if="detailsOpen" :robot="selected" :mission-snapshot="diagnosticMission"
                          :poll-error="!!robots.lastPollError" />
        <div class="flex justify-between"><span class="text-(color:--ui-muted)">Model</span><span class="font-mono">{{ selected.model }}</span></div>
        <div class="flex justify-between">
          <span class="text-(color:--ui-muted)">State</span>
          <FleetStatusTag :color="selectedLook.color" size="small">{{ selectedLook.label }}</FleetStatusTag>
        </div>
        <details v-if="selected.availability?.reasons?.length" class="text-xs text-(color:--ui-muted)">
          <summary class="cursor-pointer">{{ lastReported ? 'Last reported availability details' : 'Availability details' }}</summary>
          <ul class="mt-1 list-disc pl-5">
            <li v-for="(reason, index) in selected.availability.reasons" :key="index">{{ reason.message || reason.code }}</li>
          </ul>
        </details>
        <div v-if="selected.lastStateAt" class="flex justify-between"><span class="text-(color:--ui-muted)">Battery</span><span class="font-mono">{{ selected.battery }}%{{ selected.charging ? ' ⚡' : '' }}</span></div>
        <template v-if="hasPosition(selected)">
          <div class="flex justify-between gap-2"><span class="text-(color:--ui-muted)">{{ lastReported ? 'Last known position' : 'Position' }}</span><span class="font-mono text-xs">{{ selected.x.toFixed(2) }}, {{ selected.y.toFixed(2) }} m</span></div>
          <div class="flex justify-between"><span class="text-(color:--ui-muted)">Heading</span><span class="font-mono text-xs">{{ ((selected.theta * 180) / Math.PI).toFixed(1) }}°</span></div>
        </template>
        <p v-else class="text-sm text-(color:--ui-muted)">Position unavailable</p>
        <div class="flex justify-between"><span class="text-(color:--ui-muted)">Map</span><span class="font-mono text-xs">{{ selected.mapId || '-' }}</span></div>
        <div class="flex justify-between"><span class="text-(color:--ui-muted)">Last node</span><span class="font-mono text-xs">{{ selected.lastNodeId || '-' }}</span></div>
        <div class="flex flex-wrap justify-between gap-2">
          <span class="text-(color:--ui-muted)">{{ lastReported ? 'Last reported load' : 'Load' }}</span>
          <ul v-if="selected.loads.length" class="min-w-0 space-y-1 text-right text-xs">
            <li v-for="(load, index) in selected.loads" :key="index" class="break-all">
              <div v-if="load.loadId">ID · {{ load.loadId }}</div>
              <div v-if="load.loadType">Type · {{ load.loadType }}</div>
              <span v-if="!load.loadId && !load.loadType">Load reported</span>
            </li>
          </ul>
          <span v-else class="text-xs">No load reported</span>
        </div>
        <div class="flex flex-wrap justify-between gap-2">
          <span class="text-(color:--ui-muted)">{{ lastReported ? 'Last reported mission' : 'Current mission' }}</span>
          <span class="font-mono text-xs">{{ selected.mission || '—' }}</span>
          <RouterLink v-if="selected.mission" :to="{ name: 'missions', query: { missionId: selected.mission } }"
                      class="text-xs text-(color:--ui-link) hover:underline">Open mission</RouterLink>
        </div>
        <template v-if="selectedRoute">
          <div v-if="routesStale" class="text-xs font-medium text-amber-700 dark:text-amber-300">Last known route</div>
          <div class="flex justify-between">
            <span class="text-(color:--ui-muted)">Step</span>
            <span class="font-mono text-xs">{{ selectedRoute.stepIndex + 1 }} → {{ selectedRoute.goals[0] }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-(color:--ui-muted)">Nodes ahead</span>
            <span class="font-mono text-xs">{{ Math.max(0, selectedRoute.released.nodes.length - 1) }}</span>
          </div>
          <div v-if="selectedRoute.nextMissionId" class="flex justify-between">
            <span class="text-(color:--ui-muted)">Next mission</span>
            <span class="font-mono text-xs">{{ selectedRoute.nextMissionId }}</span>
          </div>
        </template>
        <NButton
          size="small"
          :disabled="selected.connection !== 'ONLINE' || !!selected.mission"
          :title="selected.mission ? 'The robot is executing a mission' : 'Tell fms which node the robot is on'"
          @click="showPlace = true"
        >
          Place on node
        </NButton>
      </div>
    </NCard>
    <PlaceRobotDialog v-model:show="showPlace" :robot="selected" />
  </div>
</template>

<style scoped>
/* Контрастный контур подписи остаётся виден и на препятствиях SLAM-подложки. */
.map-label {
  fill: var(--ui-text);
  paint-order: stroke;
  stroke: var(--ui-canvas);
  stroke-width: 1.6px;
  stroke-linejoin: round;
}

/* Поза приходит ~5 раз в секунду (MQTT visualization) — между ними робот доезжает плавно, а не прыгает.
   Только сдвиг: поворот без перехода, иначе при переходе через ±180° робот крутился бы через весь круг */
.robot-marker {
  cursor: pointer;
  transition: transform 200ms linear;
}
.robot-marker.is-followed { transition: none; }
.robot-name { color: color-mix(in srgb, var(--robot-route-color) 58%, var(--ui-text)); }
.robot-mission { color: var(--ui-muted); }
.robot-mission.has-mission { color: var(--ui-link); }
.route-sample {
  display: inline-block;
  width: 1.25rem;
  margin-right: .375rem;
  vertical-align: middle;
  border-top: 2px solid var(--ui-link);
}
.route-sample.awaiting-release { border-top-style: dashed; }
@media (prefers-reduced-motion: reduce) {
  .robot-marker { transition: none; }
}
</style>
