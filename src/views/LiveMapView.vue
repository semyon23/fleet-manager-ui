<script setup>
import { useRobotsStore } from '../stores/robots'
import { useMapsStore } from '../stores/maps'
import { NCard, NSelect, NButton, NPopover, NCheckbox } from 'naive-ui'
import { ref, shallowRef, computed, watch, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { robotLook, footprintPx } from '../lib/robotLook'
import { createLiveRoutePoller } from '../lib/liveRoutePolling'
import { releasedPoints, plannedPoints, goalPoints, toPolyline } from '../lib/robotRoutes'
import * as api from '../api'
import { stationKindMeta } from '../lib/theme'
import { zoneTypeMeta } from '../lib/vda5050'
import { worldToPixel } from '../lib/nav2meta'
import { worldAngleToSvgDeg } from '../lib/geometry'
import { formatEventTime } from '../lib/journal'
import PlaceRobotDialog from '../components/PlaceRobotDialog.vue'
import MapRobotShape from '../components/MapRobotShape.vue'
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
const lastReported = computed(() => selected.value && (
  selected.value.connection !== 'ONLINE' || selected.value.availability?.state === 'OFFLINE' || !!robots.lastPollError
))

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

// Робот — в реальном масштабе карты, но на экране не меньше 22 px: при отдалении не пропадает в точку
const ROBOT_MIN_SCREEN_PX = 22
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
  { key: 'routes', label: 'Routes from fms (released)' },
  { key: 'planned', label: 'Planned by traffic (waiting for release)' },
  { key: 'goals', label: 'Mission goals' },
  { key: 'robotLabels', label: 'Robot names' },
  { key: 'robotPath', label: 'Path planned by the robot', hint: 'From the robot itself (VDA visualization), if it shares it' },
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

// Маршруты рисуем как дороги (Семён 2026-09-26: "не точки с палками").
// Пара рёбер A→B и B→A — одна двусторонняя дорога с пунктирной осевой,
// одно ребро — односторонняя, с шевронами по ходу движения.
const ROAD_WIDTH = 7        // ширина полотна в пикселях карты
const CHEVRON_STEP = 28     // шаг шевронов на односторонней дороге
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
    const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`
    const cur = pairs.get(key)
    if (cur) { cur.twoWay = cur.twoWay || cur.from !== e.from; continue }
    pairs.set(key, { key, from: e.from, a, b, twoWay: false })
  }
  return [...pairs.values()].map(({ key, a, b, twoWay }) => {
    const x1 = PADDING + a.u
    const y1 = PADDING + a.v
    const x2 = PADDING + b.u
    const y2 = PADDING + b.v
    const len = Math.hypot(x2 - x1, y2 - y1)
    const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
    // Шевроны равномерно по длине, не ближе 8 px к узлам
    const chevrons = []
    if (!twoWay && len > 16) {
      const n = Math.max(1, Math.floor((len - 16) / CHEVRON_STEP))
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1)
        chevrons.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t })
      }
    }
    return { id: key, d: `M ${x1} ${y1} L ${x2} ${y2}`, twoWay, deg, chevrons }
  })
})

// Поза робота — метры карты; на экране — пиксели картинки карты (как узлы), ось Y вниз
const markers = computed(() =>
  filteredRobots.value.map((r) => {
    const { u, v } = worldToPixel(activeMap.value.meta, r.x, r.y, activeMap.value.height)
    const look = robotLook(r)
    return {
      ...r,
      px: PADDING + u,
      py: PADDING + v,
      stroke: look.color,
      stateLabel: look.label,
      labelWidth: 22 + r.id.length * 6.7, // точка состояния, моноширинный ID и поля в экранных пикселях
      rotateDeg: worldAngleToSvgDeg(r.theta),
      route: routeByRobot.value.get(r.id) || null,
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
  return markers.value
    .filter((m) => m.path && (m.path.planned.length > 1 || m.path.intermediate.length > 1))
    .map((m) => ({
      id: m.id,
      planned: toPolyline(m.path.planned.map(toPx)),
      intermediate: toPolyline(m.path.intermediate.map(toPx)),
    }))
})

// Линии маршрутов: выбранный робот — толстая линия поверх остальных, остальные — тонкие
const routeLines = computed(() => {
  if (!showRobotRoutes.value) return []
  return markers.value
    .filter((m) => m.route)
    .map((m) => ({
      id: m.id,
      color: m.stroke,
      selected: m.id === selectedId.value,
      released: toPolyline(releasedPoints(m.route, position,
        routesStale.value ? staleStarts.get(m.id) : { x: m.px, y: m.py })),
      planned: toPolyline(plannedPoints(m.route, position)),
      goals: goalPoints(m.route, position),
    }))
    .sort((a, b) => Number(a.selected) - Number(b.selected))
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

          <!-- Дороги: три прохода по всем рёбрам — кромка, полотно, разметка.
               Сначала все кромки, потом всё полотно: на перекрёстках полотно
               перекрывает кромки соседних дорог, и сеть выглядит цельной. -->
          <g v-if="showRoutes && roads.length" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path v-for="r in roads" :key="'edge-' + r.id" :d="r.d" :stroke-width="ROAD_WIDTH + 2"
                  class="stroke-slate-500 dark:stroke-slate-500" />
            <path v-for="r in roads" :key="'road-' + r.id" :d="r.d" :stroke-width="ROAD_WIDTH"
                  class="stroke-slate-300 dark:stroke-slate-600" />
            <path v-for="r in roads.filter((x) => x.twoWay)" :key="'mid-' + r.id" :d="r.d"
                  stroke-width="0.6" stroke-dasharray="3 3" class="stroke-white dark:stroke-slate-300" />
            <g class="fill-slate-600 dark:fill-slate-300" stroke="none">
              <template v-for="r in roads" :key="'chev-' + r.id">
                <path v-for="(c, i) in r.chevrons" :key="i"
                      :transform="`translate(${c.x} ${c.y}) rotate(${r.deg})`"
                      d="M -1.5 -2.5 L 1.5 0 L -1.5 2.5 L -0.5 0 Z" />
              </template>
            </g>
          </g>

          <!-- Вершины — маленькие точки на полотне, подписи бледные -->
          <g v-if="showRoutes">
            <g v-for="wp in waypoints" :key="wp.id" :transform="`translate(${wp.x} ${wp.y})`">
              <circle r="1.8" stroke-width="0.8" class="fill-white stroke-slate-500 dark:fill-slate-800 dark:stroke-slate-300" />
              <text v-if="layers.nodeLabels" y="-6" text-anchor="middle" font-size="5" font-family="JetBrains Mono, monospace"
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

          <!-- Маршруты роботов: сплошная — разрешено ехать, пунктир — запланировано, ромбы — цели шагов -->
          <g :opacity="routesStale ? 0.45 : 1">
            <g v-for="r in routeLines" :key="'route-' + r.id" fill="none" stroke-linecap="round" stroke-linejoin="round"
               pointer-events="none" :opacity="r.selected || !selectedId ? 0.9 : 0.45">
              <polyline v-if="layers.routes && r.released" :points="r.released" :stroke="r.color"
                        :stroke-width="r.selected ? robotSize.width * 0.35 : 1.5" />
              <polyline v-if="layers.planned && r.planned" :points="r.planned" :stroke="r.color"
                        :stroke-width="r.selected ? robotSize.width * 0.2 : 1" stroke-dasharray="4 3" />
              <rect v-for="goal in (layers.goals ? r.goals : [])" :key="goal.id"
                    :x="goal.x - 4" :y="goal.y - 4" width="8" height="8"
                    :transform="`rotate(45 ${goal.x} ${goal.y})`"
                    :stroke="r.color" :stroke-width="r.selected ? 1.8 : 1" class="fill-white dark:fill-slate-900" />
            </g>
          </g>

          <!-- Путь робота: длинный (plannedPath) — пунктир, ближний (intermediatePath) — сплошная -->
          <g v-for="p in robotPaths" :key="'path-' + p.id" fill="none" stroke="var(--ui-link)" stroke-linecap="round"
             stroke-linejoin="round" pointer-events="none">
            <polyline v-if="p.planned" :points="p.planned" :stroke-width="2 * perScreenPx"
                      :stroke-dasharray="`${6 * perScreenPx} ${4 * perScreenPx}`" opacity="0.8" />
            <polyline v-if="p.intermediate" :points="p.intermediate" :stroke-width="3.5 * perScreenPx" opacity="0.9" />
          </g>

          <g
            v-for="m in markersInDrawOrder"
            :key="m.id"
            class="robot-marker"
            :class="{ 'is-followed': following && m.id === selectedId }"
            :style="{ transform: `translate(${m.px}px, ${m.py}px)` }"
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
            />
            <!-- Имя — на подложке и одного размера на экране при любом zoom -->
            <g v-if="layers.robotLabels"
               :transform="`translate(0 ${robotSize.length * 0.75 + 10 * perScreenPx}) scale(${perScreenPx})`">
              <rect :x="-m.labelWidth / 2" y="-8" :width="m.labelWidth" height="16" rx="4"
                    :fill="m.id === selectedId ? 'var(--ui-link)' : 'var(--ui-surface)'"
                    :stroke="m.id === selectedId ? 'var(--ui-link)' : 'var(--ui-border)'" />
              <circle :cx="8 - m.labelWidth / 2" cy="0" r="3.5" :fill="m.stroke" />
              <text :x="15 - m.labelWidth / 2" y="0" dominant-baseline="central" font-size="11"
                    :fill="m.id === selectedId ? 'var(--ui-canvas)' : 'var(--ui-text)'"
                    font-family="ui-monospace, monospace">{{ m.id }}</text>
            </g>
          </g>

          <g v-if="hovered" :transform="tooltipTransform" pointer-events="none">
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
        <div role="status" class="pointer-events-none absolute left-3 right-14 top-3">
          <span v-if="routeNotice" class="inline-block rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            {{ routeNotice }}
          </span>
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
            <MapRobotShape :length="62" :color="selectedLook.color" :rotate="worldAngleToSvgDeg(selected.theta)" detailed />
          </svg>
        </div>
        <div class="flex justify-between"><span class="text-(color:--ui-muted)">Model</span><span class="font-mono">{{ selected.model }}</span></div>
        <div class="flex justify-between">
          <span class="text-(color:--ui-muted)">State</span>
          <FleetStatusTag :color="selectedLook.color" size="small">{{ selectedLook.label }}</FleetStatusTag>
        </div>
        <ul v-if="selected.availability?.reasons?.length" class="list-disc pl-5 text-xs text-slate-500 dark:text-slate-400">
          <li v-for="reason in selected.availability.reasons" :key="reason.code">{{ reason.message }}</li>
        </ul>
        <div v-if="selected.lastStateAt" class="flex justify-between"><span class="text-(color:--ui-muted)">Battery</span><span class="font-mono">{{ selected.battery }}%{{ selected.charging ? ' ⚡' : '' }}</span></div>
        <template v-if="hasPosition(selected)">
          <div class="flex justify-between gap-2"><span class="text-(color:--ui-muted)">{{ lastReported ? 'Last known position' : 'Position' }}</span><span class="font-mono text-xs">{{ selected.x.toFixed(2) }}, {{ selected.y.toFixed(2) }} m</span></div>
          <div class="flex justify-between"><span class="text-(color:--ui-muted)">Heading</span><span class="font-mono text-xs">{{ ((selected.theta * 180) / Math.PI).toFixed(1) }}°</span></div>
        </template>
        <p v-else class="text-sm text-(color:--ui-muted)">Position unavailable</p>
        <div class="flex flex-wrap justify-between gap-1">
          <span class="text-(color:--ui-muted)">Last state received</span>
          <time v-if="selected.lastStateAt" :datetime="selected.lastStateAt" class="font-mono text-xs">{{ formatEventTime(selected.lastStateAt) }}</time>
          <span v-else>—</span>
        </div>
        <div class="flex justify-between"><span class="text-(color:--ui-muted)">Map</span><span class="font-mono text-xs">{{ selected.mapId || '-' }}</span></div>
        <div class="flex justify-between"><span class="text-(color:--ui-muted)">Last node</span><span class="font-mono text-xs">{{ selected.lastNodeId || '-' }}</span></div>
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
@media (prefers-reduced-motion: reduce) {
  .robot-marker { transition: none; }
}
</style>
