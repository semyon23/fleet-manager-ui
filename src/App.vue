<script setup>
import { NConfigProvider, NMessageProvider, darkTheme } from 'naive-ui'
import { onMounted, onBeforeUnmount, computed, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import { useRobotsStore } from './stores/robots'
import { useTheme } from './composables/useTheme'
import { useBackendHealth } from './composables/useBackendHealth'
import { useRobotMqtt } from './composables/useRobotMqtt'

const robots = useRobotsStore()
const { isDark } = useTheme()
const naiveTheme = computed(() => (isDark.value ? darkTheme : null))
const health = useBackendHealth()
const robotMqtt = useRobotMqtt()

// Как в Compass: на экранах уже 1280 px меню по умолчанию свёрнуто до иконок.
const wide = useMediaQuery('(min-width: 1280px)')
const collapsed = ref(!wide.value)
watch(wide, (w) => (collapsed.value = !w))

onMounted(() => {
  // Глобальный опрос GET /fms/robots раз в 5 с: всё, что считает fms (статус, готовность, миссия).
  robots.startPolling()
  // Health-ping /api/health каждые 3 сек — sidebar footer показывает индикатор.
  health.startPing()
  // MQTT over WS: живая поза и связь роботов напрямую от брокера. Подписки следуют за списком
  // роботов из опроса. Пустой mqttUrl в config.js или mock-режим → выключено.
  // WebSocket fms убран (контракт v2): всё остальное — опросом REST.
  robotMqtt.connect()
})
onBeforeUnmount(() => {
  robots.stopPolling()
  health.stopPing()
  robotMqtt.disconnect()
})
</script>

<template>
  <NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <div class="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <AppSidebar :collapsed="collapsed" @toggle="collapsed = !collapsed" />
        <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppTopbar />
          <main class="flex-1 overflow-auto bg-slate-50 p-6 dark:bg-slate-950">
            <RouterView />
          </main>
        </div>
      </div>
    </NMessageProvider>
  </NConfigProvider>
</template>

<script>
const themeOverrides = {
  common: {
    primaryColor: '#1e40af',
    primaryColorHover: '#1d4ed8',
    primaryColorPressed: '#1e3a8a',
    primaryColorSuppl: '#3b82f6',
    borderRadius: '6px',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontFamilyMono: 'JetBrains Mono, ui-monospace, monospace',
  },
}
export default { themeOverrides }
</script>

