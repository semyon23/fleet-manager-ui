<script setup>
import { RouterLink, useRoute } from 'vue-router'

defineProps({ collapsed: Boolean })
defineEmits(['toggle'])

const route = useRoute()

const primary = [
  { to: '/dashboard', label: 'Dashboard', icon: '□' },
  { to: '/live', label: 'Live Map', icon: '◈' },
  { to: '/maps', label: 'Maps', icon: '✎' },
  { to: '/robots', label: 'Robots', icon: '◉' },
  { to: '/missions', label: 'Missions', icon: '≡' },
  { to: '/alarms', label: 'Alarms', icon: '!' },
]
const secondary = [{ to: '/settings', label: 'Settings', icon: '⚙' }]

const isActive = (to) => route.path === to || route.path.startsWith(`${to}/`)

const linkClass = 'flex h-11 items-center gap-3 rounded-md px-3 text-sm transition'
const idleClass =
  'text-slate-600 hover:bg-brand-50 hover:text-brand-800 dark:text-slate-300 dark:hover:bg-brand-950 dark:hover:text-brand-300'
const activeClass = 'bg-brand-800 text-white'
</script>

<template>
  <aside
    class="flex h-full shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-150 dark:border-slate-800 dark:bg-slate-900"
    :class="collapsed ? 'w-16' : 'w-60'"
  >
    <div class="flex h-14 items-center border-b border-slate-200 px-4 dark:border-slate-800">
      <span v-if="collapsed" class="wordmark w-full text-center text-lg tracking-normal" title="Compass Fleet Control">C</span>
      <div v-else class="flex min-w-0 flex-col gap-1.5" title="Compass Fleet Control">
        <!-- Лого как в Compass: COMPASS │ FLEET/CONTROL -->
        <div class="flex items-center gap-2.5">
          <span class="wordmark text-[15px]">Compass</span>
          <span class="h-[18px] w-0.5 shrink-0 rounded-full bg-accent"></span>
          <span class="text-[8.5px] leading-[1.1] font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
            Fleet<br />Control
          </span>
        </div>
        <span class="truncate text-[11px] leading-none text-slate-500 dark:text-slate-400">Manage your robot fleet</span>
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
        <span class="w-5 shrink-0 text-center font-mono text-base">{{ item.icon }}</span>
        <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="flex flex-col gap-0.5 border-t border-slate-200 p-2 dark:border-slate-800">
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
        :class="[linkClass, 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800']"
        :title="collapsed ? 'Expand menu' : 'Collapse menu'"
        :aria-label="collapsed ? 'Expand menu' : 'Collapse menu'"
        @click="$emit('toggle')"
      >
        <span class="w-5 shrink-0 text-center font-mono text-base">{{ collapsed ? '»' : '«' }}</span>
      </button>
    </div>
  </aside>
</template>
