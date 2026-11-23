<script setup>
// Лента журнала (контракт 8.4): страница Events, карточка робота, Dashboard.
// Фиксированные фильтры (robotId и т.п.) — пропсами; withFilters — показать фильтры оператора.
// Первая страница обновляется раз в 5 с (9.1); подгрузили ещё — опрос стоит, чтобы список не прыгал.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { NButton, NSelect, NDatePicker, NEmpty } from 'naive-ui'
import * as api from '../api'
import { formatJournalEvent, SOURCES } from '../lib/journal'
import { useRobotsStore } from '../stores/robots'

const props = defineProps({
  robotId: { type: String, default: null },
  missionId: { type: String, default: null },
  alarmId: { type: String, default: null },
  limit: { type: Number, default: 50 },
  withFilters: { type: Boolean, default: false },
  more: { type: Boolean, default: true },        // кнопка «Load more»
})
const emit = defineEmits(['open-mission'])
const robots = useRobotsStore()

const filter = ref({ sources: [], robotId: null, period: null })
const items = ref([])
const nextCursor = ref(null)
const pages = ref(1)
const loading = ref(false)
const error = ref(null)

function query(before) {
  const f = filter.value
  return {
    source: f.sources.join(','),
    robotId: props.robotId || f.robotId,
    missionId: props.missionId,
    alarmId: props.alarmId,
    from: f.period ? new Date(f.period[0]).toISOString() : null,
    to: f.period ? new Date(f.period[1]).toISOString() : null,
    limit: props.limit,
    before,
  }
}

async function load(more = false) {
  if (!more && typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  loading.value = true
  try {
    const page = await api.events.listEvents(query(more ? nextCursor.value : null))
    items.value = more ? [...items.value, ...page.items] : page.items
    nextCursor.value = page.nextCursor
    pages.value = more ? pages.value + 1 : 1
    error.value = null
  } catch (e) {
    error.value = e?.details ? Object.values(e.details).join('; ') : (e?.message || 'Failed to load the journal')
  } finally {
    loading.value = false
  }
}

let timer = null
onMounted(() => {
  load()
  timer = setInterval(() => { if (pages.value === 1 && !filter.value.period) load() }, 5000)
})
onBeforeUnmount(() => clearInterval(timer))
watch(() => [props.robotId, props.missionId, props.alarmId], () => load())

const sourceOptions = SOURCES.map((s) => ({ label: s.charAt(0) + s.slice(1).toLowerCase(), value: s }))
const robotOptions = computed(() => robots.robots.map((r) => ({ label: r.id, value: r.id })))

const lines = computed(() => items.value.map((e) => ({ ...e, ...formatJournalEvent(e) })))

// Сегодня — только время, иначе дата и время
function when(iso) {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString() : d.toLocaleString()
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="withFilters" class="flex flex-wrap items-end gap-2">
      <NSelect v-model:value="filter.sources" :options="sourceOptions" multiple clearable placeholder="Any source" size="small" style="width: 220px" />
      <NSelect v-if="!robotId" v-model:value="filter.robotId" :options="robotOptions" filterable tag clearable placeholder="Any robot" size="small" style="width: 150px" />
      <NDatePicker v-model:value="filter.period" type="datetimerange" clearable size="small" style="width: 340px"
                   start-placeholder="From" end-placeholder="To" />
      <NButton size="small" type="primary" :loading="loading" @click="load()">Search</NButton>
    </div>

    <div v-if="error" class="rounded bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>

    <NEmpty v-if="!lines.length && !loading" size="small" description="Nothing in the journal yet" class="py-4" />
    <ol v-else class="flex flex-col">
      <li v-for="line in lines" :key="line.id"
          class="flex items-start gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800">
        <span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: line.color }" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="font-medium">{{ line.title }}</span>
            <span v-if="line.robotId && !robotId" class="font-mono text-xs text-brand-800 dark:text-brand-300">{{ line.robotId }}</span>
            <button v-if="line.missionId && !missionId" class="font-mono text-xs text-(color:--ui-link) hover:underline"
                    @click="emit('open-mission', line.missionId)">{{ line.missionId }}</button>
          </div>
          <div v-if="line.detail" class="truncate text-xs text-(color:--ui-muted)" :title="line.detail">{{ line.detail }}</div>
        </div>
        <span class="shrink-0 font-mono text-[11px] text-(color:--ui-muted)">{{ when(line.at) }}</span>
      </li>
    </ol>

    <div v-if="more && nextCursor" class="flex justify-center">
      <NButton size="small" :loading="loading" @click="load(true)">Load more</NButton>
    </div>
  </div>
</template>
