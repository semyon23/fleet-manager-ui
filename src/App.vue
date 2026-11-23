<script setup>
import { NConfigProvider, NMessageProvider, NDialogProvider, darkTheme } from 'naive-ui'
import { onMounted, onBeforeUnmount, computed, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import { useRobotsStore } from './stores/robots'
import { useMapsStore } from './stores/maps'
import { useAlarmsStore } from './stores/alarms'
import { useTheme } from './composables/useTheme'
import { useBackendHealth } from './composables/useBackendHealth'
import { useRobotMqtt } from './composables/useRobotMqtt'

const robots = useRobotsStore()
const { palette } = useTheme()
const naiveTheme = computed(() => {
  const { dark, canvas, surface, raised, hover, text, muted, border, primary,
    primaryHover, primaryPressed, onPrimary, link } = palette.value

  return {
    base: dark ? darkTheme : null,
    overrides: {
      common: {
        baseColor: onPrimary,
        primaryColor: primary,
        primaryColorHover: primaryHover,
        primaryColorPressed: primaryPressed,
        primaryColorSuppl: primary,
        infoColor: link,
        bodyColor: canvas,
        cardColor: surface,
        tableColor: surface,
        modalColor: surface,
        popoverColor: raised,
        inputColor: dark ? canvas : surface,
        actionColor: raised,
        tableHeaderColor: raised,
        tableColorHover: hover,
        tableColorStriped: canvas,
        tabColor: raised,
        tagColor: raised,
        hoverColor: hover,
        borderColor: border,
        dividerColor: border,
        textColorBase: text,
        textColor1: text,
        textColor2: text,
        textColor3: muted,
        placeholderColor: muted,
        borderRadius: '6px',
        fontFamily: 'var(--font-sans)',
        fontFamilyMono: 'var(--font-mono)',
      },
      Input: { border: `1px solid ${border}` },
      InternalSelection: { border: `1px solid ${border}` },
      Switch: { railColor: muted, buttonColor: onPrimary },
    },
  }
})
const health = useBackendHealth()
const robotMqtt = useRobotMqtt()

// Как в Compass: на экранах уже 1280 px меню по умолчанию свёрнуто до иконок.
const wide = useMediaQuery('(min-width: 1280px)')
const collapsed = ref(!wide.value)
watch(wide, (w) => (collapsed.value = !w))

onMounted(() => {
  // Глобальный опрос GET /fms/robots раз в 5 с: всё, что считает fms (статус, готовность, миссия).
  robots.startPolling()
  // Открытые тревоги раз в 5 с: значок в шапке виден на любой странице (контракт 8.3)
  useAlarmsStore().startPolling()
  // Список карт — один раз: меняются редко, экран Maps перечитывает его сам
  useMapsStore().load().catch((e) => console.warn('[maps] list not loaded:', e.message))
  // Health-ping /api/health каждые 3 сек — sidebar footer показывает индикатор.
  health.startPing()
  // MQTT over WS: живая поза и связь роботов напрямую от брокера. Подписки следуют за списком
  // роботов из опроса. Пустой mqttUrl в config.js или mock-режим → выключено.
  // WebSocket fms убран (контракт v2): всё остальное — опросом REST.
  robotMqtt.connect()
})
onBeforeUnmount(() => {
  robots.stopPolling()
  useAlarmsStore().stopPolling()
  health.stopPing()
  robotMqtt.disconnect()
})
</script>

<template>
  <NConfigProvider :theme="naiveTheme.base" :theme-overrides="naiveTheme.overrides">
    <NMessageProvider>
    <NDialogProvider>
      <div class="flex h-screen w-screen overflow-hidden bg-(--ui-canvas) text-(color:--ui-text)">
        <AppSidebar :collapsed="collapsed" @toggle="collapsed = !collapsed" />
        <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppTopbar />
          <main class="flex-1 overflow-auto p-6">
            <RouterView />
          </main>
        </div>
      </div>
    </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

