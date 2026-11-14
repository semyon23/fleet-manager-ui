<script setup>
import { useRoute } from 'vue-router'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useBackendHealth } from '../composables/useBackendHealth'
import { useRobotMqtt } from '../composables/useRobotMqtt'
import { useRobotsStore } from '../stores/robots'
import { livePositionsStatus, LEVEL_COLORS } from '../lib/livePositions'
import AppClock from './AppClock.vue'

const route = useRoute()
const title = computed(() => route.meta?.title || 'Fleet Manager')

// Индикатор соединения возвращён по просьбе Семёна (2026-09-08):
// кружок состояния + latency в мс. Переключатель темы убран — он в Settings.
const health = useBackendHealth()
const healthTitle = computed(() => {
  const parts = [health.label.value]
  if (health.latencyMs.value != null) parts.push(`${health.latencyMs.value} ms`)
  if (health.lastCheckedAt.value) parts.push(`checked ${health.lastCheckedAt.value.toLocaleTimeString()}`)
  return parts.join(' · ')
})

// Живые позы роботов из MQTT: идут ли они на самом деле (пароль, топики), а не только «подключено»
const mqtt = useRobotMqtt()
const robots = useRobotsStore()
const now = ref(Date.now())
let tick = null
onMounted(() => { tick = setInterval(() => { now.value = Date.now() }, 2000) })
onBeforeUnmount(() => clearInterval(tick))
const live = computed(() => livePositionsStatus({
  state: mqtt.state.value,
  lastError: mqtt.lastError.value,
  lastPoseAt: mqtt.lastPoseAt.value,
  onlineRobots: robots.robots.filter((r) => r.connection === 'ONLINE').length,
  hasPassword: !!window.__FLEET_CONFIG__?.mqttPassword,
  prefix: mqtt.topicPrefix(),
  now: now.value,
}))
</script>

<template>
  <header
    class="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-6 dark:border-slate-800 dark:bg-slate-900"
  >
    <div class="flex min-w-0 items-center gap-4">
      <h1 class="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{{ title }}</h1>
    </div>
    <div class="flex items-center gap-3 lg:gap-4">
      <span
        v-if="live.level !== 'off'"
        class="flex cursor-help items-center gap-1.5 font-mono text-xs text-slate-500 dark:text-slate-400"
        :title="live.hint"
      >
        <span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: LEVEL_COLORS[live.level] }" />
        {{ live.label }}
      </span>
      <router-link
        to="/settings"
        class="flex items-center gap-2 font-mono text-xs text-slate-500 hover:text-brand-800 dark:text-slate-400 dark:hover:text-brand-300"
        :title="healthTitle"
      >
        <span
          class="relative inline-block h-2.5 w-2.5 rounded-full"
          :style="{ backgroundColor: health.color.value }"
        >
          <span
            v-if="health.state.value === 'mock' || health.state.value === 'offline'"
            class="absolute inset-0 rounded-full animate-ping"
            :style="{ backgroundColor: health.color.value, opacity: 0.55 }"
          ></span>
        </span>
        <span v-if="health.latencyMs.value != null" class="w-12">{{ health.latencyMs.value }} ms</span>
        <span v-else class="w-12">—</span>
      </router-link>
      <AppClock class="border-l border-slate-200 pl-3 lg:pl-4 dark:border-slate-800" />
    </div>
  </header>
</template>
