<script setup>
import { computed } from 'vue'
import { AVAILABILITY, availabilityOf } from '../lib/availability'

const props = defineProps({
  byState: { type: Object, required: true },
  alarmCount: { type: Number, default: null },
  fleetReady: { type: Boolean, default: false },
  selected: { type: String, default: 'ALL' },
})

const emit = defineEmits(['select'])

const primaryKeys = ['ALL', 'BUSY', 'IDLE', 'CHARGING', 'OFFLINE', 'WITH_ALARMS']
const extraKeys = ['ERROR', 'PAUSED', 'NOT_READY', 'DELETING', 'UNKNOWN']
const statuses = {
  ...AVAILABILITY,
  ALL: { label: 'All robots' },
  WITH_ALARMS: { label: 'With alarms', color: AVAILABILITY.ERROR.color },
  UNKNOWN: availabilityOf(null),
}

function countFor(key) {
  if (!props.fleetReady) return null
  if (key === 'ALL') return props.byState.total
  if (key === 'WITH_ALARMS') return props.alarmCount
  return props.byState[key] || 0
}

const counters = computed(() => {
  const extras = extraKeys.filter((key) => props.byState[key] > 0 || props.selected === key)
  return [...primaryKeys, ...extras].map((key) => ({ key, ...statuses[key], count: countFor(key) }))
})
</script>

<template>
  <div class="fleet-counters" role="group" aria-label="Fleet status filters">
    <button
      v-for="counter in counters"
      :key="counter.key"
      class="fleet-counter"
      type="button"
      :aria-label="`${counter.label} (${counter.count ?? 'count unavailable'})`"
      :aria-pressed="selected === counter.key"
      aria-controls="live-map-robot-list"
      :disabled="counter.count == null"
      @click="emit('select', counter.key)"
    >
      <span
        v-if="counter.color"
        class="state-dot"
        :style="{ backgroundColor: counter.color }"
        aria-hidden="true"
      ></span>
      {{ counter.label }}
      <span class="count">{{ counter.count ?? '—' }}</span>
    </button>
  </div>
</template>

<style scoped>
.fleet-counters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.fleet-counter {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 2rem;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.375rem;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 0.8125rem;
  line-height: 1.25;
  cursor: pointer;
}

.fleet-counter:enabled:hover {
  border-color: var(--ui-primary);
  background: var(--ui-hover);
}

.fleet-counter[aria-pressed='true'] {
  border-color: var(--ui-primary);
  background: color-mix(in srgb, var(--ui-primary) 14%, var(--ui-surface));
  box-shadow: inset 0 -2px var(--ui-primary);
}

.fleet-counter:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.fleet-counter:disabled {
  color: var(--ui-muted);
  cursor: default;
}

.state-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.count {
  min-width: 1ch;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
</style>
