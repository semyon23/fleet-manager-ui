<script setup>
// История миссий: фильтры по состоянию, роботу, карте и периоду (контракт 2.3, 7.2), страницы по курсору.
// Не опрашивается: история — разбор прошлого, оператор обновляет сам.
import { ref, computed, h, onMounted } from 'vue'
import { NDataTable, NButton, NSelect, NDatePicker, NEmpty } from 'naive-ui'
import FleetStatusTag from './FleetStatusTag.vue'
import { useMapsStore } from '../stores/maps'
import { useRobotsStore } from '../stores/robots'
import * as api from '../api'
import { MISSION_STATES, PRIORITIES, stateOf, timingOf, formatDuration } from '../lib/missions'

const emit = defineEmits(['open'])
const maps = useMapsStore()
const robots = useRobotsStore()

const PAGE = 50
const filter = ref({ states: [], robotId: null, mapId: null, period: null })   // period — [from, to] в мс
const items = ref([])
const nextCursor = ref(null)
const loading = ref(false)
const error = ref(null)

function query(before) {
  const f = filter.value
  return {
    state: f.states.join(','),
    robotId: f.robotId,
    mapId: f.mapId,
    from: f.period ? new Date(f.period[0]).toISOString() : null,
    to: f.period ? new Date(f.period[1]).toISOString() : null,
    limit: PAGE,
    before,
  }
}

async function search(more = false) {
  loading.value = true
  try {
    const page = await api.missions.listMissions(query(more ? nextCursor.value : null))
    items.value = more ? [...items.value, ...page.items] : page.items
    nextCursor.value = page.nextCursor
    error.value = null
  } catch (e) {
    error.value = e?.details ? Object.values(e.details).join('; ') : (e?.message || 'Failed to load missions')
  } finally {
    loading.value = false
  }
}
onMounted(() => search())

function reset() {
  filter.value = { states: [], robotId: null, mapId: null, period: null }
  search()
}

const stateOptions = Object.entries(MISSION_STATES).map(([value, { label }]) => ({ label, value }))
const robotOptions = computed(() => robots.robots.map((r) => ({ label: r.id, value: r.id })))
const mapOptions = computed(() => maps.maps.map((m) => ({ label: m.name, value: m.id })))

const columns = [
  {
    title: 'Mission', key: 'id',
    render: (m) => h('button', { class: 'flex flex-col text-left', onClick: () => emit('open', m.id) }, [
      h('span', { class: 'font-mono text-xs text-(color:--ui-link) hover:underline' }, m.id),
      h('span', { class: 'text-xs text-(color:--ui-muted)' }, m.name),
    ]),
  },
  {
    title: 'State', key: 'state', width: 120,
    render: (m) => h(FleetStatusTag, { size: 'small', color: stateOf(m).color }, { default: () => stateOf(m).label }),
  },
  { title: 'Priority', key: 'priority', width: 80, render: (m) => h('span', { class: 'text-xs' }, PRIORITIES[m.priority]?.label || m.priority) },
  { title: 'Robot', key: 'robotId', width: 110, render: (m) => h('span', { class: 'font-mono text-xs' }, m.robotId || '—') },
  { title: 'Map', key: 'mapId', width: 110, render: (m) => h('span', { class: 'font-mono text-xs' }, m.mapId) },
  { title: 'Created', key: 'createdAt', width: 170, render: (m) => h('span', { class: 'text-xs' }, new Date(m.createdAt).toLocaleString()) },
  { title: 'Took', key: 'took', width: 90, render: (m) => h('span', { class: 'font-mono text-xs' }, m.finishedAt ? formatDuration(timingOf(m).total) : '—') },
]
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-end gap-2">
      <NSelect v-model:value="filter.states" :options="stateOptions" multiple clearable placeholder="Any state" size="small" style="width: 220px" />
      <NSelect v-model:value="filter.robotId" :options="robotOptions" filterable tag clearable placeholder="Any robot" size="small" style="width: 150px" />
      <NSelect v-model:value="filter.mapId" :options="mapOptions" clearable placeholder="Any map" size="small" style="width: 150px" />
      <NDatePicker v-model:value="filter.period" type="datetimerange" clearable size="small" style="width: 340px"
                   start-placeholder="From (created)" end-placeholder="To" />
      <NButton size="small" type="primary" :loading="loading" @click="search()">Search</NButton>
      <NButton size="small" tertiary @click="reset">Reset</NButton>
    </div>

    <div v-if="error" class="rounded bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>

    <NEmpty v-if="!items.length && !loading" class="py-6" description="No missions match the filters" />
    <NDataTable v-else :columns="columns" :data="items" :loading="loading" :bordered="false" size="small" :row-key="(m) => m.id" />

    <div v-if="nextCursor" class="flex justify-center">
      <NButton size="small" :loading="loading" @click="search(true)">Load more</NButton>
    </div>
  </div>
</template>
