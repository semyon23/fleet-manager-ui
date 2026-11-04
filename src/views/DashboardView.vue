<script setup>
import { computed, h, onMounted } from 'vue'
import { useRobotsStore } from '../stores/robots'
import { NCard, NDataTable, NEmpty, NButton } from 'naive-ui'
import { RouterLink } from 'vue-router'
import { previewSpriteFor, tintStyle } from '../lib/robotSprite'
import { useTheme } from '../composables/useTheme'
import { AVAILABILITY, availabilityOf } from '../lib/availability'

import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut, Bar } from 'vue-chartjs'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const store = useRobotsStore()
const { isDark } = useTheme()

const kpis = computed(() => [
  { label: 'Total', value: store.byState.total },
  { label: 'Busy', value: store.byState.BUSY || 0 },
  { label: 'Idle', value: store.byState.IDLE || 0 },
  { label: 'Charging', value: store.byState.CHARGING || 0 },
  { label: 'Errors', value: store.byState.ERROR || 0 },
  { label: 'Avg battery', value: `${store.totalBattery}%` },
])

// === Doughnut: сколько роботов в каком состоянии готовности ===
// UNKNOWN — availability ещё не посчитана (робот только что зарегистрирован)
const STATES = [...Object.entries(AVAILABILITY), ['UNKNOWN', availabilityOf(null)]]
const statusData = computed(() => {
  const labels = []
  const data = []
  const colors = []
  for (const [state, { label, color }] of STATES) {
    const n = store.byState[state] || 0
    if (n > 0) { labels.push(label); data.push(n); colors.push(color) }
  }
  return {
    labels,
    datasets: [{ data, backgroundColor: colors, borderColor: isDark.value ? '#0f172a' : '#ffffff', borderWidth: 2 }],
  }
})

const statusOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
  plugins: {
    legend: {
      position: 'right',
      labels: {
        color: isDark.value ? '#cbd5e1' : '#334155',
        boxWidth: 12,
        boxHeight: 12,
        font: { family: 'JetBrains Mono, monospace', size: 11 },
      },
    },
  },
}))

// === Bar: батарея каждого робота ===
const batteryData = computed(() => {
  const items = store.robots.slice(0, 20)  // safety-cap на 20 столбиков
  return {
    labels: items.map((r) => r.id),
    datasets: [{
      label: 'Battery %',
      data: items.map((r) => r.battery),
      backgroundColor: items.map((r) => r.battery < 20 ? '#ef4444' : r.battery < 50 ? '#eab308' : '#22c55e'),
      borderRadius: 4,
    }],
  }
})

const batteryOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: {
      ticks: { color: isDark.value ? '#94a3b8' : '#64748b', font: { family: 'JetBrains Mono, monospace', size: 10 } },
      grid: { display: false },
    },
    y: {
      min: 0, max: 100,
      ticks: {
        color: isDark.value ? '#94a3b8' : '#64748b',
        callback: (v) => `${v}%`,
      },
      grid: { color: isDark.value ? '#1e293b' : '#e2e8f0' },
    },
  },
}))

// === Лента событий: пока пустая, события (тревоги, миссии) fms ещё не отдаёт ===
const events = []
const columns = [
  { title: 'Time', key: 'time', render: (r) => h('span', { class: 'font-mono text-xs text-slate-500' }, r.time) },
  { title: 'Robot', key: 'robot', render: (r) => h('span', { class: 'font-mono text-xs text-brand-800' }, r.robot) },
  { title: 'Event', key: 'text' },
]

// Force reactivity kick после первого mount — чтоб графики нарисовались когда poll долетит.
onMounted(() => {})
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- ================ Top: KPI row ================ -->
    <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <NCard v-for="kpi in kpis" :key="kpi.label" size="small" class="!bg-white dark:!bg-slate-900">
        <div class="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{{ kpi.label }}</div>
        <div class="mt-2 font-mono text-3xl font-bold text-brand-900 dark:text-brand-200">{{ kpi.value }}</div>
      </NCard>
    </div>

    <!-- ================ Charts row ================ -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <NCard title="Availability" size="small" class="!bg-white dark:!bg-slate-900">
        <div v-if="store.byState.total === 0" class="grid place-items-center py-8">
          <NEmpty description="No robots registered yet" size="small">
            <template #extra>
              <RouterLink to="/robots">
                <NButton size="small" type="primary">Register first robot</NButton>
              </RouterLink>
            </template>
          </NEmpty>
        </div>
        <div v-else class="relative h-56">
          <Doughnut :data="statusData" :options="statusOptions" />
        </div>
      </NCard>

      <NCard title="Battery levels" size="small" class="!bg-white dark:!bg-slate-900">
        <div v-if="store.byState.total === 0" class="grid place-items-center py-8">
          <NEmpty description="Register robots to see their battery levels" size="small" />
        </div>
        <div v-else class="relative h-56">
          <Bar :data="batteryData" :options="batteryOptions" />
        </div>
      </NCard>
    </div>

    <!-- ================ Bottom: events + snapshot ================ -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <NCard title="Recent events" size="small" class="lg:col-span-2 !bg-white dark:!bg-slate-900">
        <div v-if="!events.length" class="grid place-items-center py-6">
          <NEmpty description="Fleet events will appear here" size="small" />
        </div>
        <NDataTable v-else :columns="columns" :data="events" :bordered="false" size="small" />
      </NCard>

      <NCard title="Fleet snapshot" size="small" class="!bg-white dark:!bg-slate-900">
        <div v-if="!store.robots.length" class="grid place-items-center py-6">
          <NEmpty description="No robots" size="small" />
        </div>
        <div v-else class="flex flex-col gap-1">
          <div
            v-for="r in store.robots"
            :key="r.id"
            class="flex items-center gap-3 rounded border border-slate-100 dark:border-slate-800 px-2 py-1.5"
          >
            <img
              :src="previewSpriteFor(r)"
              :alt="r.id"
              class="h-8 w-8 object-contain"
              :style="tintStyle(r)"
            />
            <span class="flex-1 font-mono text-xs text-brand-800 dark:text-brand-300">{{ r.id }}</span>
            <span class="flex w-20 items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <span class="h-2 w-2 rounded-full" :style="{ background: availabilityOf(r).color }" />
              {{ availabilityOf(r).label }}
            </span>
            <span class="w-10 text-right font-mono text-xs text-slate-700 dark:text-slate-300">{{ r.battery }}%</span>
          </div>
        </div>
      </NCard>
    </div>
  </div>
</template>
