<script setup>
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { useBackendHealth } from '../composables/useBackendHealth'
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
</script>

<template>
  <header
    class="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-6 dark:border-slate-800 dark:bg-slate-900"
  >
    <div class="flex min-w-0 items-center gap-4">
      <h1 class="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{{ title }}</h1>
    </div>
    <div class="flex items-center gap-3 lg:gap-4">
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
