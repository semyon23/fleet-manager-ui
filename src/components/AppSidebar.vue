<script setup>
import { RouterLink, useRoute } from 'vue-router'
import { useAlarmsStore } from '../stores/alarms'
import FleetStatusTag from './FleetStatusTag.vue'

defineProps({ collapsed: Boolean })
defineEmits(['toggle'])

const route = useRoute()
const alarms = useAlarmsStore()

const primary = [
  { to: '/dashboard', label: 'Dashboard', icon: '□' },
  { to: '/live', label: 'Live Map', icon: '◈' },
  { to: '/maps', label: 'Maps', icon: '✎' },
  { to: '/robots', label: 'Robots', icon: '◉' },
  { to: '/missions', label: 'Missions', icon: '≡' },
  { to: '/events', label: 'Events', icon: '!' },
]
const secondary = [{ to: '/settings', label: 'Settings', icon: '⚙' }]

const isActive = (to) => route.path === to || route.path.startsWith(`${to}/`)

const linkClass = 'flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-(color:--ui-link)'
const idleClass = 'text-(color:--ui-muted) hover:bg-(--ui-hover) hover:text-(color:--ui-text)'
const activeClass = 'bg-(--ui-primary) font-semibold text-(color:--ui-on-primary)'
</script>

<template>
  <aside
    class="flex h-full shrink-0 flex-col border-r border-(--ui-border) bg-(--ui-surface) transition-[width] duration-150"
    :class="collapsed ? 'w-16' : 'w-60'"
  >
    <div class="flex h-14 items-center border-b border-(--ui-border) px-4">
      <span v-if="collapsed" class="wordmark w-full text-center text-lg tracking-normal" title="Compass Fleet Control">C</span>
      <div v-else class="flex min-w-0 flex-col gap-1.5" title="Compass Fleet Control">
        <!-- Лого как в Compass: COMPASS │ FLEET/CONTROL -->
        <div class="flex items-center gap-2.5">
          <span class="wordmark text-[15px]">Compass</span>
          <span class="h-[18px] w-0.5 shrink-0 rounded-full bg-accent"></span>
          <span class="text-[8.5px] leading-[1.1] font-semibold tracking-[0.18em] text-(color:--ui-muted) uppercase">
            Fleet<br />Control
          </span>
        </div>
        <span class="truncate text-[11px] leading-none text-(color:--ui-muted)">Manage your robot fleet</span>
      </div>
    </div>

    <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      <RouterLink
        v-for="item in primary"
        :key="item.to"
        :to="item.to"
        :class="[linkClass, isActive(item.to) ? activeClass : idleClass]"
        :title="collapsed ? item.label : undefined"
      >
        <span class="relative w-5 shrink-0 text-center font-mono text-base">
          {{ item.icon }}
          <!-- Неподтверждённые тревоги — точка цвета самой серьёзной (контракт 8.3) -->
          <span v-if="item.to === '/events' && alarms.badge && collapsed"
                class="absolute -right-1 -top-0.5 h-2 w-2 rounded-full" :style="{ background: alarms.badge.color }" />
        </span>
        <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
        <FleetStatusTag v-if="item.to === '/events' && alarms.badge && !collapsed"
                       class="ml-auto font-mono" size="tiny" :color="alarms.badge.color">
          {{ alarms.badge.count }}
        </FleetStatusTag>
      </RouterLink>
    </nav>

    <div class="flex flex-col gap-0.5 border-t border-(--ui-border) p-2">
      <RouterLink
        v-for="item in secondary"
        :key="item.to"
        :to="item.to"
        :class="[linkClass, isActive(item.to) ? activeClass : idleClass]"
        :title="collapsed ? item.label : undefined"
      >
        <span class="w-5 shrink-0 text-center font-mono text-base">{{ item.icon }}</span>
        <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
      </RouterLink>
      <button
        type="button"
        :class="[linkClass, idleClass]"
        :title="collapsed ? 'Expand menu' : 'Collapse menu'"
        :aria-label="collapsed ? 'Expand menu' : 'Collapse menu'"
        @click="$emit('toggle')"
      >
        <span class="w-5 shrink-0 text-center font-mono text-base">{{ collapsed ? '»' : '«' }}</span>
      </button>
    </div>
  </aside>
</template>
