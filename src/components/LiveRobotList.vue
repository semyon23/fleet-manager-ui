<script setup>
import { computed, ref } from 'vue'
import { availabilityOf } from '../lib/availability'

const props = defineProps({
  robots: { type: Array, required: true },
  selectedId: { type: String, default: null },
})
const emit = defineEmits(['select'])

const open = ref(false)
const query = ref('')
const toggle = ref(null)
const matching = computed(() => {
  const search = query.value.trim().toLowerCase()
  return search ? props.robots.filter(robot => robot.id.toLowerCase().includes(search)) : props.robots
})

function close() {
  open.value = false
  toggle.value?.focus()
}
</script>

<template>
  <div class="pointer-events-auto max-w-full rounded border border-(--ui-border) bg-(--ui-surface) text-(color:--ui-text) shadow-sm"
       @keydown.esc.stop="close">
    <button ref="toggle" type="button" class="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-sm font-medium"
            :aria-expanded="open" aria-controls="live-map-robot-list" @click="open = !open">
      Robots ({{ robots.length }})
      <span aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>
    <div id="live-map-robot-list" v-show="open" class="w-64 max-w-full border-t border-(--ui-border)">
      <template v-if="open">
        <div class="px-2 py-2">
          <input v-model="query" type="search" aria-label="Search robots by ID" placeholder="Search robots by ID"
                 class="w-full rounded border border-(--ui-border) bg-(--ui-canvas) px-2 py-1.5 text-sm" />
        </div>
        <ul v-if="matching.length" class="max-h-[min(16rem,35vh)] overflow-y-auto overscroll-contain px-1 pb-1"
            aria-label="Fleet robots">
          <li v-for="robot in matching" :key="robot.id">
            <button type="button" :aria-pressed="robot.id === selectedId" :title="robot.id"
                    class="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-(--ui-hover)"
                    :class="{ 'bg-(--ui-raised) font-medium': robot.id === selectedId }" @click="emit('select', robot.id)">
              <span aria-hidden="true" class="h-2 w-2 shrink-0 rounded-full" :style="{ background: availabilityOf(robot).color }" />
              <span class="min-w-0 flex-1 truncate font-mono">{{ robot.id }}</span>
              <span class="text-(color:--ui-muted)">{{ availabilityOf(robot).label }}</span>
              <span v-if="robot.lastStateAt" class="w-9 text-right font-mono tabular-nums"
                    :aria-label="`Battery ${robot.battery}%`">{{ robot.battery }}%</span>
            </button>
          </li>
        </ul>
        <p v-else role="status" class="px-3 pb-3 text-xs text-(color:--ui-muted)">
          {{ robots.length ? 'No matching robots' : 'No registered robots' }}
        </p>
      </template>
    </div>
  </div>
</template>
