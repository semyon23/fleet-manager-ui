<script setup>
import { computed } from 'vue'
import { diagnoseRobot } from '../lib/robotDiagnostics'
import { formatEventTime } from '../lib/journal'

const props = defineProps({
  robot: { type: Object, required: true },
  missionSnapshot: { type: Object, required: true },
  pollError: Boolean,
})

const diagnosis = computed(() => diagnoseRobot(props.robot, props.missionSnapshot.mission, { pollError: props.pollError }))
const missionNotice = computed(() => {
  if (diagnosis.value.kind !== 'unexplained') return ''
  if (props.missionSnapshot.status === 'loading') return 'Checking the current mission step…'
  if (props.missionSnapshot.status === 'unavailable') return 'Current mission details unavailable'
  return ''
})
</script>

<template>
  <section aria-labelledby="live-robot-diagnostics" class="min-w-0 rounded border border-(--ui-border) bg-(--ui-canvas) p-3">
    <h3 id="live-robot-diagnostics" class="text-xs font-medium text-(color:--ui-muted)">Robot diagnostics</h3>
    <p class="mt-1 text-sm font-semibold" aria-live="polite">{{ missionNotice || diagnosis.title }}</p>
    <p v-if="diagnosis.detail" class="mt-1 text-xs wrap-anywhere">{{ diagnosis.detail }}</p>

    <ul v-if="diagnosis.errors.length" aria-label="Errors reported by the robot" class="mt-2 space-y-2">
      <li v-for="(error, index) in diagnosis.errors" :key="index" class="border-t border-(--ui-border) pt-2 text-xs wrap-anywhere">
        <div class="flex flex-wrap items-baseline justify-between gap-x-2">
          <span class="font-mono font-medium">{{ error.errorType }}</span>
          <span class="text-(color:--ui-muted)">{{ error.level }}</span>
        </div>
        <p v-if="error.description" class="mt-1">{{ error.description }}</p>
        <p v-if="error.hint" class="mt-1"><span class="font-medium">Robot hint</span> · {{ error.hint }}</p>
        <details v-if="error.references && Object.keys(error.references).length" class="mt-1">
          <summary class="cursor-pointer text-(color:--ui-muted)">Error references</summary>
          <dl>
            <div v-for="(value, name) in error.references" :key="name" class="flex flex-wrap justify-between gap-x-2">
              <dt>{{ name }}</dt><dd class="font-mono">{{ value }}</dd>
            </div>
          </dl>
        </details>
      </li>
    </ul>

    <dl class="mt-2 space-y-1 border-t border-(--ui-border) pt-2 text-xs">
      <div v-if="!missionNotice" class="flex flex-wrap justify-between gap-x-2">
        <dt class="text-(color:--ui-muted)">Source</dt><dd>{{ diagnosis.source }}</dd>
      </div>
      <div v-if="diagnosis.source === 'FMS mission' && diagnosis.at" class="flex flex-wrap justify-between gap-x-2">
        <dt class="text-(color:--ui-muted)">Mission updated</dt>
        <dd><time :datetime="diagnosis.at" class="tabular-nums">{{ formatEventTime(diagnosis.at) }}</time></dd>
      </div>
      <div class="flex flex-wrap justify-between gap-x-2">
        <dt class="text-(color:--ui-muted)">Last state received</dt>
        <dd>
          <time v-if="robot.lastStateAt" :datetime="robot.lastStateAt" class="tabular-nums">{{ formatEventTime(robot.lastStateAt) }}</time>
          <span v-else>—</span>
        </dd>
      </div>
    </dl>
  </section>
</template>
